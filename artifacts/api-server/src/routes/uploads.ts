import { Router, type IRouter } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";
import { LOCAL_UPLOADS_DIR, isLocalUri, toLocalUri } from "../lib/localStorage";
import { db } from "@workspace/db";
import {
  uploadsTable,
  llmRunsTable,
  eventsTable,
  mealsTable,
  workoutsTable,
  reviewsTable,
} from "@workspace/db";
import { eq, desc, count, sql, and, isNull } from "drizzle-orm";
import {
  ListUploadsQueryParams,
  GetUploadParams,
  AnalyzeUploadParams,
  GetRecentActivityQueryParams,
  ListOutcomesQueryParams,
} from "@workspace/api-zod";
import { analyzeScreenshot, type AnalysisModel } from "../lib/analysis";
import { getAnalysisModel } from "./settings";
import { logger } from "../lib/logger";
import { enqueue as enqueueAirtableSync } from "../lib/airtable";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });
const storageService = new ObjectStorageService();

const isLocalStorageMode = !process.env.PRIVATE_OBJECT_DIR && process.env.NODE_ENV !== "production";

if (isLocalStorageMode) {
  logger.info({ dir: LOCAL_UPLOADS_DIR }, "Local file storage mode active (PRIVATE_OBJECT_DIR not set)");
} else {
  logger.info("Object storage mode active");
}

router.get("/uploads/summary", async (req, res): Promise<void> => {
  const total = await db.select({ count: count() }).from(uploadsTable);

  const byClassification = await db
    .select({
      classification: uploadsTable.classification,
      count: count(),
    })
    .from(uploadsTable)
    .groupBy(uploadsTable.classification);

  const pendingReview = await db
    .select({ count: count() })
    .from(uploadsTable)
    .where(eq(uploadsTable.status, "pending"));

  const analyzed = await db
    .select({ count: count() })
    .from(uploadsTable)
    .where(eq(uploadsTable.status, "analyzed"));

  const result = {
    total: total[0]?.count ?? 0,
    byClassification: byClassification.map((row) => ({
      classification: row.classification ?? "unknown",
      count: row.count,
    })),
    pendingReview: pendingReview[0]?.count ?? 0,
    analyzed: analyzed[0]?.count ?? 0,
  };

  res.json(result);
});

router.get("/uploads/recent", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const uploads = await db
    .select()
    .from(uploadsTable)
    .orderBy(desc(uploadsTable.createdAt))
    .limit(limit);

  const total = await db.select({ count: count() }).from(uploadsTable);

  res.json({
    uploads,
    total: total[0]?.count ?? 0,
    page: 1,
    limit,
  });
});

router.get("/uploads", async (req, res): Promise<void> => {
  const parsed = ListUploadsQueryParams.safeParse(req.query);
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const classification = parsed.success ? parsed.data.classification : undefined;
  const status = parsed.success ? parsed.data.status : undefined;
  const unreviewed = parsed.success ? parsed.data.unreviewed : undefined;

  const offset = (page - 1) * limit;

  const filters = [];
  if (classification) filters.push(eq(uploadsTable.classification, classification));
  if (status) filters.push(eq(uploadsTable.status, status));
  if (unreviewed) {
    filters.push(
      sql`NOT EXISTS (SELECT 1 FROM ${reviewsTable} WHERE ${reviewsTable.uploadId} = ${uploadsTable.id})`,
    );
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const uploads = await db
    .select()
    .from(uploadsTable)
    .where(whereClause)
    .orderBy(desc(uploadsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: count() })
    .from(uploadsTable)
    .where(whereClause);

  res.json({
    uploads,
    total: totalResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.post("/uploads", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const { notes, sourceApp, batchIdentifier } = req.body as {
    notes?: string;
    sourceApp?: string;
    batchIdentifier?: string;
  };

  try {
    let objectPath: string;

    if (isLocalStorageMode) {
      await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
      const ext = path.extname(req.file.originalname) || ".bin";
      const filename = `${randomUUID()}${ext}`;
      await fs.writeFile(path.join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
      objectPath = toLocalUri(filename);
      req.log.info({ objectPath }, "File saved to local storage");
    } else {
      const presignedUrl = await storageService.getObjectEntityUploadURL();

      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        body: req.file.buffer,
        headers: {
          "Content-Type": req.file.mimetype,
          "Content-Length": String(req.file.size),
        },
      });

      if (!uploadResponse.ok) {
        req.log.error({ status: uploadResponse.status }, "Failed to upload file to object storage");
        res.status(500).json({ error: "Failed to store file" });
        return;
      }

      const objectUrl = presignedUrl.split("?")[0];
      objectPath = storageService.normalizeObjectEntityPath(objectUrl);
      req.log.info({ objectPath }, "File saved to object storage");
    }

    const [newUpload] = await db
      .insert(uploadsTable)
      .values({
        filePath: objectPath,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        status: "pending",
        notes: notes ?? null,
        sourceApp: sourceApp ?? null,
        batchIdentifier: batchIdentifier?.trim() ? batchIdentifier.trim() : null,
      })
      .returning();

    enqueueAirtableSync("uploads", newUpload.id);
    res.status(201).json(newUpload);
  } catch (err) {
    req.log.error({ err }, "Error creating upload");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/uploads/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetUploadParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [uploadRecord] = await db
    .select()
    .from(uploadsTable)
    .where(eq(uploadsTable.id, params.data.id));

  if (!uploadRecord) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  const llmRuns = await db
    .select()
    .from(llmRunsTable)
    .where(eq(llmRunsTable.uploadId, params.data.id))
    .orderBy(desc(llmRunsTable.createdAt));

  const events = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.uploadId, params.data.id));

  const workouts = await db
    .select()
    .from(workoutsTable)
    .where(eq(workoutsTable.uploadId, params.data.id));

  const meals = await db
    .select()
    .from(mealsTable)
    .where(eq(mealsTable.uploadId, params.data.id));

  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.uploadId, params.data.id));

  res.json({
    upload: uploadRecord,
    llmRuns,
    events,
    meals,
    workouts,
    reviews,
  });
});

