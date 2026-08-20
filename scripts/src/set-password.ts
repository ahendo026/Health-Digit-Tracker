/**
 * Set, rotate, or clear the HealthDigits master password.
 *
 * The scrypt hash is stored in app_settings under key "auth_password"; the
 * plaintext lives only in your password manager. Auth enforcement turns on as
 * soon as the row exists (enforce-when-configured) — no server restart needed.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/scripts run set-password              # interactive prompt
 *   DATABASE_URL=... pnpm --filter @workspace/scripts run set-password -- --password=<pw>
 *   ... -- --password=<pw> --revoke-all-devices    # rotation: also sign out every device
 *   ... -- --clear                                 # remove the password (auth off; restart the
 *                                                  # API afterwards — "configured" is cached)
 */
import { createInterface } from "node:readline/promises";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { eq, isNull } from "drizzle-orm";
import { db, pool, appSettingsTable, devicesTable } from "@workspace/db";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

const AUTH_PASSWORD_KEY = "auth_password";

// Must match hashPassword in artifacts/api-server/src/lib/auth.ts (s1 format).
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `s1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main(): Promise<void> {
  if (process.argv.includes("--clear")) {
    await db.delete(appSettingsTable).where(eq(appSettingsTable.key, AUTH_PASSWORD_KEY));
    console.log(
      "Password cleared — auth is off once the API restarts (the configured flag is cached in-process)."
    );
    return;
  }

  let password = arg("password");
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("New master password: ");
    rl.close();
  }
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const value = await hashPassword(password);
  await db
    .insert(appSettingsTable)
    .values({ key: AUTH_PASSWORD_KEY, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
  console.log("Master password set. Auth is now enforced for this database's API.");

  if (process.argv.includes("--revoke-all-devices")) {
    const revoked = await db
      .update(devicesTable)
      .set({ revokedAt: new Date() })
      .where(isNull(devicesTable.revokedAt))
      .returning();
    console.log(`Revoked ${revoked.length} device(s) — every device must log in again.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
