import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ObjectStorageService } from "./objectStorage";
import { isLocalUri, resolveLocalPath } from "./localStorage";
import { logger } from "./logger";

export type Classification =
  | "glucose_reading"
  | "blood_pressure_reading"
  | "weight_reading"
  | "meal_event"
  | "workout_event"
  | "unknown";

// Vision-capable Claude models the user may pick for analysis. The first entry
// is the default. Keep this list in sync with the picker in the frontend
// settings page (artifacts/health-digit/src/pages/settings.tsx).
export const ANALYSIS_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

export type AnalysisModel = (typeof ANALYSIS_MODELS)[number];

export const DEFAULT_ANALYSIS_MODEL: AnalysisModel = "claude-opus-4-8";

export function isAnalysisModel(value: unknown): value is AnalysisModel {
  return typeof value === "string" && (ANALYSIS_MODELS as readonly string[]).includes(value);
}

export interface AnalysisResult {
  classification: Classification;
  confidence: number;
  summary: string;
  capturedAt?: string;
  data: {
    events?: Array<{
      eventType: string;
      eventTime?: string;
      value?: number;
      unit?: string;
      systolic?: number;
      diastolic?: number;
      notes?: string;
    }>;
    meals?: Array<{
      name?: string;
      mealTime?: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      mealType?: string;
      foods?: string;
      notes?: string;
    }>;
    workouts?: Array<{
      workoutType?: string;
      workoutTime?: string;
      duration?: number;
      averageHeartRate?: number;
      maxHeartRate?: number;
      calories?: number;
      distance?: number;
      pace?: number;
      heartRateZones?: Record<string, number>;
      notes?: string;
    }>;
  };
}

function buildSystemPrompt(nowIso: string, todayDate: string): string {
  return `You are an expert health data extraction assistant. You will be shown a screenshot from a health, fitness, food, or wearable app. Your job is to:

1. Classify the screenshot into exactly one of these categories:
   - "glucose_reading" — blood glucose / continuous glucose monitor readings
   - "blood_pressure_reading" — blood pressure measurements (systolic/diastolic)
   - "weight_reading" — body weight or scale measurements
   - "meal_event" — food logging, calorie tracking, nutrition entries
   - "workout_event" — exercise sessions, runs, rides, gym workouts, heart rate zones
   - "unknown" — anything you cannot confidently identify

2. Extract structured data from the image.

3. Return STRICT JSON matching this TypeScript schema (no prose, no markdown fences):

{
  "classification": "<one of the 6 categories above>",
  "confidence": <number between 0 and 1 — your confidence in the classification>,
  "summary": "<one or two sentence human-readable summary of what's in the image>",
  "capturedAt": "<ISO datetime string representing when the screenshot was taken — see capturedAt rules below>",
  "data": {
    "events": [ { "eventType": string, "eventTime"?: ISO string, "value"?: number, "unit"?: string, "systolic"?: number, "diastolic"?: number, "notes"?: string } ],
    "meals":  [ { "name"?: string, "mealTime"?: ISO string, "calories"?: number, "protein"?: number, "carbs"?: number, "fat"?: number, "fiber"?: number, "mealType"?: string, "foods"?: string, "notes"?: string } ],
    "workouts": [ { "workoutType"?: string, "workoutTime"?: ISO string, "duration"?: number (minutes), "averageHeartRate"?: number, "maxHeartRate"?: number, "calories"?: number, "distance"?: number (km), "pace"?: number, "heartRateZones"?: { "zone1"?: number, "zone2"?: number, "zone3"?: number, "zone4"?: number, "zone5"?: number }, "notes"?: string } ]
  }
}

Context for this request:
- Current date/time (server clock): ${nowIso}
- Today's date: ${todayDate}

Rules:
- Only include the array(s) relevant to the classification. For glucose/BP/weight use "events". For meals use "meals". For workouts use "workouts".
- For blood pressure events: set "eventType" to "blood_pressure_reading" and populate "systolic" and "diastolic" (do not set "value").
- For glucose: set "eventType" to "glucose_reading", "value" to the reading, "unit" to mg/dL or mmol/L.
- For weight: set "eventType" to "weight_reading", "value" to the weight, "unit" to kg or lb.
- For "capturedAt" (the moment the screenshot was taken) use this priority order:
  1. **Phone status bar clock** — the time at the very top of the screenshot, outside any app UI, usually in the top-left corner next to signal/battery indicators. This is the most reliable timestamp. Combine it with today's date (${todayDate}) unless the image also shows a different calendar date.
  2. **Explicit recording date/time the app displays** for the thing being shown (e.g. "Sunday, Apr 19, 2026 02:42 PM" on a workout summary page).
  3. Do **NOT** use log-entry timestamps, historical data points, or in-app "Today" labels.
  If only a time is visible (e.g. the status bar shows "11:32"), combine that time with today's date (${todayDate}) and emit the result as a full ISO datetime. Omit "capturedAt" entirely only if no clock or timestamp of any kind is visible.
- If you cannot read the image or it is not health-related, classify as "unknown" with confidence < 0.5 and an empty data object: { }.
- Confidence should reflect how certain you are about the classification given what's actually visible. Don't inflate.
- Output JSON only — no commentary, no code fences.`;
}