router.delete("/uploads/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetUploadParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [uploadRecord] = await db
    .select()
    .from(uploadsTable)
    .where(eq(uploadsTable.id, params.data.id));

  if (!uploadRecord) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  await db.delete(reviewsTable).where(eq(reviewsTable.uploadId, params.data.id));
  await db.delete(eventsTable).where(eq(eventsTable.uploadId, params.data.id));
  await db.delete(workoutsTable).where(eq(workoutsTable.uploadId, params.data.id));
  await db.delete(mealsTable).where(eq(mealsTable.uploadId, params.data.id));
  await db.delete(llmRunsTable).where(eq(llmRunsTable.uploadId, params.data.id));
  await db.delete(uploadsTable).where(eq(uploadsTable.id, params.data.id));

  // Best-effort: delete the stored file
  try {
    if (isLocalUri(uploadRecord.filePath)) {
      const { resolveLocalPath } = await import("../lib/localStorage");
      await fs.unlink(resolveLocalPath(uploadRecord.filePath)).catch(() => {});
    } else if (uploadRecord.filePath.startsWith("/objects/")) {
      const file = await storageService.getObjectEntityFile(uploadRecord.filePath).catch(() => null);
      if (file) await file.delete({ ignoreNotFound: true }).catch(() => {});
    }
  } catch (err) {
    req.log.warn({ err, filePath: uploadRecord.filePath }, "Failed to delete stored file (record already removed)");
  }

  res.status(204).end();
});

router.patch("/uploads/:id/captured-at", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetUploadParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { capturedAt } = req.body as { capturedAt?: string };
  if (!capturedAt) {
    res.status(400).json({ error: "capturedAt is required" });
    return;
  }
  const date = new Date(capturedAt);
  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "capturedAt is not a valid date" });
    return;
  }

  const [updated] = await db
    .update(uploadsTable)
    .set({ capturedAt: date })
    .where(eq(uploadsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  res.json(updated);
});

