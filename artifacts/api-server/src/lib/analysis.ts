import Anthropic from "@anthropic-ai/sdk";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

export type Classification =
  | "glucose_reading"
  | "blood_pressure_reading"
  | "weight_reading"
  | "meal_event"
  | "workout_event"
  | "unknown";

export interface AnalysisResult {
  classification: Classification;
  confidence: number;
  summary: string;
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

const SYSTEM_PROMPT = `You are an expert health data extraction assistant. You will be shown a screenshot from a health, fitness, food, or wearable app. Your job is to:

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
  "data": {
    "events": [ { "eventType": string, "eventTime"?: ISO string, "value"?: number, "unit"?: string, "systolic"?: number, "diastolic"?: number, "notes"?: string } ],
    "meals":  [ { "name"?: string, "mealTime"?: ISO string, "calories"?: number, "protein"?: number, "carbs"?: number, "fat"?: number, "fiber"?: number, "mealType"?: string, "foods"?: string, "notes"?: string } ],
    "workouts": [ { "workoutType"?: string, "workoutTime"?: ISO string, "duration"?: number (minutes), "averageHeartRate"?: number, "maxHeartRate"?: number, "calories"?: number, "distance"?: number (km), "pace"?: number, "heartRateZones"?: { "zone1"?: number, "zone2"?: number, "zone3"?: number, "zone4"?: number, "zone5"?: number }, "notes"?: string } ]
  }
}

Rules:
- Only include the array(s) relevant to the classification. For glucose/BP/weight use "events". For meals use "meals". For workouts use "workouts".
- For blood pressure events: set "eventType" to "blood_pressure_reading" and populate "systolic" and "diastolic" (do not set "value").
- For glucose: set "eventType" to "glucose_reading", "value" to the reading, "unit" to mg/dL or mmol/L.
- For weight: set "eventType" to "weight_reading", "value" to the weight, "unit" to kg or lb.
- If you cannot read the image or it is not health-related, classify as "unknown" with confidence < 0.5 and an empty data object: { }.
- Confidence should reflect how certain you are about the classification given what's actually visible. Don't inflate.
- Output JSON only — no commentary, no code fences.`;

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
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) {
    return null;
  }
  return new Anthropic({ baseURL, apiKey });
}

async function fetchImageAsBase64(
  filePath: string
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }> {
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
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as AnalysisResult["data"];

  return { classification, confidence, summary, data };
}

export async function analyzeScreenshot(filePath: string): Promise<AnalysisResult> {
  logger.info({ filePath }, "Running screenshot analysis");

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
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
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