const VALID_CLASSIFICATIONS = new Set<Classification>([
  "glucose_reading",
  "blood_pressure_reading",
  "weight_reading",
  "meal_event",
  "workout_event",
  "unknown",
]);

function unknownResult(summary: string): AnalysisResult {
  return {
    classification: "unknown",
    confidence: 0.0,
    summary,
    data: {},
  };
}

function getClient(): Anthropic | null {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  return new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

async function fetchImageAsBase64(
  filePath: string
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }> {
  if (isLocalUri(filePath)) {
    const fullPath = resolveLocalPath(filePath);
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (ext === ".png") mediaType = "image/png";
    else if (ext === ".gif") mediaType = "image/gif";
    else if (ext === ".webp") mediaType = "image/webp";
    return { base64: buffer.toString("base64"), mediaType };
  }

  const storageService = new ObjectStorageService();
  const objectFile = await storageService.getObjectEntityFile(filePath);
  const [buffer] = await objectFile.download();
  const [metadata] = await objectFile.getMetadata();
  const contentType = (metadata.contentType as string) || "image/jpeg";

  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (contentType.includes("png")) mediaType = "image/png";
  else if (contentType.includes("gif")) mediaType = "image/gif";
  else if (contentType.includes("webp")) mediaType = "image/webp";

  return { base64: buffer.toString("base64"), mediaType };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error("No JSON object found in model response");
  }
}

function normalizeResult(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object") {
    return unknownResult("Model returned no parseable result.");
  }
  const r = raw as Record<string, unknown>;
  const classification = VALID_CLASSIFICATIONS.has(r.classification as Classification)
    ? (r.classification as Classification)
    : "unknown";
  const confidenceRaw = typeof r.confidence === "number" ? r.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));
  const summary = typeof r.summary === "string" ? r.summary : "";
  const capturedAt = typeof r.capturedAt === "string" && r.capturedAt ? r.capturedAt : undefined;
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as AnalysisResult["data"];

  return { classification, confidence, summary, capturedAt, data };
}

export async function analyzeScreenshot(
  filePath: string,
  model: AnalysisModel = DEFAULT_ANALYSIS_MODEL
): Promise<AnalysisResult> {
  const activeModel: AnalysisModel = isAnalysisModel(model) ? model : DEFAULT_ANALYSIS_MODEL;
  logger.info({ filePath, model: activeModel }, "Running screenshot analysis");

  const client = getClient();
  if (!client) {
    logger.warn("Anthropic AI integration env vars missing; returning unknown result");
    return unknownResult("Analysis service is not configured.");
  }

  let image: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" };
  try {
    image = await fetchImageAsBase64(filePath);
  } catch (err) {
    logger.error({ err, filePath }, "Failed to load image for analysis");
    return unknownResult("Could not load the uploaded image.");
  }

  try {
    const now = new Date();
    const systemPrompt = buildSystemPrompt(now.toISOString(), now.toISOString().slice(0, 10));
    const message = await client.messages.create({
      model: activeModel,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType,
                data: image.base64,
              },
            },
            {
              type: "text",
              text: "Analyze this screenshot and return the JSON described in the system prompt.",
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    if (!text) {
      logger.warn("Model returned no text content");
      return unknownResult("Model returned an empty response.");
    }

    const parsed = extractJson(text);
    const result = normalizeResult(parsed);
    logger.info(
      { classification: result.classification, confidence: result.confidence },
      "Analysis complete"
    );
    return result;
  } catch (err) {
    logger.error({ err, filePath }, "LLM analysis failed");
    return unknownResult("Analysis failed. Please retry.");
  }
}
