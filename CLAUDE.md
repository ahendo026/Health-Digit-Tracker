# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
# Start frontend dev server
pnpm --filter @workspace/health-digit run dev

# Start API server (builds first, then runs)
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
# Push Drizzle schema changes to PostgreSQL
pnpm --filter @workspace/db run push

# Force push (destructive)
pnpm --filter @workspace/db run push-force
```

### API Code Generation

```bash
# Regenerate React Query hooks and Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

There is no test runner configured. Type checking is the primary correctness mechanism.

## Architecture

This is a **health data digitization app**. Users upload screenshots from fitness trackers, health apps, or wearables. Claude Sonnet 4.6 (vision) classifies and extracts structured data from the image. Users can then review, approve, or reject the extracted data.

### Monorepo Layout

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

### Type-Safe API Contract Flow

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the **single source of truth** for all API routes. From it, Orval generates:
- `@workspace/api-zod` — Zod validators used server-side for request validation
- `@workspace/api-client-react` — React Query hooks used in the frontend

**When adding or changing an API route:** update `openapi.yaml` first, re-run `codegen`, then implement the route in `artifacts/api-server/src/routes/` and consume it in the frontend via the generated hooks.

### Screenshot Analysis Pipeline

1. Frontend requests a presigned GCS URL via `POST /api/storage/uploads/request-url`
2. Client uploads the image directly to Google Cloud Storage
3. Frontend calls `POST /api/uploads` to register the upload, then `POST /api/uploads/:id/analyze`
4. Server fetches the image from GCS, base64-encodes it, and sends it to Claude Sonnet 4.6 with a system prompt that extracts one of six classification categories: `glucose_reading`, `blood_pressure_reading`, `weight_reading`, `meal_event`, `workout_event`, `unknown`
5. LLM response (JSON with `classification`, `confidence`, `summary`, typed structured data) is parsed and normalized into the appropriate DB tables
6. Raw LLM output is always stored in `llm_runs` for auditability

The LLM integration lives in `artifacts/api-server/src/services/llm-analysis.ts`.

### Database Schema (Drizzle + PostgreSQL)

Key tables and their relationships:
- **uploads** — One per screenshot; holds classification, confidence, status (`pending` → `analyzed`), and GCS path
- **llm_runs** — One per analysis attempt on an upload; stores raw JSONB output and model/prompt version
- **events** — Normalized health readings (glucose, blood pressure, weight) linked to an upload
- **meals** / **workouts** — Extracted nutrition and exercise data linked to an upload
- **meal_event_links** / **workout_event_links** — M:M joins between meals/workouts and health events
- **reviews** — Manual review decisions (approved/rejected, correctness feedback) linked to an upload
- **rules** — Condition/action pairs as JSONB for configurable processing logic
- **airtable_sync_log** — Tracks sync state with Airtable integration

Schema is defined in `lib/db/src/schema/` and pushed via Drizzle (no migrations, schema push only).

### Frontend Routing (Wouter)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Upload | Drag-and-drop screenshot upload |
| `/history` | History | Paginated list of uploads with status |
| `/uploads/:id` | Detail | Full analysis results + raw LLM output |
| `/review` | Review | Manual approval/rejection workflow |

### Key Technology Choices

- **Package manager:** pnpm with workspace support. All packages must be ≥1 day old before install (supply-chain mitigation configured in `pnpm-workspace.yaml`).
- **Frontend build:** Vite 7 with React 19, Tailwind CSS 4, shadcn/ui + Radix UI
- **Server build:** esbuild (see `artifacts/api-server/build.mjs`) — outputs CJS bundle
- **Logging:** Pino structured JSON logs via `pino-http` middleware
- **Deployment:** Replit (Node 24, PostgreSQL 16). API server on port 8080, frontend on port 24283.
