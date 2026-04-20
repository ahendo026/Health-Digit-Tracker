/**
 * Airtable sync service.
 *
 * Airtable is a **review / evaluation layer**, not the system of record.
 * All sync operations are asynchronous and best-effort — the main HTTP
 * request path never awaits Airtable calls and never fails when Airtable
 * is down or misconfigured.
 *
 * Entry points:
 *   - enqueue(entity, dbRowId)   — fire-and-forget, called from route handlers
 *   - startRetryWorker()          — periodic retry of failed syncs, called at boot
 *
 * All sync attempts (success and failure) are recorded in the
 * `airtable_sync_log` table. Failed attempts schedule a retry with
 * exponential backoff up to MAX_RETRIES.
 */

import { db, airtableSyncLogTable } from "@workspace/db";
import { and, eq, lte, isNotNull, desc } from "drizzle-orm";
import { logger } from "./logger";
import { MAPPINGS, type EntityType, type AirtableFields } from "./airtable-mappings";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between worker ticks

function isConfigured(): boolean {
  // Master kill-switch: sync is off unless AIRTABLE_SYNC_ENABLED=true,
  // regardless of whether the API key and base id are set.
  if (process.env.AIRTABLE_SYNC_ENABLED !== "true") return false;
  return Boolean(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);
}

function backoffMs(retryCount: number): number {
  // 1m, 5m, 15m, 60m, 4h — capped at MAX_RETRIES
  return [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000][
    Math.min(retryCount, 4)
  ];
}

async function airtableRequest(
  tableName: string,
  airtableRecordId: string | null,
  fields: AirtableFields,
): Promise<{ id: string }> {
  const base = process.env.AIRTABLE_BASE_ID!;
  const key = process.env.AIRTABLE_API_KEY!;
  const url = airtableRecordId
    ? `${AIRTABLE_API_BASE}/${base}/${encodeURIComponent(tableName)}/${airtableRecordId}`
    : `${AIRTABLE_API_BASE}/${base}/${encodeURIComponent(tableName)}`;
  const method = airtableRecordId ? "PATCH" : "POST";

  // Strip undefined / null fields — Airtable accepts null for clearing but some
  // field types reject it. Send only the keys that have real values.
  const cleanFields: AirtableFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) cleanFields[k] = v;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: cleanFields, typecast: true }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable ${method} ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as { id: string };
  return json;
}

/**
 * Look up the previous Airtable record id for this DB row (if any), so we
 * PATCH instead of POSTing a duplicate. We use the most recent successful
 * sync log row that has an airtable_record_id.
 */
async function findExistingAirtableId(
  tableName: string,
  dbRecordId: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(airtableSyncLogTable)
    .where(
      and(
        eq(airtableSyncLogTable.tableName, tableName),
        eq(airtableSyncLogTable.recordId, dbRecordId),
        isNotNull(airtableSyncLogTable.airtableRecordId),
      ),
    )
    .orderBy(desc(airtableSyncLogTable.syncedAt))
    .limit(1);
  return row?.airtableRecordId ?? null;
}

async function syncOnce(entity: EntityType, dbRowId: number): Promise<void> {
  const mapping = MAPPINGS[entity];
  const tableName = process.env[mapping.tableEnvVar];
  if (!tableName) {
    logger.debug(
      { entity, env: mapping.tableEnvVar },
      "Airtable table env var not set; skipping sync",
    );
    return;
  }

  const row = await mapping.loader(dbRowId);
  if (!row) {
    logger.warn({ entity, dbRowId }, "Airtable sync: source row no longer exists");
    return;
  }

  const fields = mapping.buildFields(row);
  const existingAirtableId = await findExistingAirtableId(entity, String(dbRowId));

  try {
    const { id: airtableRecordId } = await airtableRequest(
      tableName,
      existingAirtableId,
      fields,
    );
    await db.insert(airtableSyncLogTable).values({
      tableName: entity,
      recordId: String(dbRowId),
      airtableRecordId,
      status: "success",
      payload: fields as unknown as Record<string, unknown>,
    });
    logger.info({ entity, dbRowId, airtableRecordId }, "Airtable sync ok");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Count prior failures for this row to decide next_retry_at
    const [priorFail] = await db
      .select()
      .from(airtableSyncLogTable)
      .where(
        and(
          eq(airtableSyncLogTable.tableName, entity),
          eq(airtableSyncLogTable.recordId, String(dbRowId)),
          eq(airtableSyncLogTable.status, "failed"),
        ),
      )
      .orderBy(desc(airtableSyncLogTable.syncedAt))
      .limit(1);

    const nextRetryCount = (priorFail?.retryCount ?? 0) + 1;
    const status = nextRetryCount >= MAX_RETRIES ? "abandoned" : "failed";
    const nextRetryAt =
      status === "failed" ? new Date(Date.now() + backoffMs(nextRetryCount)) : null;

    await db.insert(airtableSyncLogTable).values({
      tableName: entity,
      recordId: String(dbRowId),
      airtableRecordId: existingAirtableId,
      status,
      errorMessage,
      retryCount: nextRetryCount,
      nextRetryAt,
      payload: fields as unknown as Record<string, unknown>,
    });
    logger.warn(
      { entity, dbRowId, err: errorMessage, retryCount: nextRetryCount, status },
      "Airtable sync failed",
    );
  }
}

/**
 * Fire-and-forget enqueue. Call this from route handlers. Never throws,
 * never blocks.
 */
export function enqueue(entity: EntityType, dbRowId: number): void {
  if (!isConfigured()) return;
  setImmediate(() => {
    syncOnce(entity, dbRowId).catch((err) => {
      logger.error({ err, entity, dbRowId }, "Unhandled Airtable sync error");
    });
  });
}

/**
 * Find all sync log rows that are due for retry and re-attempt them.
 * Only the most recent log row per (entity, dbRowId) is considered.
 */
async function retryDueSyncs(): Promise<void> {
  if (!isConfigured()) return;
  const now = new Date();
  const due = await db
    .select()
    .from(airtableSyncLogTable)
    .where(
      and(
        eq(airtableSyncLogTable.status, "failed"),
        lte(airtableSyncLogTable.nextRetryAt, now),
      ),
    );

  // Deduplicate: only retry the latest log row per (entity, dbRowId)
  const seen = new Set<string>();
  for (const row of due) {
    const key = `${row.tableName}:${row.recordId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (row.recordId == null) continue;
    try {
      await syncOnce(row.tableName as EntityType, Number(row.recordId));
    } catch (err) {
      logger.error({ err, row }, "Retry attempt threw unexpectedly");
    }
  }
}

let retryTimer: NodeJS.Timeout | null = null;

export function startRetryWorker(): void {
  if (retryTimer || !isConfigured()) return;
  retryTimer = setInterval(() => {
    retryDueSyncs().catch((err) => {
      logger.error({ err }, "Airtable retry worker tick failed");
    });
  }, RETRY_INTERVAL_MS);
  // Don't keep the event loop alive just for this timer
  retryTimer.unref();
  logger.info({ intervalMs: RETRY_INTERVAL_MS }, "Airtable retry worker started");
}

export function stopRetryWorker(): void {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}
