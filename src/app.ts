// src/app.ts

import express from "express";
import cors from "cors";
import orderRoutes from "./routes/order.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { register } from "./observability/metrics";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Allowed origins — loaded from CORS_ALLOWED_ORIGINS env variable (comma-separated).
  const allowedOrigins: string[] = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost", "http://localhost:80", "http://localhost:8081", "http://localhost:5173", "http://localhost:5174"];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false }));

  // ── Observability ────────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Prometheus metrics endpoint ─────────────────────────────────────────────
  app.get("/metrics", async (_req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch {
      res.status(500).end();
    }
  });

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use("/orders", orderRoutes);

  // ── Error handlers ──────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
