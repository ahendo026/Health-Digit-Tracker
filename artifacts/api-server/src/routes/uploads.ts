import { Router, type IRouter } from "express";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";
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
import { analyzeScreenshot } from "../lib/analysis";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });
const storageService = new ObjectStorageService();

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

  const offset = (page - 1) * limit;

  const conditions = classification
    ? [eq(uploadsTable.classification, classification)]
    : [];

  const uploads = await db
    .select()
    .from(uploadsTable)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(uploadsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: count() })
    .from(uploadsTable)
    .where(conditions.length > 0 ? conditions[0] : undefined);

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

  const { notes, sourceApp } = req.body as { notes?: string; sourceApp?: string };

  try {
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
    const objectPath = storageService.normalizeObjectEntityPath(objectUrl);

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
      })
      .returning();

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

  const workouts = await db.select().from(workoutsTable);

  const meals = await db.select().from(mealsTable);

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
    const analysisResult = await analyzeScreenshot(uploadRecord.filePath);

    const [llmRun] = await db
      .insert(llmRunsTable)
      .values({
        uploadId: params.data.id,
        modelName: "health-digit-placeholder-v1",
        promptVersion: "1.0.0",
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
          eventTime: event.eventTime ? new Date(event.eventTime) : null,
          value: event.value ?? null,
          unit: event.unit ?? null,
          systolic: event.systolic ?? null,
          diastolic: event.diastolic ?? null,
          notes: event.notes ?? null,
        });
      }
    }

    if (analysisResult.data.meals) {
      for (const meal of analysisResult.data.meals) {
        await db.insert(mealsTable).values({
          name: meal.name ?? null,
          mealTime: meal.mealTime ? new Date(meal.mealTime) : null,
          calories: meal.calories ?? null,
          protein: meal.protein ?? null,
          carbs: meal.carbs ?? null,
          fat: meal.fat ?? null,
          fiber: meal.fiber ?? null,
          mealType: meal.mealType ?? null,
          foods: meal.foods ?? null,
          notes: meal.notes ?? null,
        });
      }
    }

    if (analysisResult.data.workouts) {
      for (const workout of analysisResult.data.workouts) {
        await db.insert(workoutsTable).values({
          workoutType: workout.workoutType ?? null,
          workoutTime: workout.workoutTime ? new Date(workout.workoutTime) : null,
          duration: workout.duration ?? null,
          averageHeartRate: workout.averageHeartRate ?? null,
          maxHeartRate: workout.maxHeartRate ?? null,
          calories: workout.calories ?? null,
          distance: workout.distance ?? null,
          pace: workout.pace ?? null,
          heartRateZones: workout.heartRateZones ?? null,
          notes: workout.notes ?? null,
        });
      }
    }

    await db
      .update(uploadsTable)
      .set({
        status: "analyzed",
        classification: analysisResult.classification,
        confidence: analysisResult.confidence,
        summary: analysisResult.summary,
      })
      .where(eq(uploadsTable.id, params.data.id));

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
