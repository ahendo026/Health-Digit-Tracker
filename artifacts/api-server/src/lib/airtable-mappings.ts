/**
 * Airtable sync field mappings.
 *
 * Each entry describes ONE entity type that gets synced to Airtable:
 *   - tableEnvVar: env var holding the Airtable table name or ID
 *   - loader:      reads the DB row by its numeric id
 *   - buildFields: transforms the DB row into the Airtable `fields` object
 *
 * To add or remove a field, edit the `buildFields` function for that entity.
 * To add a whole new entity type, add a new entry to MAPPINGS (and a
 * corresponding enqueue() call from a route handler).
 *
 * IMPORTANT: Airtable fields are matched by name and are case-sensitive.
 * The field names in `buildFields` must exist on the Airtable table.
 */

import { db } from "@workspace/db";
import {
  uploadsTable,
  llmRunsTable,
  reviewsTable,
  mealsTable,
  workoutsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export type AirtableFields = Record<string, string | number | boolean | null>;

export interface EntityMapping {
  tableEnvVar: string;
  loader: (id: number) => Promise<unknown | null>;
  buildFields: (row: unknown) => AirtableFields;
}

const iso = (v: Date | string | null | undefined): string | null =>
  v instanceof Date ? v.toISOString() : v ?? null;

export const MAPPINGS: Record<string, EntityMapping> = {
  uploads: {
    tableEnvVar: "AIRTABLE_UPLOADS_TABLE",
    loader: async (id) => {
      const [row] = await db.select().from(uploadsTable).where(eq(uploadsTable.id, id));
      return row ?? null;
    },
    buildFields: (row) => {
      const u = row as typeof uploadsTable.$inferSelect;
      return {
        "DB ID": u.id,
        "Original Filename": u.originalFilename,
        "Source App": u.sourceApp,
        "Classification": u.classification,
        "Confidence": u.confidence,
        "Summary": u.summary,
        "Status": u.status,
        "Captured At": iso(u.capturedAt),
        "Created At": iso(u.createdAt),
      };
    },
  },

  llm_runs: {
    tableEnvVar: "AIRTABLE_LLM_RUNS_TABLE",
    loader: async (id) => {
      const [row] = await db.select().from(llmRunsTable).where(eq(llmRunsTable.id, id));
      return row ?? null;
    },
    buildFields: (row) => {
      const r = row as typeof llmRunsTable.$inferSelect;
      return {
        "DB ID": r.id,
        "Upload DB ID": r.uploadId,
        "Model": r.modelName,
        "Prompt Version": r.promptVersion,
        "Classification": r.classification,
        "Confidence": r.confidence,
        "Summary": r.summary,
        "Status": r.status,
        "Error": r.errorMessage,
        "Created At": iso(r.createdAt),
      };
    },
  },

  reviews: {
    tableEnvVar: "AIRTABLE_REVIEWS_TABLE",
    loader: async (id) => {
      const [row] = await db.select().from(reviewsTable).where(eq(reviewsTable.id, id));
      return row ?? null;
    },
    buildFields: (row) => {
      const r = row as typeof reviewsTable.$inferSelect;
      const triBool = (v: number | null) => (v === 1 ? "Yes" : v === 0 ? "No" : null);
      return {
        "DB ID": r.id,
        "Upload DB ID": r.uploadId,
        "Classification": r.classification,
        "Approved": r.approved === 1,
        "Classification Correct": triBool(r.classificationCorrect),
        "Values Correct": triBool(r.valuesCorrect),
        "Useful": triBool(r.useful),
        "Notes": r.notes,
        "Created At": iso(r.createdAt),
      };
    },
  },

  meals: {
    tableEnvVar: "AIRTABLE_MEALS_TABLE",
    loader: async (id) => {
      const [row] = await db.select().from(mealsTable).where(eq(mealsTable.id, id));
      return row ?? null;
    },
    buildFields: (row) => {
      const m = row as typeof mealsTable.$inferSelect;
      return {
        "DB ID": m.id,
        "Upload DB ID": m.uploadId,
        "Name": m.name,
        "Meal Time": iso(m.mealTime),
        "Meal Type": m.mealType,
        "Calories": m.calories,
        "Protein (g)": m.protein,
        "Carbs (g)": m.carbs,
        "Fat (g)": m.fat,
        "Fiber (g)": m.fiber,
        "Foods": m.foods,
        "Notes": m.notes,
      };
    },
  },

  workouts: {
    tableEnvVar: "AIRTABLE_WORKOUTS_TABLE",
    loader: async (id) => {
      const [row] = await db.select().from(workoutsTable).where(eq(workoutsTable.id, id));
      return row ?? null;
    },
    buildFields: (row) => {
      const w = row as typeof workoutsTable.$inferSelect;
      return {
        "DB ID": w.id,
        "Upload DB ID": w.uploadId,
        "Type": w.workoutType,
        "Workout Time": iso(w.workoutTime),
        "Duration (min)": w.duration,
        "Avg HR": w.averageHeartRate,
        "Max HR": w.maxHeartRate,
        "Calories": w.calories,
        "Distance (km)": w.distance,
        "Pace (min/km)": w.pace,
        "Notes": w.notes,
      };
    },
  },
};

export type EntityType = keyof typeof MAPPINGS;
