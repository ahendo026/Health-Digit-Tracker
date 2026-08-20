import type { NextFunction, Request, Response } from "express";
import { db, devicesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { isAuthConfigured, sha256Hex } from "../lib/auth";
import { logger } from "../lib/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      deviceId?: number;
    }
  }
}

// req.path is mount-relative (the /api prefix is stripped by app.use("/api", ...)).
const PUBLIC_EXACT = new Set(["/healthz"]);
const PUBLIC_PREFIXES = ["/storage/public-objects/"];
const LAST_SEEN_STALE_MS = 5 * 60_000;

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (PUBLIC_EXACT.has(req.path)) return next();
  if (req.path === "/auth/login" && req.method === "POST") return next();
  if (PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    const [device] = await db
      .select()
      .from(devicesTable)
      .where(and(eq(devicesTable.tokenHash, sha256Hex(token)), isNull(devicesTable.revokedAt)));
    if (device) {
      req.deviceId = device.id;
      const stale = !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > LAST_SEEN_STALE_MS;
      if (stale) {
        db.update(devicesTable)
          .set({ lastSeenAt: new Date() })
          .where(eq(devicesTable.id, device.id))
          .catch((err) => logger.warn({ err }, "Failed to update device last_seen_at"));
      }
      return next();
    }
  }

  // No or invalid token: only allowed while auth has never been configured.
  if (!(await isAuthConfigured())) return next();
  res.status(401).json({ error: "Unauthorized" });
}
