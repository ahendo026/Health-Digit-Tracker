# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
# Start frontend dev server (requires PORT and BASE_PATH env vars)
pnpm --filter @workspace/health-digit run dev

# Start API server (builds first with esbuild, then runs with node)
pnpm --filter @workspace/api-server run dev

# Build everything (typecheck + bundle)
pnpm run build
```

### TypeScript

```bash
# Typecheck all packages
pnpm run typecheck

# Typecheck a specific package
pnpm --filter @workspace/health-digit run typecheck
pnpm --filter @workspace/api-server run typecheck
```

### Database

```bash
# Push Drizzle schema changes to PostgreSQL (no migration files generated)
pnpm --filter @workspace/db run push

# Force push (destructive — drops and recreates)
pnpm --filter @workspace/db run push-force
```

### API Code Generation

```bash
# Regenerate React Query hooks and Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

There is no test runner configured. Type checking is the primary correctness mechanism.

---

## Architecture

This is a **health data digitization app**. Users upload screenshots from fitness trackers, health apps, or wearables. Claude Sonnet 4.6 (vision) classifies and extracts structured data from the image. Users can then review, approve, or reject the extracted data.

### Monorepo layout

```
artifacts/
  health-digit/     # React 19 + Vite frontend (@workspace/health-digit)
  api-server/       # Express 5 backend (@workspace/api-server)
lib/
  db/               # Drizzle ORM schema + PostgreSQL client (@workspace/db)
  api-spec/         # OpenAPI YAML spec + Orval codegen config (@workspace/api-spec)
  api-zod/          # Auto-generated Zod validators from OpenAPI (@workspace/api-zod)
  api-client-react/ # Auto-generated React Query hooks from OpenAPI (@workspace/api-client-react)
```

### Type-safe API contract flow

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the **single source of truth** for all API routes. From it, Orval generates:
- `@workspace/api-zod` — Zod validators used server-side for request validation
- `@workspace/api-client-react` — React Query hooks used in the frontend

**When adding or changing an API route:**
1. Update `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen`
3. Implement the route in `artifacts/api-server/src/routes/`
4. Consume it in the frontend via the generated hooks

Never edit files in `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/` — they are overwritten on every codegen run.

### Screenshot analysis pipeline

1. User uploads a file via the frontend upload form
2. `POST /api/uploads` receives the file (multipart/form-data via multer)
   - **Local dev**: written to `artifacts/api-server/local_uploads/`, stored as `local://<filename>`
   - **Production**: uploaded to Google Cloud Storage, stored as `/objects/<uuid>`
3. Frontend calls `POST /api/uploads/:id/analyze`
4. `analyzeScreenshot()` in `artifacts/api-server/src/lib/analysis.ts`:
   - Reads `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — if absent, returns a stub result
   - Fetches the image (local disk or GCS), base64-encodes it
   - Sends to `claude-sonnet-4-6` with a structured JSON system prompt
   - Extracts and normalizes the JSON response
5. LLM output is saved verbatim in `llm_runs` (always, for auditability)
6. Normalized data is written to `events`, `meals`, or `workouts` depending on classification
7. The `uploads` row is updated with `status: "analyzed"`, classification, confidence, and summary

### File storage: local vs production

Local development mode is active when `PRIVATE_OBJECT_DIR` is not set and `NODE_ENV !== "production"`.

| Concern | Local dev | Production (GCS) |
|---|---|---|
| File written by | Express/multer directly to `local_uploads/` | Presigned URL PUT to GCS |
| Stored `filePath` | `local://local_uploads/<filename>` | `/objects/<uuid>` |
| Served via | `GET /api/storage/local_uploads/:filename` | `GET /api/storage/objects/*` |
| Frontend URL resolver | `resolveUploadImageUrl()` in `src/lib/api.ts` | same helper, different branch |

`resolveUploadImageUrl(filePath)` in `artifacts/health-digit/src/lib/api.ts` is the single place that converts a stored DB path to a browser-loadable URL. Use it wherever an `<img src>` references an upload — never hardcode `/api/storage${filePath}`.

