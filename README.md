# Health Digit Tracker

A private web app for digitizing health data from fitness tracker screenshots. Upload an image from any wearable, health app, or blood pressure monitor — Claude Sonnet 4.6 (vision) classifies and extracts the structured data, which you can then review, approve, or reject.

---

## What it does

1. **Upload** a screenshot from any health app (blood pressure monitor, glucose meter, Apple Health, Garmin, etc.)
2. **Analyze** — the server sends the image to Claude Sonnet 4.6, which returns a structured JSON payload: classification, confidence score, summary, and typed readings
3. **Review** — confirm or correct the extracted data before it is marked as finalized
4. **History** — browse all uploads with filtering by classification and status

### Supported classifications

| Classification | Description |
|---|---|
| `blood_pressure_reading` | Systolic/diastolic + pulse readings |
| `glucose_reading` | Blood glucose values with units (mg/dL or mmol/L) |
| `weight_reading` | Body weight values with units (kg or lb) |
| `meal_event` | Meal nutrition data (calories, macros, foods) |
| `workout_event` | Exercise data (type, duration, heart rate, distance) |
| `unknown` | Unrecognized image content |

---

## Quick start

### Prerequisites

- Node.js 24
- pnpm 9+
- PostgreSQL 16 (local or cloud)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set environment variables

**Backend** (`artifacts/api-server/.env` or shell):

```bash
PORT=8080
DATABASE_URL=postgres://user:password@localhost:5432/health_digit
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-...
# Optional: leave unset to use local file storage in development
# PRIVATE_OBJECT_DIR=/bucketname/uploads
# PUBLIC_OBJECT_SEARCH_PATHS=/bucketname/public
```

**Frontend** (`artifacts/health-digit/.env`):

```bash
VITE_API_BASE_URL=http://localhost:8080
PORT=24283
BASE_PATH=/
```

### 3. Push the database schema

```bash
pnpm --filter @workspace/db run push
```

### 4. Start the servers

```bash
# Terminal 1 — API server (builds then starts)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (Vite dev server)
pnpm --filter @workspace/health-digit run dev
```

Open [http://localhost:24283](http://localhost:24283).

---

## Project structure

```
health-digit-tracker/
├── artifacts/
│   ├── api-server/              # Express 5 API (@workspace/api-server)
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── analysis.ts       # Claude Sonnet 4.6 vision pipeline
│   │       │   ├── localStorage.ts   # Local dev file storage helpers
│   │       │   ├── objectStorage.ts  # GCS client wrapper
│   │       │   └── logger.ts         # Pino structured logging
│   │       └── routes/
│   │           ├── uploads.ts        # Upload, analyze, review, outcomes
│   │           ├── storage.ts        # File serving (local + GCS)
│   │           └── health.ts         # GET /healthz
│   └── health-digit/            # React 19 + Vite frontend (@workspace/health-digit)
│       └── src/
│           ├── lib/api.ts            # API base URL + image URL resolver
│           └── pages/                # Upload, History, Detail, Review
├── lib/
│   ├── db/                      # Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/                # OpenAPI YAML spec + Orval codegen config
│   ├── api-zod/                 # Auto-generated Zod validators (do not edit)
│   └── api-client-react/        # Auto-generated React Query hooks (do not edit)
├── CLAUDE.md                    # Claude Code project guidance
└── docs/
    ├── ARCHITECTURE.md          # Deep technical architecture
    └── DEPLOYMENT.md            # Production deployment guide (Replit)
```

---

## Key commands

```bash
# Type-check everything
pnpm run typecheck

# Build everything
pnpm run build

# Push DB schema changes
pnpm --filter @workspace/db run push

# Regenerate API hooks + Zod validators from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Type-check a single package
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/health-digit run typecheck
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9 |
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui, Wouter |
| State management | TanStack React Query 5 |
| Backend | Express 5, Node 24 |
| Database | PostgreSQL 16, Drizzle ORM |
| Validation | Zod 3 (auto-generated from OpenAPI) |
| API contract | OpenAPI 3 → Orval codegen |
| LLM | Anthropic Claude Sonnet 4.6 (vision) |
| File storage | Google Cloud Storage (production) / local disk (development) |
| Logging | Pino structured JSON |
| Monorepo | pnpm workspaces |

---

## Adding a new API route

1. Add the endpoint to `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen`
3. Implement the route in `artifacts/api-server/src/routes/`
4. Consume the generated hook in the frontend via `@workspace/api-client-react`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
