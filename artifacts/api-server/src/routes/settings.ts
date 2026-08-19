import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ANALYSIS_MODELS, DEFAULT_ANALYSIS_MODEL, isAnalysisModel } from "../lib/analysis";
import { isValidTimeZone } from "../lib/timezone";

const router: IRouter = Router();

const ANALYSIS_MODEL_KEY = "analysis_model";
const TIMEZONE_KEY = "timezone";

/** Read the currently configured analysis model, falling back to the default. */
export async function getAnalysisModel(): Promise<string> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, ANALYSIS_MODEL_KEY));
  return isAnalysisModel(row?.value) ? row.value : DEFAULT_ANALYSIS_MODEL;
}

/** Read the configured timezone: "auto" (default) or an IANA id. */
export async function getConfiguredTimezone(): Promise<string> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, TIMEZONE_KEY));
  return row?.value && (row.value === "auto" || isValidTimeZone(row.value))
    ? row.value
    : "auto";
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
}

router.get("/settings", async (_req, res): Promise<void> => {
  const [analysisModel, timezone] = await Promise.all([
    getAnalysisModel(),
    getConfiguredTimezone(),
  ]);
  res.json({ analysisModel, timezone });
});

router.put("/settings", async (req, res): Promise<void> => {
  const { analysisModel, timezone } = req.body as {
    analysisModel?: string;
    timezone?: string;
  };

  if (analysisModel !== undefined && !isAnalysisModel(analysisModel)) {
    res.status(400).json({
      error: `analysisModel must be one of: ${ANALYSIS_MODELS.join(", ")}`,
    });
    return;
  }
  if (
    timezone !== undefined &&
    timezone !== "auto" &&
    !isValidTimeZone(timezone)
  ) {
    res.status(400).json({
      error: `timezone must be "auto" or a valid IANA timezone id`,
    });
    return;
  }

  if (analysisModel !== undefined) await upsertSetting(ANALYSIS_MODEL_KEY, analysisModel);
  if (timezone !== undefined) await upsertSetting(TIMEZONE_KEY, timezone);

  const [model, tz] = await Promise.all([getAnalysisModel(), getConfiguredTimezone()]);
  res.json({ analysisModel: model, timezone: tz });
});

export default router;
