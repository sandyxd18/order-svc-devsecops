// src/middleware/requestLogger.ts
// HTTP request/response logging + Prometheus metrics middleware.
// Normalizes routes to avoid high-cardinality Prometheus labels.

import type { Request, Response, NextFunction } from "express";
import logger from "../observability/logger";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
} from "../observability/metrics";

function normalizeRoute(req: Request): string {
  return req.route?.path
    ? `${req.baseUrl ?? ""}${req.route.path}`
    : req.path;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startAt = process.hrtime.bigint();
  const route   = normalizeRoute(req);

  httpRequestsInFlight.inc({ method: req.method, route });

  res.on("finish", () => {
    const durationSec = Number(process.hrtime.bigint() - startAt) / 1e9;
    const statusCode  = String(res.statusCode);
    const labels      = { method: req.method, route, status_code: statusCode };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
    httpRequestsInFlight.dec({ method: req.method, route });

    logger.info("http_request", {
      method:      req.method,
      url:         req.originalUrl,
      route,
      status_code: res.statusCode,
      duration_ms: Math.round(durationSec * 1000),
      user_id:     (req as any).user?.sub ?? null,
    });
  });

  next();
}
