import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

export const AUTH_PASSWORD_KEY = "auth_password";

// Versioned hash format so parameters can be rotated later: s1:<saltHex>:<hashHex>
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `s1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [version, saltHex, hashHex] = stored.split(":");
  if (version !== "s1" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length, SCRYPT_PARAMS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function getStoredPasswordHash(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, AUTH_PASSWORD_KEY));
  return row?.value ?? null;
}

// Once auth is configured it stays configured (rotation updates the row, never
// deletes it in normal operation), so a true result is cached forever. While
// unconfigured, re-check at most every 30 seconds to avoid a DB hit per request.
let configuredCache = false;
let lastCheck = 0;
const RECHECK_MS = 30_000;

export async function isAuthConfigured(): Promise<boolean> {
  if (configuredCache) return true;
  const now = Date.now();
  if (now - lastCheck < RECHECK_MS) return false;
  lastCheck = now;
  configuredCache = (await getStoredPasswordHash()) !== null;
  return configuredCache;
}
