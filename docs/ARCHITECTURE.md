# Architecture

## Overview

Health Digit Tracker is a monorepo with a clear separation between the API contract, backend, frontend, and database layers. The OpenAPI spec is the authoritative contract — everything else is derived from or implements it.

```
openapi.yaml  ──codegen──▶  api-zod (Zod validators)
                        └──▶  api-client-react (React Query hooks)
                                    │
              Express routes ◀──────┘──────▶ React pages
                    │
             Drizzle ORM
                    │
             PostgreSQL 16
```

---

## Monorepo layout

```
artifacts/
  api-server/              @workspace/api-server   — Express 5 API
  health-digit/            @workspace/health-digit — React 19 frontend
lib/
  db/                      @workspace/db           — Drizzle schema + PG client
  api-spec/                @workspace/api-spec     — OpenAPI spec + Orval config
  api-zod/                 @workspace/api-zod      — Generated Zod validators
  api-client-react/        @workspace/api-client-react — Generated React Query hooks
```

Package manager: pnpm workspaces. All packages must be at least 1 day old before install (supply-chain security, see `pnpm-workspace.yaml`).

---

## Type-safe API contract

`lib/api-spec/openapi.yaml` is the single source of truth for all routes, request shapes, and response shapes.

### Codegen pipeline

```bash
pnpm --filter @workspace/api-spec run codegen
```

Orval reads the OpenAPI spec and writes two outputs:

| Output | Package | Consumer | Used for |
|---|---|---|---|
| Zod validators | `lib/api-zod/src/generated/` | API server | Request parameter validation |
| React Query hooks | `lib/api-client-react/src/generated/` | Frontend | Data fetching / mutations |

Both output directories are fully generated — never edit them directly.

### Adding or changing a route

1. Edit `lib/api-spec/openapi.yaml`
2. Run codegen
3. Implement the route handler in `artifacts/api-server/src/routes/`
4. Use the generated hook in the frontend via `@workspace/api-client-react`

---

## Screenshot analysis pipeline

```
User uploads image
      │
      ▼
POST /api/uploads
  ├── [local dev]  write to local_uploads/, store filePath as local://<name>
  └── [production] PUT to GCS via presigned URL, store filePath as /objects/<uuid>
      │
      ▼
POST /api/uploads/:id/analyze
      │
      ▼
analyzeScreenshot(filePath)          ← artifacts/api-server/src/lib/analysis.ts
  ├── fetchImageAsBase64()
  │     ├── [local://]  fs.readFile from local_uploads/
  │     └── [/objects/] GCS download via ObjectStorageService
  │
  ├── claude-sonnet-4-6 messages.create()
  │     vision input: base64 image
  │     system prompt: classify + extract structured JSON
  │
  ├── extractJson()  — robust parser (raw → code fences → brace scan)
  └── normalizeResult()  — validates classification, clamps confidence
      │
      ▼
INSERT llm_runs (raw JSONB always saved for auditability)
INSERT events / meals / workouts (normalized, type-dependent)
UPDATE uploads SET status='analyzed', classification, confidence, summary
```

### Classification categories

| Value | Data stored |
|---|---|
| `blood_pressure_reading` | events: systolic, diastolic, pulse |
| `glucose_reading` | events: value, unit (mg/dL or mmol/L) |
| `weight_reading` | events: value, unit (kg or lb) |
| `meal_event` | meals: calories, protein, carbs, fat, fiber, foods |
| `workout_event` | workouts: type, duration, heart rate, distance, pace |
| `unknown` | no structured data extracted |

### LLM prompt design

The system prompt in `analysis.ts` enforces:
- JSON-only output (no prose, no markdown fences in response)
- Strict field names that map directly to DB columns
- Realistic confidence scores (not inflated)
- Only the relevant array (`events`, `meals`, or `workouts`) is populated per image

---

## File storage

Two modes are supported; the active mode is determined at startup:

```
isLocalStorageMode = !PRIVATE_OBJECT_DIR && NODE_ENV !== 'production'
```

### Local development mode

Files are written to `artifacts/api-server/local_uploads/` by the Express upload handler. The `filePath` stored in the DB uses a custom URI scheme: `local://local_uploads/<filename>`.

