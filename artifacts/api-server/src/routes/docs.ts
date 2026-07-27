import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";

const router: IRouter = Router();

// Read-only viewer for in-repo Markdown docs, served from the running deploy so
// the docs always match the code that's live. Only this fixed allowlist is
// served — the `name` is matched exactly, so there is no arbitrary path access
// or traversal. Paths are resolved from the process working directory (repo
// root on Render, matching how local_uploads is resolved in localStorage.ts).
const DOCS = [
  { name: "README.md", title: "README", file: "README.md" },
  { name: "docs/SYSTEM.md", title: "System overview", file: "docs/SYSTEM.md" },
  { name: "docs/ARCHITECTURE.md", title: "Architecture", file: "docs/ARCHITECTURE.md" },
  { name: "docs/DEPLOYMENT.md", title: "Deployment", file: "docs/DEPLOYMENT.md" },
  { name: "CLAUDE.md", title: "Claude guidance", file: "CLAUDE.md" },
  { name: "AGENTS.md", title: "Codex guidance", file: "AGENTS.md" },
] as const;

router.get("/docs", (_req, res): void => {
  res.json({ docs: DOCS.map(({ name, title }) => ({ name, title })) });
});

router.get("/doc", async (req, res): Promise<void> => {
  const name = typeof req.query.name === "string" ? req.query.name : "";
  const entry = DOCS.find((d) => d.name === name);
  if (!entry) {
    res.status(404).json({ error: "Unknown document" });
    return;
  }
  try {
    const content = await readFile(path.join(process.cwd(), entry.file), "utf8");
    res.json({ name: entry.name, content });
  } catch {
    res.status(404).json({ error: "Document not found on disk" });
  }
});

export default router;
