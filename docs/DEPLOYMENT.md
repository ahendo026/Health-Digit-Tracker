# Deployment Guide

> Operational details and troubleshooting are in **[SYSTEM.md — §13 Production Considerations](SYSTEM.md#13-production-considerations)**.

The production deployment target is **Render**. Two services are defined in [`render.yaml`](../render.yaml):

| Service | Type | Notes |
|---|---|---|
| `healthdigits-api` | Web Service (Node) | Express API, listens on port 8080 |
| `healthdigits-frontend` | Static Site | Vite build output (`artifacts/health-digit/dist/public`) |

---

## Deploy to Render (first-time)

1. **Create a GCS bucket** (or other object storage) and a service account with `Storage Object Admin` on that bucket. Download the service account JSON key.

2. **Render dashboard** → **New → Blueprint** → select this repo. Render reads `render.yaml` and proposes both services.

3. **Set environment variables on `healthdigits-api`:**

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (include `?sslmode=require`) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |
| `GCS_CREDENTIALS_JSON` | The full service account JSON pasted as a single-line string |
| `PRIVATE_OBJECT_DIR` | `/<bucket-name>/uploads` (leading slash is auto-added if omitted) |

   `PORT=8080` and `NODE_ENV=production` are pre-baked in `render.yaml`.

4. Deploy `healthdigits-api`. Copy its URL (e.g. `https://healthdigits-api.onrender.com`).

5. **Set environment variables on `healthdigits-frontend`:**

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | The API URL from step 4 |
| `BASE_PATH` | `/` (pre-baked) |

6. Manually trigger the frontend deploy so it picks up `VITE_API_BASE_URL` at build time.

7. **Push the DB schema** from any machine where `DATABASE_URL` is set:
   ```bash
   pnpm --filter @workspace/db run push
   ```

8. Verify: `https://healthdigits-frontend.onrender.com` loads, upload a screenshot, analysis completes, image renders.

---

## Ports (for local or self-hosted deployments)

| Service | Port |
|---|---|
| API server | **8080** |
| Frontend (dev / preview) | **24283** |
| Health check | `GET /api/healthz` → `{ "status": "ok" }` |

---

## Environment variables reference

### Required

| Variable | Description |
|---|---|
| `PORT` | `8080` for API server |
| `DATABASE_URL` | Neon PostgreSQL connection string (include `?sslmode=require`) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |
| `NODE_ENV` | `production` |

### Storage (production)

| Variable | Description |
|---|---|
| `PRIVATE_OBJECT_DIR` | GCS bucket path for uploads, e.g. `/my-bucket/uploads` |
| `GCS_CREDENTIALS_JSON` | Service account JSON as a single-line string. **Required for non-Replit hosts** (Render, Cloud Run, Fly, etc.). If omitted, the app falls back to Replit's sidecar auth at `http://127.0.0.1:1106`. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | _Optional_ — comma-separated GCS paths for public assets |

### Frontend (build time)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full URL of the deployed API, e.g. `https://healthdigits-api.onrender.com` |
| `BASE_PATH` | `/` |

---

## Manual / self-hosted deploy

```bash
# 1. Install and build
pnpm install
pnpm run build

# 2. Push schema (first deploy, or after schema changes)
pnpm --filter @workspace/db run push

# 3. Start API server (set env vars in shell or systemd unit)
pnpm --filter @workspace/api-server run start

# 4. Serve the frontend static files
#    artifacts/health-digit/dist/public/  →  CDN, Nginx, or static server
```

---

## Verifying a deploy

```bash
curl https://healthdigits-api.onrender.com/api/healthz
# → {"status":"ok"}
```

Then open the frontend URL and confirm:
1. Home page loads (no blank screen or console errors)
2. Upload a screenshot → lands on detail page → image renders → analysis completes
3. Deep-link (e.g. `/uploads/5`) reloads correctly (confirms the SPA rewrite in `render.yaml`)

---

## Production checklist

- [ ] `DATABASE_URL` → Neon production DB
- [ ] `AI_INTEGRATIONS_ANTHROPIC_API_KEY` set
- [ ] `PRIVATE_OBJECT_DIR` set (GCS bucket path)
- [ ] `GCS_CREDENTIALS_JSON` set (if not on Replit)
- [ ] `NODE_ENV=production`
- [ ] Schema pushed: `pnpm --filter @workspace/db run push`
- [ ] Build passes: `pnpm run build`
- [ ] Health check returns 200
- [ ] CORS restricted to frontend origin (currently open — see SYSTEM.md §13 Security)
- [ ] Log level set to `info` or `warn`

---

## Object storage setup (Replit)

If deploying to Replit instead of Render:

1. Open the **Object Storage** tool in your Replit workspace
2. Create a private bucket; note the path (e.g. `/mybucket`)
3. Set `PRIVATE_OBJECT_DIR=/mybucket/uploads`
4. Leave `GCS_CREDENTIALS_JSON` unset — the app automatically uses Replit's sidecar at `http://127.0.0.1:1106`. No service account key needed.

---

## Troubleshooting

See **[SYSTEM.md — §11 Common Failure Modes & Debugging](SYSTEM.md#11-common-failure-modes--debugging)** for:
- `DATABASE_URL` missing
- Invalid Anthropic API key
- File not found (`ObjectNotFoundError`) — often caused by `PRIVATE_OBJECT_DIR` format issues
- Image not rendering
- Port conflicts