router.patch("/uploads/:id/batch-identifier", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetUploadParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { batchIdentifier } = req.body as { batchIdentifier?: string | null };
  const value =
    typeof batchIdentifier === "string" && batchIdentifier.trim()
      ? batchIdentifier.trim()
      : null;

  const [updated] = await db
    .update(uploadsTable)
    .set({ batchIdentifier: value })
    .where(eq(uploadsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  res.json(updated);
});

router.post("/uploads/:id/analyze", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AnalyzeUploadParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [uploadRecord] = await db
    .select()
    .from(uploadsTable)
    .where(eq(uploadsTable.id, params.data.id));

  if (!uploadRecord) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  if (uploadRecord.status === "analyzing") {
    res.status(409).json({ error: "Upload is already being analyzed" });
    return;
  }

  await db
    .update(uploadsTable)
    .set({ status: "analyzing" })
    .where(eq(uploadsTable.id, params.data.id));

  try {
    const model = await getAnalysisModel();
    const analysisResult = await analyzeScreenshot(uploadRecord.filePath, model as AnalysisModel);

    const safeDate = (v: string | undefined | null): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const [llmRun] = await db
      .insert(llmRunsTable)
      .values({
        uploadId: params.data.id,
        modelName: model,
        promptVersion: "1.1.0",
        rawOutput: analysisResult as unknown as Record<string, unknown>,
        classification: analysisResult.classification,
        confidence: analysisResult.confidence,
        summary: analysisResult.summary,
        status: "completed",
      })
      .returning();

    if (analysisResult.data.events) {
      for (const event of analysisResult.data.events) {
        await db.insert(eventsTable).values({
          uploadId: params.data.id,
          eventType: event.eventType,
          eventTime: safeDate(event.eventTime),
          value: event.value ?? null,
          unit: event.unit ?? null,
          systolic: event.systolic ?? null,
          diastolic: event.diastolic ?? null,
          notes: event.notes ?? null,
        });
      }
    }

    const insertedMealIds: number[] = [];
    if (analysisResult.data.meals) {
      for (const meal of analysisResult.data.meals) {
        const [inserted] = await db.insert(mealsTable).values({
          uploadId: params.data.id,
          name: meal.name ?? null,
          mealTime: safeDate(meal.mealTime),
          calories: meal.calories ?? null,
          protein: meal.protein ?? null,
          carbs: meal.carbs ?? null,
          fat: meal.fat ?? null,
          fiber: meal.fiber ?? null,
          mealType: meal.mealType ?? null,
          foods: meal.foods ?? null,
          notes: meal.notes ?? null,
        }).returning();
        insertedMealIds.push(inserted.id);
      }
    }

    const insertedWorkoutIds: number[] = [];
    if (analysisResult.data.workouts) {
      for (const workout of analysisResult.data.workouts) {
        const safeInt = (v: number | undefined | null): number | null =>
          v != null ? Math.round(v) : null;
        const [inserted] = await db.insert(workoutsTable).values({
          uploadId: params.data.id,
          workoutType: workout.workoutType ?? null,
          workoutTime: safeDate(workout.workoutTime),
          duration: safeInt(workout.duration),
          averageHeartRate: safeInt(workout.averageHeartRate),
          maxHeartRate: safeInt(workout.maxHeartRate),
          calories: workout.calories ?? null,
          distance: workout.distance ?? null,
          pace: workout.pace ?? null,
          heartRateZones: workout.heartRateZones ?? null,
          notes: workout.notes ?? null,
        }).returning();
        insertedWorkoutIds.push(inserted.id);
      }
    }

    await db
      .update(uploadsTable)
      .set({
        status: "analyzed",
        classification: analysisResult.classification,
        confidence: analysisResult.confidence,
        summary: analysisResult.summary,
        capturedAt: analysisResult.capturedAt ? new Date(analysisResult.capturedAt) : null,
      })
      .where(eq(uploadsTable.id, params.data.id));

    // Fire-and-forget Airtable syncs (no-op if not configured)
    enqueueAirtableSync("uploads", params.data.id);
    enqueueAirtableSync("llm_runs", llmRun.id);
    for (const id of insertedMealIds) enqueueAirtableSync("meals", id);
    for (const id of insertedWorkoutIds) enqueueAirtableSync("workouts", id);

    res.json(llmRun);
  } catch (err) {
    req.log.error({ err }, "Analysis failed");
    await db
      .update(uploadsTable)
      .set({ status: "failed" })
      .where(eq(uploadsTable.id, params.data.id));
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/reviews", async (req, res): Promise<void> => {
  const { uploadId, classification, classificationCorrect, valuesCorrect, useful, notes, approved } = req.body as {
    uploadId?: number;
    classification?: string;
    classificationCorrect?: boolean | null;
    valuesCorrect?: boolean | null;
    useful?: boolean | null;
    notes?: string;
    approved?: boolean;
  };

  if (!uploadId || approved === undefined) {
    res.status(400).json({ error: "uploadId and approved are required" });
    return;
  }

  const [upload] = await db
    .select()
    .from(uploadsTable)
    .where(eq(uploadsTable.id, uploadId));

  if (!upload) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  const boolToInt = (v: boolean | null | undefined): number | null =>
    v === true ? 1 : v === false ? 0 : null;

  const [review] = await db
    .insert(reviewsTable)
    .values({
      uploadId,
      classification: classification ?? null,
      classificationCorrect: boolToInt(classificationCorrect),
      valuesCorrect: boolToInt(valuesCorrect),
      useful: boolToInt(useful),
      notes: notes ?? null,
      approved: approved ? 1 : 0,
    })
    .returning();

  if (classification && approved) {
    await db
      .update(uploadsTable)
      .set({ classification, status: "analyzed" })
      .where(eq(uploadsTable.id, uploadId));
  }

  enqueueAirtableSync("reviews", review.id);
  enqueueAirtableSync("uploads", uploadId);

  const intToBool = (v: number | null): boolean | null =>
    v === 1 ? true : v === 0 ? false : null;

  res.status(201).json({
    ...review,
    approved: Boolean(review.approved),
    classificationCorrect: intToBool(review.classificationCorrect),
    valuesCorrect: intToBool(review.valuesCorrect),
    useful: intToBool(review.useful),
  });
});

router.get("/outcomes", async (req, res): Promise<void> => {
  const { outcomesTable } = await import("@workspace/db");

  const parsed = ListOutcomesQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;

  const outcomes = await db
    .select()
    .from(outcomesTable)
    .orderBy(desc(outcomesTable.createdAt))
    .limit(limit);

  const totalResult = await db.select({ count: count() }).from(outcomesTable);

  res.json({
    outcomes,
    total: totalResult[0]?.count ?? 0,
  });
});

export default router;
