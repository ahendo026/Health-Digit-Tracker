# HealthDigits

A private web app for digitizing health data from screenshots. Upload an image from any wearable, health app, or medical device — Claude Sonnet 4.6 classifies and extracts structured readings. Review and approve the results through a clean UI.

**Full documentation → [docs/SYSTEM.md](docs/SYSTEM.md)**

---

## Quick start

### Prerequisites

- Node.js 24, pnpm 9+
- PostgreSQL 16 (Neon or local)
- Anthropic API key

### 1. Install

```bash
pnpm install
```

### 2. Configure

**`artifacts/api-server/.env`**
```bash
PORT=8080
DATABASE_URL=postgres://user:pass@host.neon.tech/db?sslmode=require
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-api03-...
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
```

**`artifacts/health-digit/.env`**
```bash
VITE_API_BASE_URL=http://localhost:8080
PORT=24283
BASE_PATH=/
```

### 3. Push database schema

```bash
pnpm --filter @workspace/db run push
```

### 4. Start

```bash
# Terminal 1 — API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 24283)
pnpm --filter @workspace/health-digit run dev
```

Open **http://localhost:24283**

### Stop

**Ctrl+C** in each terminal.

### Rebuild API after code changes

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

---

## Ports

| Service | Port |
|---|---|
| API server | **8080** |
| Frontend dev server | **24283** |
| Health check | `GET http://localhost:8080/api/healthz` |

---

## Key commands

```bash
pnpm run typecheck                               # type-check all packages
pnpm run build                                   # build all packages
pnpm --filter @workspace/db run push             # push DB schema changes
pnpm --filter @workspace/api-spec run codegen    # regenerate API types from OpenAPI spec
```

---

## What it does

| Step | Description |
|---|---|
| **Upload** | Drag-and-drop a screenshot from any health app |
| **Analyze** | Claude Sonnet 4.6 classifies and extracts structured data |
| **Review** | Confirm or correct the AI's classification and values |
| **Store** | Approved records persist as typed health events |

**Supported classifications**: `blood_pressure_reading` · `glucose_reading` · `weight_reading` · `meal_event` · `workout_event` · `unknown`

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui, Wouter |
| API | Express 5, Node 24, TypeScript 5.9 |
| Database | PostgreSQL 16 (Neon), Drizzle ORM |
| AI | Anthropic Claude Sonnet 4.6 (vision) |
| API contract | OpenAPI 3 → Orval (generates Zod + React Query) |
| Storage | GCS (production) / local disk (development) |
| Monorepo | pnpm workspaces |

---

## Documentation

| Document | Purpose |
|---|---|
| [docs/SYSTEM.md](docs/SYSTEM.md) | Complete system documentation (architecture, API, schema, debugging, deployment) |
| [CLAUDE.md](CLAUDE.md) | Claude Code project guidance |