A dev-only route serves these files:
```
GET /api/storage/local_uploads/:filename
```

`path.basename()` is applied to the filename parameter to prevent path traversal attacks.

### Production mode (GCS)

Files are uploaded to Google Cloud Storage. The `filePath` stored in the DB is `/objects/<uuid>`. Files are served via:
```
GET /api/storage/objects/*
```

GCS auth uses Replit's sidecar service (`http://127.0.0.1:1106`) — no service account key required on Replit.

### Frontend URL resolution

`resolveUploadImageUrl(filePath)` in `artifacts/health-digit/src/lib/api.ts` is the single function that converts a stored DB path to a browser-loadable URL:

- `local://local_uploads/<name>` → `http://localhost:8080/api/storage/local_uploads/<name>`
- `/objects/<uuid>` → `/api/storage/objects/<uuid>` (relative — works on same origin in production)

Always use this function in `<img src>` attributes that reference upload paths. Never construct these URLs manually.

---

## Database

Schema: `lib/db/src/schema/uploads.ts`  
ORM: Drizzle  
Dialect: PostgreSQL 16  
Migrations: none — schema push only (`pnpm --filter @workspace/db run push`)

### Table relationships

```
users
  └── uploads (userId FK)
        ├── llm_runs (uploadId FK)
        ├── events (uploadId FK)
        │     ├── meal_event_links (eventId FK)
        │     └── workout_event_links (eventId FK)
        ├── meal_event_links (uploadId FK) → meals
        ├── workout_event_links (uploadId FK) → workouts
        ├── reviews (uploadId FK)
        └── outcomes (uploadId FK) → events
```

### Upload status lifecycle

```
pending  →  analyzing  →  analyzed
                      └→  failed
```

Status is set to `analyzing` before the LLM call starts; set to `analyzed` on success or `failed` on error. The frontend polls every 2 seconds while status is `pending` or `analyzing`.

---

## Backend

**Framework**: Express 5 (async error propagation built-in)  
**Build**: esbuild → `artifacts/api-server/dist/index.mjs` (ESM)  
**Logging**: Pino structured JSON, with pino-pretty in non-production

### Route structure

```
/api
  /healthz                       GET   health check
  /uploads/summary               GET   count by classification
  /uploads/recent                GET   recent uploads
  /uploads                       GET   paginated list (filterable)
  /uploads                       POST  create upload (multipart)
  /uploads/:id                   GET   detail with llmRuns/events/meals/workouts/reviews
  /uploads/:id/analyze           POST  trigger LLM analysis
  /reviews                       POST  submit manual review
  /outcomes                      GET   list health outcomes
  /storage/uploads/request-url   POST  get presigned GCS upload URL
  /storage/local_uploads/:name   GET   serve local dev file (dev only)
  /storage/public-objects/*      GET   serve public GCS assets
  /storage/objects/*             GET   serve private GCS objects
```

---

## Frontend

**Framework**: React 19 + Vite 7  
**Routing**: Wouter (lightweight, no React Router)  
**Styling**: Tailwind CSS 4 + shadcn/ui (Radix UI primitives)  
**State**: TanStack React Query 5 (all server state via generated hooks)

### API base URL

Set at startup via `setBaseUrl(API_BASE)` in `main.tsx`. `API_BASE` is read from `VITE_API_BASE_URL` (defaults to `http://localhost:8080`). All generated React Query hooks use this base.

### Page data flow

```
DetailPage
  useGetUpload(id)  ←─ generated hook (React Query GET /uploads/:id)
  useAnalyzeUpload()  ←─ generated hook (React Query POST /uploads/:id/analyze)
  resolveUploadImageUrl(upload.filePath)  →  <img src>

ReviewPage
  useListUploads({ unreviewed: true })
  useCreateReview()

UploadPage
  fetch(apiUrl('/api/uploads'), { method: 'POST', body: formData })
  useAnalyzeUpload()
```

---

## Supply-chain security

`pnpm-workspace.yaml` enforces a minimum package release age of **1440 minutes (24 hours)** before any package can be installed. This catches most publish-time supply-chain attacks, which are typically detected within hours.

Exclusions: `@replit/*` and `stripe-replit-sync` (deployment tooling with different release cadences).
