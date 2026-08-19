import { pgTable, text, serial, integer, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  email: text("email"),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const uploadsTable = pgTable("uploads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  filePath: text("file_path").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  sourceApp: text("source_app"),
  classification: text("classification"),
  confidence: real("confidence"),
  summary: text("summary"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  timezone: text("timezone"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  batchIdentifier: text("batch_identifier"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Simple key/value store for global app settings (e.g. the model used for analysis).
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const llmRunsTable = pgTable("llm_runs", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id),
  modelName: text("model_name").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawOutput: jsonb("raw_output").notNull(),
  classification: text("classification"),
  confidence: real("confidence"),
  summary: text("summary"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id),
  eventType: text("event_type").notNull(),
  eventTime: timestamp("event_time", { withTimezone: true }),
  value: real("value"),
  unit: text("unit"),
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),
  heartRate: integer("heart_rate"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mealsTable = pgTable("meals", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").references(() => uploadsTable.id),
  name: text("name"),
  mealTime: timestamp("meal_time", { withTimezone: true }),
  calories: real("calories"),
  protein: real("protein"),
  carbs: real("carbs"),
  fat: real("fat"),
  fiber: real("fiber"),
  mealType: text("meal_type"),
  foods: text("foods"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workoutsTable = pgTable("workouts", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").references(() => uploadsTable.id),
  workoutType: text("workout_type"),
  workoutTime: timestamp("workout_time", { withTimezone: true }),
  duration: integer("duration"),
  averageHeartRate: integer("average_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  calories: real("calories"),
  distance: real("distance"),
  pace: real("pace"),
  heartRateZones: jsonb("heart_rate_zones"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mealEventLinksTable = pgTable("meal_event_links", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id),
  mealId: integer("meal_id").notNull().references(() => mealsTable.id),
  eventId: integer("event_id").notNull().references(() => eventsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workoutEventLinksTable = pgTable("workout_event_links", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id),
  workoutId: integer("workout_id").notNull().references(() => workoutsTable.id),
  eventId: integer("event_id").notNull().references(() => eventsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outcomesTable = pgTable("outcomes", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").references(() => uploadsTable.id),
  eventId: integer("event_id").references(() => eventsTable.id),
  outcomeType: text("outcome_type").notNull(),
  value: real("value"),
  unit: text("unit"),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rulesTable = pgTable("rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  condition: jsonb("condition").notNull(),
  action: jsonb("action").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull().references(() => uploadsTable.id),
  reviewerId: integer("reviewer_id").references(() => usersTable.id),
  classification: text("classification"),
  classificationCorrect: integer("classification_correct"),
  valuesCorrect: integer("values_correct"),
  useful: integer("useful"),
  notes: text("notes"),
  approved: integer("approved").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const airtableSyncLogTable = pgTable("airtable_sync_log", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id"),
  airtableRecordId: text("airtable_record_id"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  payload: jsonb("payload"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUploadSchema = createInsertSchema(uploadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLlmRunSchema = createInsertSchema(llmRunsTable).omit({ id: true, createdAt: true });
export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });
export const insertMealSchema = createInsertSchema(mealsTable).omit({ id: true, createdAt: true });
export const insertWorkoutSchema = createInsertSchema(workoutsTable).omit({ id: true, createdAt: true });
export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true });
export const insertOutcomeSchema = createInsertSchema(outcomesTable).omit({ id: true, createdAt: true });

export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploadsTable.$inferSelect;
export type LlmRun = typeof llmRunsTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
export type Meal = typeof mealsTable.$inferSelect;
export type Workout = typeof workoutsTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;
export type Outcome = typeof outcomesTable.$inferSelect;
export type AppSetting = typeof appSettingsTable.$inferSelect;