### Database schema (Drizzle + PostgreSQL)

All 12 tables are defined in `lib/db/src/schema/uploads.ts`:

| Table | Purpose |
|---|---|
| `users` | User accounts |
| `uploads` | One per screenshot; classification, confidence, status, file path |
| `llm_runs` | One per analysis attempt; raw JSONB output + model/prompt version |
| `events` | Normalized health readings (glucose, blood pressure, weight) |
| `meals` | Extracted nutrition data |
| `workouts` | Extracted exercise data |
| `meal_event_links` | M:M join: meals ↔ events |
| `workout_event_links` | M:M join: workouts ↔ events |
| `outcomes` | Derived health outcomes linked to an upload |
| `reviews` | Manual review decisions (approved/rejected + quality signals) |
| `rules` | Condition/action JSONB pairs for configurable processing |
| `airtable_sync_log` | Tracks sync state with Airtable integration |

Schema changes are applied via `drizzle-kit push` (no migration files). The schema is the authoritative definition.

### Frontend routing (Wouter)

| Route | Page | Purpose |
|---|---|---|
| `/` | Upload | Drag-and-drop screenshot upload |
| `/history` | History | Paginated list of uploads with status |
| `/uploads/:id` | Detail | Full analysis results + raw LLM output |
| `/review` | Review | Manual approval/rejection workflow |

### Key technology choices

- **Package manager**: pnpm with workspace support. All packages must be ≥1 day old before install (supply-chain mitigation configured in `pnpm-workspace.yaml`).
- **Frontend build**: Vite 7 with React 19, Tailwind CSS 4, shadcn/ui + Radix UI
- **Server build**: esbuild (see `artifacts/api-server/build.mjs`) — outputs ESM bundle to `dist/`
- **Logging**: Pino structured JSON logs via `pino-http` middleware; pretty-printed in non-production
- **Deployment**: Replit (Node 24, PostgreSQL 16). API server on port 8080, frontend on port 24283.

---

## Common tasks

### Adding a classification category

1. Add the new string to the `Classification` union in `artifacts/api-server/src/lib/analysis.ts`
2. Update the system prompt in the same file to describe when to use it
3. Add handling in the `POST /api/uploads/:id/analyze` route if new DB tables are needed
4. Update `ClassificationBadge` in `artifacts/health-digit/src/components/badges.tsx`

### Changing the LLM model or prompt

The prompt and model are co-located in `artifacts/api-server/src/lib/analysis.ts`. The system prompt is the `SYSTEM_PROMPT` constant. The model is passed directly to `client.messages.create()`. Bump `promptVersion` in the `llm_runs` insert when making material prompt changes so old and new runs can be distinguished.

### Regenerating API types after an OpenAPI change

```bash
pnpm --filter @workspace/api-spec run codegen
```

This runs Orval, then patches the generated barrel file to remove duplicate exports. Commit the generated files alongside the spec change.

### Pushing a DB schema change

Edit `lib/db/src/schema/uploads.ts`, then:

```bash
pnpm --filter @workspace/db run push
```

No migration files are generated. In production this is a direct schema push — coordinate destructive changes carefully.

---

## Environment variables

### Backend (required)

| Variable | Description |
|---|---|
| `PORT` | Port the Express server listens on |
| `DATABASE_URL` | PostgreSQL connection string |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key for Claude vision |

### Backend (optional)

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | — | Set to `production` to disable local storage mode |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic default | Override Claude API base URL |
| `PRIVATE_OBJECT_DIR` | — | GCS bucket path for private uploads (e.g. `/mybucket/uploads`). If unset, local file storage is used. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | — | Comma-separated GCS paths for public assets |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full URL to the API server (e.g. `http://localhost:8080`) |
| `PORT` | Vite dev server port |
| `BASE_PATH` | Vite `base` config (use `/` locally, may differ on Replit) |
