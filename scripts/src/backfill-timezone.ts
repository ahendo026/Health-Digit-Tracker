/**
 * One-off backfill for the capturedAt timezone bug (fixed in prompt v1.3.0).
 *
 * Before the fix, LLM-extracted wall-clock times (the user's local time as
 * shown in the screenshot) were stored as if they were UTC. This script shifts
 * those instants to the correct UTC value for a given IANA zone: it reads each
 * stored timestamp's UTC wall-clock and re-interprets it in --zone (so the
 * shift is +4h in EDT, +5h in EST, chosen per-row by the wall-clock date).
 *
 * Safety:
 * - Dry-run by default; pass --apply to write.
 * - Only touches uploads created before --before (the fix's deploy time).
 * - uploads.captured_at is shifted ONLY when it still equals the naive parse of
 *   the latest completed llm_run's rawOutput.capturedAt — rows corrected by
 *   hand via the PATCH editor diverge from the model output and are skipped.
 * - events/meals/workouts times have no manual editor, so all non-null values
 *   under qualifying uploads are shifted.
 * - Airtable mirrors of shifted rows go stale (sync only runs on API writes);
 *   re-trigger sync manually if needed.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/scripts run backfill-timezone -- \
 *     --before=2026-08-19T18:00:00Z [--zone=America/New_York] [--apply]
 */
import { fromZonedTime } from "date-fns-tz";
import { eq, lt, inArray, isNotNull, and, desc } from "drizzle-orm";
import {
  db,
  pool,
  uploadsTable,
  llmRunsTable,
  eventsTable,
  mealsTable,
  workoutsTable,
} from "@workspace/db";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

const APPLY = process.argv.includes("--apply");
const ZONE = arg("zone") ?? "America/New_York";
const BEFORE_RAW = arg("before");

if (!BEFORE_RAW) {
  console.error("Missing required --before=<ISO datetime of the fix deploy>");
  process.exit(1);
}
const BEFORE = new Date(BEFORE_RAW);
if (isNaN(BEFORE.getTime())) {
  console.error(`Invalid --before value: ${BEFORE_RAW}`);
  process.exit(1);
}
try {
  new Intl.DateTimeFormat("en-US", { timeZone: ZONE });
} catch {
  console.error(`Invalid --zone value: ${ZONE}`);
  process.exit(1);
}

/** Re-interpret a wrongly-stored instant's UTC wall-clock as ZONE local time. */
function correct(t: Date): Date {
  return fromZonedTime(t.toISOString().slice(0, 19), ZONE);
}

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})\s*$/i;

/**
 * Parse a model-emitted ISO string the way the UTC Render server did with
 * `new Date(...)`: an explicit offset is honored; a naive string is UTC.
 * (A plain `new Date(naive)` here would use THIS host's zone — wrong.)
 */
function parseLikeServer(raw: string): Date {
  return OFFSET_RE.test(raw.trim()) ? new Date(raw) : new Date(raw.trim() + "Z");
}

interface Change {
  table: string;
  id: number;
  field: string;
  old: string;
  new: string;
}

async function main(): Promise<void> {
  const changes: Change[] = [];
  const skipped: string[] = [];

  const uploads = await db
    .select()
    .from(uploadsTable)
    .where(lt(uploadsTable.createdAt, BEFORE));
  const uploadIds = uploads.map((u) => u.id);
  console.log(
    `${uploads.length} uploads created before ${BEFORE.toISOString()}; zone=${ZONE}; ${APPLY ? "APPLY" : "DRY-RUN"}`
  );
  if (uploadIds.length === 0) return;

  // uploads.captured_at — only rows still matching the model output
  for (const u of uploads) {
    if (!u.capturedAt) continue;
    const [run] = await db
      .select()
      .from(llmRunsTable)
      .where(and(eq(llmRunsTable.uploadId, u.id), eq(llmRunsTable.status, "completed")))
      .orderBy(desc(llmRunsTable.createdAt))
      .limit(1);
    const rawCapturedAt = (run?.rawOutput as { capturedAt?: string } | null)?.capturedAt;
    if (!rawCapturedAt) {
      skipped.push(`upload ${u.id}: no completed llm_run capturedAt (possibly manual entry)`);
      continue;
    }
    const naive = parseLikeServer(rawCapturedAt);
    if (isNaN(naive.getTime()) || naive.toISOString() !== u.capturedAt.toISOString()) {
      skipped.push(`upload ${u.id}: captured_at diverges from model output (manually edited?)`);
      continue;
    }
    const fixed = correct(u.capturedAt);
    if (fixed.getTime() === u.capturedAt.getTime()) continue;
    changes.push({
      table: "uploads",
      id: u.id,
      field: "captured_at",
      old: u.capturedAt.toISOString(),
      new: fixed.toISOString(),
    });
    if (APPLY) {
      await db
        .update(uploadsTable)
        .set({ capturedAt: fixed, timezone: u.timezone ?? ZONE })
        .where(eq(uploadsTable.id, u.id));
    }
  }

  // child tables — no manual editor exists, shift all non-null values
  const childTables = [
    { name: "events", table: eventsTable, field: "event_time", col: eventsTable.eventTime },
    { name: "meals", table: mealsTable, field: "meal_time", col: mealsTable.mealTime },
    { name: "workouts", table: workoutsTable, field: "workout_time", col: workoutsTable.workoutTime },
  ] as const;

  for (const t of childTables) {
    const rows = await db
      .select()
      .from(t.table)
      .where(and(inArray(t.table.uploadId, uploadIds), isNotNull(t.col)));
    for (const row of rows) {
      const current = (row as Record<string, unknown>)[
        t.field === "event_time" ? "eventTime" : t.field === "meal_time" ? "mealTime" : "workoutTime"
      ] as Date;
      const fixed = correct(current);
      if (fixed.getTime() === current.getTime()) continue;
      changes.push({
        table: t.name,
        id: row.id,
        field: t.field,
        old: current.toISOString(),
        new: fixed.toISOString(),
      });
      if (APPLY) {
        if (t.name === "events") {
          await db.update(eventsTable).set({ eventTime: fixed }).where(eq(eventsTable.id, row.id));
        } else if (t.name === "meals") {
          await db.update(mealsTable).set({ mealTime: fixed }).where(eq(mealsTable.id, row.id));
        } else {
          await db.update(workoutsTable).set({ workoutTime: fixed }).where(eq(workoutsTable.id, row.id));
        }
      }
    }
  }

  console.table(changes);
  for (const s of skipped) console.log(`SKIPPED: ${s}`);
  console.log(
    `${changes.length} change(s) ${APPLY ? "applied" : "would be applied (re-run with --apply)"}; ${skipped.length} upload(s) skipped.`
  );
  if (APPLY && changes.length > 0) {
    console.log("Note: Airtable mirrors of shifted rows are now stale.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
