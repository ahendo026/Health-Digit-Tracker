# Health Digit — Replit configuration notes

This file contains Replit-specific context. For full documentation see:
- [README.md](README.md) — project overview and quick start
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technical architecture
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment guide

---

## Stack

- **Runtime**: Node 24
- **Package manager**: pnpm workspaces
- **API framework**: Express 5 on port 8080
- **Frontend**: React 19 + Vite 7 on port 24283
- **Database**: PostgreSQL 16 via Drizzle ORM
- **LLM**: Anthropic Claude Sonnet 4.6 (vision)
- **File storage**: Replit Object Storage (GCS) in production; local disk in dev

## Ports

| Service | Port |
|---|---|
| API server | 8080 |
| Frontend dev server | 24283 |

## Required secrets

| Secret | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |
| `PORT` | `8080` for API, `24283` for frontend |
| `BASE_PATH` | `/` (or Replit-assigned base path) |

## Optional secrets (object storage)

| Secret | Description |
|---|---|
| `PRIVATE_OBJECT_DIR` | GCS path for private uploads (e.g. `/mybucket/uploads`). If unset, local disk storage is used. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Comma-separated GCS paths for public assets |
| `GCS_CREDENTIALS_JSON` | _Not needed on Replit._ When set (on Render, Cloud Run, etc.), the app bypasses the Replit sidecar and authenticates directly with the supplied service account JSON. |

## Health check

```
GET /api/healthz  →  { "status": "ok" }
```

## Key commands

```bash
pnpm install                                          # install dependencies
pnpm --filter @workspace/db run push                  # push DB schema
pnpm run build                                        # typecheck + build all
pnpm run dev:api                                      # start API server (PORT=8080)
pnpm run dev:frontend                                 # start frontend dev server
pnpm --filter @workspace/api-spec run codegen         # regenerate API types from OpenAPI
```

## Screenshot classifications

`glucose_reading` · `blood_pressure_reading` · `weight_reading` · `meal_event` · `workout_event` · `unknown`

## Database tables

`users` · `uploads` · `llm_runs` · `events` · `meals` · `workouts` · `meal_event_links` · `workout_event_links` · `outcomes` · `rules` · `reviews` · `airtable_sync_log`
