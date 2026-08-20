import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { db, devicesTable, type Device } from "@workspace/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getStoredPasswordHash, sha256Hex, verifyPassword } from "../lib/auth";

const router: IRouter = Router();

// Naive in-memory brute-force guard. Single Render instance, resets on deploy —
// acceptable for a single-user app; scrypt cost also throttles guessing.
const MAX_FAILS = 5;
const LOCKOUT_MS = 30_000;
let failCount = 0;
let lockedUntil = 0;

function toDeviceDto(device: Device, currentDeviceId: number | undefined) {
  return {
    id: device.id,
    name: device.name,
    userAgent: device.userAgent,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    current: device.id === currentDeviceId,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  if (Date.now() < lockedUntil) {
    res.status(429).json({ error: "Too many failed attempts; try again shortly" });
    return;
  }

  const { password, deviceName } = (req.body ?? {}) as { password?: string; deviceName?: string };
  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const stored = await getStoredPasswordHash();
  if (!stored) {
    res.status(503).json({ error: "Authentication is not configured on this server" });
    return;
  }

  if (!(await verifyPassword(password, stored))) {
    failCount += 1;
    if (failCount >= MAX_FAILS) {
      lockedUntil = Date.now() + LOCKOUT_MS;
      failCount = 0;
    }
    res.status(401).json({ error: "Incorrect password" });
    return;
  }
  failCount = 0;

  const token = randomBytes(32).toString("base64url");
  const [device] = await db
    .insert(devicesTable)
    .values({
      tokenHash: sha256Hex(token),
      name: typeof deviceName === "string" && deviceName.trim() ? deviceName.trim().slice(0, 100) : null,
      userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      lastSeenAt: new Date(),
    })
    .returning();

  res.json({ token, device: toDeviceDto(device, device.id) });
});

router.get("/auth/devices", async (req, res): Promise<void> => {
  const devices = await db
    .select()
    .from(devicesTable)
    .where(isNull(devicesTable.revokedAt))
    .orderBy(asc(devicesTable.createdAt));
  res.json({ devices: devices.map((d) => toDeviceDto(d, req.deviceId)) });
});

router.delete("/auth/devices/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid device id" });
    return;
  }
  const [revoked] = await db
    .update(devicesTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(devicesTable.id, id), isNull(devicesTable.revokedAt)))
    .returning();
  if (!revoked) {
    res.status(404).json({ error: "Device not found or already revoked" });
    return;
  }
  res.status(204).end();
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (req.deviceId !== undefined) {
    await db
      .update(devicesTable)
      .set({ revokedAt: new Date() })
      .where(eq(devicesTable.id, req.deviceId));
  }
  res.status(204).end();
});

export default router;
