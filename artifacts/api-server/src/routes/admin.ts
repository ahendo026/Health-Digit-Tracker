import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/admin/wipe", async (req, res) => {
  const provided = req.header("x-admin-secret");
  const expected = process.env.SESSION_SECRET;
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    await db.execute(sql`
      TRUNCATE TABLE
        airtable_sync_log,
        reviews,
        outcomes,
        meal_event_links,
        workout_event_links,
        llm_runs,
        events,
        meals,
        workouts,
        rules,
        uploads,
        users
      RESTART IDENTITY CASCADE;
    `);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
