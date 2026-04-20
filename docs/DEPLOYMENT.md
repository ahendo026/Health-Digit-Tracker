# Deployment Guide

This app is deployed on **Replit** using Node 24 and PostgreSQL 16. The API server (Express) and the frontend (Vite static build) are served from the same Replit instance, with the API on port 8080 and the frontend on port 24283.

---

## Prerequisites

- A Replit account with a Node 24 Repl
- PostgreSQL 16 database (Replit managed or external)
- Anthropic API key (Claude Sonnet 4.6)
- (Optional) Replit Object Storage bucket for file uploads

---

## Environment variables

Set these in the Replit **Secrets** panel (or `.env` for local preview builds). Never commit secrets.

### Required

| Variable | Example | Description |
|---|---|---|
| `PORT` | `8080` | API server listen port |
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` | PostgreSQL connection string |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API key |
| `BASE_PATH` | `/` | Vite base path (matches Replit routing) |

### Optional — object storage (production uploads)

If `PRIVATE_OBJECT_DIR` is not set, the server falls back to local disk storage (`local_uploads/`). This is fine for development but not suitable for production restarts because the disk is ephemeral.

| Variable | Example | Description |
|---|---|---|
| `PRIVATE_OBJECT_DIR` | `/mybucket/uploads` | GCS bucket path for private uploaded files |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `/mybucket/public` | Comma-separated GCS paths for public assets |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | _(Anthropic default)_ | Override Claude API endpoint |
| `LOG_LEVEL` | `info` | Pino log level |

### Frontend (build-time)

| Variable | Example | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `https://your-repl.repl.co` | Public URL of the API server |

---

## Build and deploy steps

### 1. Install dependencies

```bash
pnpm install
```

### 2. Push the database schema

Run this once on first deploy, and again whenever `lib/db/src/schema/uploads.ts` changes:

```bash
pnpm --filter @workspace/db run push
```

> **Warning**: `push-force` is destructive — it drops and recreates tables. Never run it against a database with production data.

### 3. Build all packages

```bash
pnpm run build
```

This runs:
- TypeScript type-checking across all packages
- esbuild bundle for the API server → `artifacts/api-server/dist/index.mjs`
- Vite build for the frontend → `artifacts/health-digit/dist/public/`

### 4. Start the API server

```bash
pnpm --filter @workspace/api-server run start
```

This runs `node --enable-source-maps ./dist/index.mjs` from the `api-server` directory.

### 5. Serve the frontend

The Vite build output in `artifacts/health-digit/dist/public/` is static HTML/JS/CSS. In production it should be served by a static file server or CDN. On Replit, configure the frontend port (24283) to serve this directory.

---

## Object storage setup (Replit)

1. Open the **Object Storage** tool in your Replit workspace
2. Create a private bucket and note its path (e.g. `/mybucket`)
3. Set `PRIVATE_OBJECT_DIR=/mybucket/uploads` in Secrets
4. (Optional) Create a public bucket and set `PUBLIC_OBJECT_SEARCH_PATHS=/mybucket/public`

The API server uses Replit's sidecar auth endpoint (`http://127.0.0.1:1106`) to authenticate with GCS — no service account key is needed when running on Replit.

---

## Health check

```
GET /api/healthz
```

Returns `{ "status": "ok" }` with HTTP 200 when the server is up. Use this as your Replit health check endpoint.

---

## Updating a deployment

```bash
# 1. Pull latest changes
git pull

# 2. Install any new dependencies
pnpm install

# 3. Push schema changes if any
pnpm --filter @workspace/db run push

# 4. Rebuild
pnpm run build

# 5. Restart the API server
pnpm --filter @workspace/api-server run start
```

---

## Troubleshooting

### Images not loading after deploy

Ensure `PRIVATE_OBJECT_DIR` is set in production. Without it, uploads are stored on local disk, which may not persist across restarts. If you were previously using local storage, re-upload affected files or migrate the `local_uploads/` contents to your GCS bucket and update the `file_path` values in the `uploads` table to `/objects/<filename>`.

### Analysis returns `unknown` classification

Check that `AI_INTEGRATIONS_ANTHROPIC_API_KEY` is set and valid. The server logs a warning and returns a stub result when the key is missing.

### Database connection errors

Verify `DATABASE_URL` is correct and the PostgreSQL instance is reachable. Run `pnpm --filter @workspace/db run push` to confirm connectivity and ensure the schema is up to date.

### Port conflicts

- API server: port `8080` (set via `PORT` env var)
- Frontend dev server: port `24283` (set via `PORT` env var when running the frontend)

These must be different. On Replit, both are configured automatically.
