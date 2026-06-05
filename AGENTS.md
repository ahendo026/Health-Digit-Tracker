# AGENTS.md

Codex guidance for the HealthDigits repository. Keep this file concise; fuller system documentation lives in `docs/SYSTEM.md`, deployment notes in `docs/DEPLOYMENT.md`, and existing agent guidance in `CLAUDE.md`.

## Project Overview

HealthDigits digitizes health data from screenshots. Users upload screenshots from health apps, wearables, or medical devices. The API sends images to Claude Sonnet 4.6 vision, classifies them, extracts structured readings, and stores approved data in PostgreSQL. The frontend provides upload, history, detail, and review flows.

## Architecture

- Monorepo using pnpm workspaces.
- Frontend: `artifacts/health-digit/` using React 19, Vite 7, Tailwind CSS 4, shadcn/ui/Radix, Wouter, TanStack React Query, and generated Orval hooks.
- API server: `artifacts/api-server/` using Express 5, Node 24, TypeScript 5.9, Pino, multer, and generated Zod validators.
- Database: `lib/db/` using PostgreSQL 16/Neon and Drizzle ORM. Main schema file: `lib/db/src/schema/uploads.ts`.
- API contract: `lib/api-spec/openapi.yaml` is the source of truth.
- AI analysis: `artifacts/api-server/src/lib/analysis.ts`.
- Upload analysis route: `artifacts/api-server/src/routes/uploads.ts`.
- Storage: local dev uses `local_uploads/` and `local://` URIs; production uses GCS/Replit object storage with `/objects/` paths.

## Commands

```bash
# Install dependencies
pnpm install

# Start API server on port 8080
pnpm run dev:api

# Start frontend dev server on port 24283
pnpm run dev:frontend

# Health check
curl http://localhost:8080/api/healthz

# Type-check all packages
pnpm run typecheck

# Build all packages
pnpm run build

# Push DB schema changes; no migration files are generated
pnpm --filter @workspace/db run push

# Regenerate generated API code from OpenAPI
pnpm --filter @workspace/api-spec run codegen
```

There is no test runner currently. Type checking is the main correctness check.

## API Workflow

For API changes:

1. Edit `lib/api-spec/openapi.yaml` first.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Implement or update routes in `artifacts/api-server/src/routes/`.
4. Consume generated frontend hooks from `lib/api-client-react`.

Do not implement routes that are not defined in the OpenAPI spec.

## Generated Files

Do not manually edit generated files under:

- `lib/api-zod/src/generated/`
- `lib/api-client-react/src/generated/`

They are overwritten by `pnpm --filter @workspace/api-spec run codegen`.

## Database Workflow

For schema changes, edit `lib/db/src/schema/uploads.ts`, then run:

```bash
pnpm --filter @workspace/db run push
```

This project uses schema push only and has no rollback migrations. Treat destructive schema changes with care.

## Frontend Image URLs

For uploaded image rendering, use `resolveUploadImageUrl(filePath)` from `artifacts/health-digit/src/lib/api.ts`. This handles both `local://` development paths and `/objects/` production paths.

## LLM Prompt Rule

For material prompt changes, update the prompt in `artifacts/api-server/src/lib/analysis.ts` and bump `promptVersion` in the `llm_runs` insert inside `artifacts/api-server/src/routes/uploads.ts`.

## Supported Classifications

- `blood_pressure_reading`
- `glucose_reading`
- `weight_reading`
- `meal_event`
- `workout_event`
- `unknown`
