# Deployment Guide

> Production deployment and operations details are fully covered in **[SYSTEM.md — Section 13: Production Considerations](SYSTEM.md#13-production-considerations)**.

This file contains a condensed checklist and quick reference for operators.

---

## Ports

| Service | Port |
|---|---|
| API server | **8080** |
| Frontend (dev / preview) | **24283** |
| Health check | `GET /api/healthz` → `{ "status": "ok" }` |

---

## Required environment variables

| Variable | Description |
|---|---|
| `PORT` | `8080` for API server |
| `DATABASE_URL` | Neon PostgreSQL connection string (include `?sslmode=require`) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` |
| `NODE_ENV` | `production` |
| `PRIVATE_OBJECT_DIR` | GCS bucket path for uploads, e.g. `/mybucket/uploads` |

---

## Deploy steps

```bash
# 1. Install dependencies
pnpm install

# 2. Push schema (first deploy, or after schema changes)
pnpm --filter @workspace/db run push

# 3. Build
pnpm run build

# 4. Start API server
pnpm --filter @workspace/api-server run start

# Frontend: serve dist/public/ as static files (CDN or static server)
```

## Start / stop

```bash
# Start
pnpm --filter @workspace/api-server run start

# Stop
Ctrl+C  (or send SIGTERM to the node process)
```

## Verify

```bash
curl http://localhost:8080/api/healthz
# → {"status":"ok"}
```

---

## Production checklist

- [ ] `DATABASE_URL` → Neon production DB
- [ ] `AI_INTEGRATIONS_ANTHROPIC_API_KEY` set
- [ ] `PRIVATE_OBJECT_DIR` set (GCS bucket)
- [ ] `NODE_ENV=production`
- [ ] Schema pushed: `pnpm --filter @workspace/db run push`
- [ ] Build passes: `pnpm run build`
- [ ] Health check returns 200
- [ ] CORS restricted to frontend origin
- [ ] Log level set to `info` or `warn`

---

## Object storage setup (Replit)

1. Open the **Object Storage** tool in your Replit workspace
2. Create a private bucket; note the path (e.g. `/mybucket`)
3. Set `PRIVATE_OBJECT_DIR=/mybucket/uploads`
4. Authentication uses Replit's sidecar at `http://127.0.0.1:1106` — no service account key needed

---

## Troubleshooting

See **[SYSTEM.md — Section 11: Common Failure Modes & Debugging](SYSTEM.md#11-common-failure-modes--debugging)** for diagnosis steps covering:
- `DATABASE_URL` missing
- Invalid Anthropic API key
- File not found (ENOENT)
- Image not rendering
- Port conflicts
