import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes mounted on /api and root to handle any serverless URL rewriting
app.use("/api", router);
app.use(router);

// Global unhandled error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err }, "Unhandled server error");
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "Internal server error" });
  },
);

// Serve built React Frontend in unified production mode
const possibleDistPaths = [
  path.resolve(process.cwd(), "artifacts/wave-assistant/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(__dirname, "../../wave-assistant/dist/public"),
];

const staticDir = possibleDistPaths.find((p) => fs.existsSync(p));

if (staticDir) {
  logger.info({ staticDir }, "Serving unified frontend static bundle");
  app.use(express.static(staticDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
