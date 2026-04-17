# Health Digit

## Overview

A private MVP web app for uploading and analyzing health, food, wearable, and workout app screenshots. The system stores images, sends them to an analysis endpoint, stores raw LLM output, normalizes into structured data (events, meals, workouts), and allows manual review.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **File storage**: Google Cloud Storage (Replit Object Storage) via presigned URLs
- **File upload handling**: multer (memory storage, then streamed to GCS)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Wouter routing
- **State management**: React Query (TanStack)

## Architecture

```
artifacts/
  api-server/         # Express 5 backend
    src/
      lib/
        analysis.ts   # Placeholder LLM analysis service
        objectStorage.ts  # GCS client wrapper
        objectAcl.ts  # ACL framework
        logger.ts     # Pino structured logging
      routes/
        uploads.ts    # All upload/review/outcome routes
        storage.ts    # Object storage presigned URL routes
        health.ts     # Health check
        index.ts      # Route aggregator
  health-digit/       # React + Vite frontend
    src/
      pages/          # Upload, History, Detail, Review pages
      components/     # Layout, UI components

lib/
  api-spec/           # OpenAPI spec (source of truth)
  api-client-react/   # Generated React Query hooks
  api-zod/            # Generated Zod schemas for server validation
  db/                 # Drizzle ORM schemas and client
    src/schema/
      uploads.ts      # All 12 database tables
```

## Database Tables

- `users` — user accounts
- `uploads` — uploaded screenshots with classification, status, confidence
- `llm_runs` — raw LLM output and metadata per analysis run
- `events` — normalized health events (glucose, blood pressure, weight)
- `meals` — normalized meal events with nutrition data
- `workouts` — normalized workout events with heart rate zones
- `meal_event_links` — links between meals and events
- `workout_event_links` — links between workouts and events
- `outcomes` — health outcomes
- `rules` — processing rules
- `reviews` — manual review records
- `airtable_sync_log` — sync tracking

## Screenshot Classifications

- `glucose_reading`
- `blood_pressure_reading`
- `weight_reading`
- `meal_event`
- `workout_event`
- `unknown`

## API Routes

- `POST /api/uploads` — upload a screenshot (multipart/form-data)
- `POST /api/uploads/:id/analyze` — trigger LLM analysis
- `GET /api/uploads` — list uploads (paginated, filterable by classification)
- `GET /api/uploads/:id` — get upload detail with normalized data
- `GET /api/uploads/summary` — get counts by classification
- `GET /api/uploads/recent` — get recent uploads
- `POST /api/reviews` — submit manual review
- `GET /api/outcomes` — list health outcomes
- `POST /api/storage/uploads/request-url` — request presigned upload URL
- `GET /api/storage/objects/*` — serve stored objects

## Frontend Pages

- `/` — Upload page (drag-and-drop screenshot upload)
- `/history` — History page (paginated upload list with status)
- `/uploads/:id` — Detail page (full analysis results)
- `/review` — Review page (manual review workflow)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/health-digit run dev` — run frontend locally

## Notes

- The analysis service (`artifacts/api-server/src/lib/analysis.ts`) is a placeholder that returns randomized sample results. Replace with actual LLM API calls for production.
- File uploads go directly to Google Cloud Storage via presigned URLs. The server receives the file via multer, streams it to GCS, then stores the object path in the database.
- The `lib/api-spec/orval.config.ts` includes a post-codegen patch to fix the api-zod `index.ts` barrel (removes duplicate exports).
