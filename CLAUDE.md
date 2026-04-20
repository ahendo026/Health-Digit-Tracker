# CLAUDE.md

Claude Code project guidance for the HealthDigits repository.
Full system documentation is in **[docs/SYSTEM.md](docs/SYSTEM.md)**.

---

## Commands

```bash
# Start frontend dev server (port 24283)
pnpm --filter @workspace/health-digit run dev

# Build and start API server (port 8080)
pnpm --filter @workspace/api-server run dev

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

There is no test runner. Type checking is the primary correctness mechanism.

---

## Architecture in brief

- **OpenAPI spec** (`lib/api-spec/openapi.yaml`) is the single source of truth for all routes
- **Orval codegen** generates `lib/api-zod` (server validation) and `lib/api-client-react` (frontend hooks) — never edit these by hand
- **File storage**: local disk in dev (`local://` URIs), GCS in production (`/objects/` paths)
- **LLM**: `analyzeScreenshot()` in `artifacts/api-server/src/lib/analysis.ts` calls Claude Sonnet 4.6 with a vision prompt; returns a typed `AnalysisResult`
- **DB**: 12 tables defined in `lib/db/src/schema/uploads.ts`; schema-push only, no migration files

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

Always use `resolveUploadImageUrl(filePath)` from `artifacts/health-digit/src/lib/api.ts` for `<img src>` attributes that reference uploads. Never hardcode `/api/storage${filePath}` — it breaks for `local://` paths in development.

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
| `PRIVATE_OBJECT_DIR` | — | GCS bucket path for uploads. Unset = local storage mode. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | — | Comma-separated GCS paths for public assets |
| `NODE_ENV` | — | Set to `production` to disable local dev routes |
| `LOG_LEVEL` | `info` | Pino log level |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full API URL, e.g. `http://localhost:8080` |
| `PORT` | Vite dev server port: `24283` |
| `BASE_PATH` | Vite base path: `/` |
