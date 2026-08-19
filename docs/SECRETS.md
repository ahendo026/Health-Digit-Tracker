# Secrets & Key Management

Where every credential in this project is created, stored, and rotated.
Read this before adding, moving, or rotating any key. The golden rule:

> **A secret may only ever live in an untracked file or a hosted dashboard —
> never in anything git tracks.** `.claude/settings.json` is tracked. Assume any
> password that has ever appeared in a tracked file is compromised and rotate it.

---

## Credential inventory

| Credential | Where it is created / rotated | Used by | Needed in dev? | Needed in prod? |
|---|---|---|---|---|
| `DATABASE_URL` (Neon password, also mirrored as `PGUSER`/`PGPASSWORD`) | Neon console → org **Affinity Networks** → project **healthdigit** → Connect (production branch, db `neondb`, role `neondb_owner`) | api-server, `pnpm --filter @workspace/db run push`, bench tools | Yes | Yes (Render dashboard) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com) → API Keys | `analyzeScreenshot()` in `artifacts/api-server/src/lib/analysis.ts` | Optional — without it the server runs but every analysis returns *"Analysis service is not configured."* | Yes (Render dashboard) |
| `GCS_CREDENTIALS_JSON` | GCP IAM → service account key (single-line JSON) | GCS uploads in `objectStorage.ts` | No (dev uses `local://` disk storage) | Yes if `PRIVATE_OBJECT_DIR` is set |
| `AIRTABLE_API_KEY` (+ base/table IDs) | Airtable → Developer hub → Personal access tokens | Airtable sync (off by default via `AIRTABLE_SYNC_ENABLED`) | No | Only if sync enabled |

Non-secrets that ride along in the same env blocks: `BASE_PATH`, `PORT`, `NODE_ENV`, `VITE_API_BASE_URL`.

---

## Every place a copy can live

### Development (this machine, WSL)

| Location | Tracked by git? | What belongs there |
|---|---|---|
| `.claude/settings.json` → `env` block | **YES — tracked. Never put secrets here.** | Non-secret env only (`BASE_PATH`). Injected into every Claude Code session opened in this repo. |
| `.claude/settings.local.json` → `env` block | No (ignored via repo `.gitignore` and the global `~/.config/git/ignore`) | **The correct home for dev secrets** used inside Claude Code sessions: `DATABASE_URL`, `PGPASSWORD`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`. |
| `.codex/config.toml` → `[shell_environment_policy.set]` | No (untracked) | Same role as above but for Codex CLI sessions. **Easy to forget during rotation.** |
| `artifacts/health-digit/.env` | No (now gitignored) | Frontend only: `VITE_API_BASE_URL`. No secrets — Vite inlines `VITE_*` values into the public JS bundle. |
| Plain terminal (outside Claude Code / Codex) | — | Nothing is exported automatically. `~/.bashrc` / `~/.profile` / `WSLENV` contain **no** project credentials. Export inline: `DATABASE_URL='...' pnpm run dev:api`. |

The api-server has **no dotenv loader** — it reads plain `process.env`. Whatever
shell launches `pnpm run dev:api` must already have the variables exported.
Claude Code and Codex inject their settings-file env into their session shells;
a regular terminal gets nothing.

> As of 2026-08-19, `AI_INTEGRATIONS_ANTHROPIC_API_KEY` is **not stored anywhere
> on the dev machine**. Locally-run servers cannot analyze screenshots until you
> add it to `.claude/settings.local.json` (or export it inline). Analyses that
> "just worked" ran through the deployed Render API, which holds its own copy.

### Production (Render)

All secrets live in the **Render dashboard** as environment variables on the
`healthdigits-api` service. `render.yaml` declares them with `sync: false`,
which means "value is set in the dashboard, never in the repo." Keep it that way.

### Source of truth

The hosted consoles (Neon, Anthropic, GCP, Airtable) are canonical. Every file
above is only a copy. When in doubt, fetch the current value from the console —
don't trust a copy that might be half-rotated.

---

## How env reaches a running process (dev)

```
.claude/settings.json  ─┐  (merged, local wins)
.claude/settings.local.json ─┴─► Claude Code session shell ─► `pnpm run dev:api` child process
.codex/config.toml ────────────► Codex session shell ───────► same
plain terminal ────────────────► only what you export yourself
```

**Settings env is read once at session start.** After editing any of these
files, restart the Claude Code / Codex session — the running session keeps the
old values, which is exactly how stale-credential confusion starts.

---

## Rotation checklist — Neon database password

Rotating in the Neon console alone is not enough. Update **every** copy:

1. Reset the password in the Neon console (project **healthdigit**) and copy the new connection string.
2. `.claude/settings.local.json` → `env.DATABASE_URL` **and** `env.PGPASSWORD`.
3. `.codex/config.toml` → `DATABASE_URL` **and** `PGPASSWORD` (both lines!).
4. Render dashboard → `healthdigits-api` → `DATABASE_URL`.
5. Delete any `permissions.allow` rules in `.claude/settings.local.json` that embed the old connection string (they're dead rules; don't "update" them — remove them).
6. Confirm `.claude/settings.json` contains no `DATABASE_URL`/`PGPASSWORD` at all.
7. Restart every Claude Code / Codex session and the API server.
8. Verify: `pnpm --filter @workspace/db run push` connects cleanly.

## Rotation checklist — Anthropic API key

1. Create the new key / disable the old one in the Anthropic Console.
2. Render dashboard → `healthdigits-api` → `AI_INTEGRATIONS_ANTHROPIC_API_KEY`.
3. `.claude/settings.local.json` → `env` block, if a local copy exists.
4. Restart sessions/servers as above.

---

## History note

Neon credentials were committed to this repository (`.claude/settings.json`,
commit `d6a113f`) and pushed to the public GitHub remote. Treat every password
that has ever appeared in git history as public knowledge — rotation, not
deletion, is the fix. That file must never carry secrets again; keep its `env`
block down to non-secrets and put credentials in `.claude/settings.local.json`.
