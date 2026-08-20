import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { authMiddleware } from "./middlewares/auth";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Origin allowlist via FRONTEND_ORIGINS (comma-separated). Unset keeps the
// previous open-CORS behavior. Default header reflection is preserved so the
// Authorization preflight on cross-origin image fetches passes.
const frontendOrigins = process.env.FRONTEND_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(frontendOrigins?.length ? cors({ origin: frontendOrigins }) : cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", authMiddleware, router);

export default app;
