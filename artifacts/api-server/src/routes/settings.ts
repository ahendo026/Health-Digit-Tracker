import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ANALYSIS_MODELS, DEFAULT_ANALYSIS_MODEL, isAnalysisModel } from "../lib/analysis";

const router: IRouter = Router();

const ANALYSIS_MODEL_KEY = "analysis_model";

/** Read the currently configured analysis model, falling back to the default. */
export async function getAnalysisModel(): Promise<string> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, ANALYSIS_MODEL_KEY));
  return isAnalysisModel(row?.value) ? row.value : DEFAULT_ANALYSIS_MODEL;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const analysisModel = await getAnalysisModel();
  res.json({ analysisModel });
});

router.put("/settings", async (req, res): Promise<void> => {
  const { analysisModel } = req.body as { analysisModel?: string };
  if (!isAnalysisModel(analysisModel)) {
    res.status(400).json({
      error: `analysisModel must be one of: ${ANALYSIS_MODELS.join(", ")}`,
    });
    return;
  }

  await db
    .insert(appSettingsTable)
    .values({ key: ANALYSIS_MODEL_KEY, value: analysisModel })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: analysisModel },
    });

  res.json({ analysisModel });
});

export default router;
