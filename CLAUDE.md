# CLAUDE.md

Claude Code project guidance for the HealthDigits repository.
Full system documentation is in **[docs/SYSTEM.md](docs/SYSTEM.md)**.

---

## Commands

```bash
# Start API server (port 8080)
pnpm run dev:api

# Start frontend dev server (port 24283, host 0.0.0.0 for phone/Tailscale testing)
pnpm run dev:frontend

# Or invoke the workspace scripts directly
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/health-digit run dev

# Rebuild API after code changes (no watch mode)
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start

# Stop — Ctrl+C in each terminal

# Type-check all packages
pnpm run typecheck

# Type-check one package
pnpm --filter @workspace/health-digit run typecheck
pnpm --filter @workspace/api-server run typecheck

# Build everything
pnpm run build

# Push DB schema changes to PostgreSQL (no migrations generated)
pnpm --filter @workspace/db run push

# Regenerate React Query hooks + Zod validators from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

The root `dev:frontend` script sets `VITE_API_BASE_URL` to the Tailscale hostname so the frontend works from external devices (phones, other desktops on the tailnet). For plain localhost testing, use the workspace-level `dev` script.

There is no test runner. Type checking is the primary correctness mechanism.

---

## Architecture in brief

- **OpenAPI spec** (`lib/api-spec/openapi.yaml`) is the single source of truth for all routes
- **Orval codegen** generates `lib/api-zod` (server validation) and `lib/api-client-react` (frontend hooks) — never edit these by hand
- **File storage**: local disk in dev (`local://` URIs), GCS in production (`/objects/` paths). GCS auth supports either Replit sidecar (default) or standard service account credentials via `GCS_CREDENTIALS_JSON` env var.
- **LLM**: `analyzeScreenshot()` in `artifacts/api-server/src/lib/analysis.ts` calls the Claude vision model configured in Settings (default `claude-opus-4-8`, selectable via the global `app_settings` store); returns a typed `AnalysisResult` that includes `capturedAt` (date/time extracted from the image itself). All model-emitted datetimes are LOCAL wall-clock strings (no offset); the uploads route converts them to UTC via `wallClockToInstant()` in `lib/timezone.ts` using the effective timezone (Settings override > device zone from the request > `uploads.timezone` > `America/New_York`).
- **DB**: 13 tables defined in `lib/db/src/schema/uploads.ts` (includes `app_settings`); schema-push only, no migration files
- **Deployment**: `render.yaml` at repo root defines two Render services — API web service + static frontend. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

See [docs/SYSTEM.md](docs/SYSTEM.md) for the full architecture, data flow, and component descriptions.

---

## Key rules

### API changes

1. Edit `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen`
3. Implement the route in `artifacts/api-server/src/routes/`
4. Consume the generated hook in the frontend

Never write routes that aren't in the OpenAPI spec first.

### Image URLs

Always use `resolveUploadImageUrl(filePath)` from `artifacts/health-digit/src/lib/api.ts` for `<img src>` attributes that reference uploads. It prefixes `API_BASE` for both `local://` dev paths and `/objects/` GCS paths so cross-origin deployments (separate frontend/API hosts) work correctly.

### Generated files

Never edit files in:
- `lib/api-zod/src/generated/`
- `lib/api-client-react/src/generated/`

They are overwritten on every `codegen` run.

### Schema changes

Edit `lib/db/src/schema/uploads.ts`, then run `pnpm --filter @workspace/db run push`. There are no rollback files — coordinate destructive changes carefully in production.

### LLM prompt changes

Bump `promptVersion` in the `llm_runs` insert (in `artifacts/api-server/src/routes/uploads.ts`) whenever making material changes to the system prompt in `analysis.ts`. This keeps old and new LLM runs distinguishable.

---

## Common tasks

### Add a new classification category

1. Add the value to the `Classification` union in `analysis.ts`
2. Update the system prompt to describe when to use it
3. Add extraction handling in `POST /api/uploads/:id/analyze` if new DB tables are needed
4. Update `ClassificationBadge` in `artifacts/health-digit/src/components/badges.tsx`
5. Update the OpenAPI spec and run codegen

### Add a new API route

1. Add to `lib/api-spec/openapi.yaml`
2. Run codegen
3. Implement in `artifacts/api-server/src/routes/`
4. Consume generated hook in frontend

### After pulling changes that include DB schema updates

```bash
pnpm --filter @workspace/db run push
```

### After pulling changes that include OpenAPI spec updates

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Environment variables

**Where keys live and how to rotate them: [docs/SECRETS.md](docs/SECRETS.md).**
Secrets go in `.claude/settings.local.json` (untracked) or the Render dashboard — never in `.claude/settings.json`, which is tracked in git. The api-server has no dotenv loader; the shell that launches it must already have these variables exported (Claude Code injects its settings `env` block into session shells; a plain terminal does not).

### Backend (required)

| Variable | Description |
|---|---|
| `PORT` | `8080` |
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |

### Backend (optional)

| Variable | Default | Description |
|---|---|---|
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic default | Claude API base URL override |
| `PRIVATE_OBJECT_DIR` | — | GCS bucket path for uploads, e.g. `/my-bucket/uploads`. Unset = local storage mode. Leading slash is auto-added if omitted. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | — | Comma-separated GCS paths for public assets |
| `GCS_CREDENTIALS_JSON` | — | Service account JSON (as a single-line string) for standard GCS auth. When set, the app uses the GCS SDK's native signing. When unset, falls back to Replit's sidecar at `http://127.0.0.1:1106`. Required for non-Replit deployments (Render, Cloud Run, etc.). |
| `AIRTABLE_SYNC_ENABLED` | `false` | Master kill-switch. Sync is fully disabled unless set to the string `"true"`, regardless of other Airtable vars. |
| `AIRTABLE_API_KEY` | — | Personal Access Token. Required when the sync is enabled. |
| `AIRTABLE_BASE_ID` | — | Airtable base ID (e.g. `appXXXXXXXXXXXXXX`). Required with `AIRTABLE_API_KEY`. |
| `AIRTABLE_UPLOADS_TABLE` / `AIRTABLE_LLM_RUNS_TABLE` / `AIRTABLE_REVIEWS_TABLE` / `AIRTABLE_MEALS_TABLE` / `AIRTABLE_WORKOUTS_TABLE` | — | Airtable table names or IDs, one per synced entity. Missing values disable sync for that entity only. |
| `NODE_ENV` | — | Set to `production` to disable local dev routes |
| `LOG_LEVEL` | `info` | Pino log level |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full API URL, e.g. `http://localhost:8080` |
| `PORT` | Vite dev server port: `24283` |
| `BASE_PATH` | Vite base path: `/` |
