// src/observability/metrics.ts
// Prometheus metrics registry using prom-client.
// Exposed at GET /metrics — scraped by Prometheus every 15s.
//
// Metrics:
//   http_requests_total              — HTTP counter by method/route/status
//   http_request_duration_seconds    — HTTP latency histogram
//   http_requests_in_flight          — active requests gauge
//   order_operations_total           — order CRUD counter
//   book_service_requests_total      — outgoing calls to book-service counter
//   book_service_request_duration_seconds — book-service call latency
//   order_total_price_rupiah         — order value histogram

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";
import { env } from "../config/env";

export const register = new Registry();

// Default Node.js/process metrics (CPU, memory, event loop lag, GC)
collectDefaultMetrics({
  register,
  labels: { service: env.SERVICE_NAME, version: env.SERVICE_VERSION },
});

// ── HTTP Metrics ──────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name:       "http_requests_total",
  help:       "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers:  [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name:       "http_request_duration_seconds",
  help:       "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers:  [register],
});

export const httpRequestsInFlight = new Gauge({
  name:       "http_requests_in_flight",
  help:       "Number of HTTP requests currently being processed",
  labelNames: ["method", "route"],
  registers:  [register],
});

// ── Order Business Metrics ────────────────────────────────────────────────────

export const orderOperationsTotal = new Counter({
  name:       "order_operations_total",
  help:       "Total number of order operations",
  labelNames: ["operation", "status"], // operation: create|get|list, status: success|failure
  registers:  [register],
});

export const orderTotalPrice = new Histogram({
  name:    "order_total_price",
  help:    "Distribution of order total prices",
  buckets: [10000, 50000, 100000, 250000, 500000, 1000000],
  registers: [register],
});

// ── Inter-Service Metrics (book-service calls) ────────────────────────────────

export const bookServiceRequestsTotal = new Counter({
  name:       "book_service_requests_total",
  help:       "Total number of outgoing HTTP requests to book-service",
  labelNames: ["method", "status", "status_code"],
  registers:  [register],
});

export const bookServiceRequestDurationSeconds = new Histogram({
  name:       "book_service_request_duration_seconds",
  help:       "Duration of outgoing HTTP requests to book-service",
  labelNames: ["method"],
  buckets:    [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers:  [register],
});
