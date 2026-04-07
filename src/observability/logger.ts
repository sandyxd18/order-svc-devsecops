// src/observability/logger.ts
// Winston structured JSON logger.
// Injects active OpenTelemetry trace_id and span_id into every log entry
// enabling log ↔ trace correlation in Grafana (click trace_id in Loki → Tempo).

import { createLogger, format, transports } from "winston";
import { trace } from "@opentelemetry/api";
import { env } from "../config/env";

// Custom format: inject OTel span context into each log entry
const traceContextFormat = format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    info["trace_id"] = ctx.traceId;
    info["span_id"]  = ctx.spanId;
  }
  return info;
});

const logger = createLogger({
  level: env.IS_PRODUCTION ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "ISO" }),
    format.errors({ stack: true }),
    traceContextFormat(),   // inject trace_id + span_id
    format.json()           // single-line JSON — parseable by Alloy/Loki
  ),
  defaultMeta: {
    service:     env.SERVICE_NAME,
    version:     env.SERVICE_VERSION,
    environment: env.NODE_ENV,
  },
  transports: [new transports.Console()],
});

export default logger;
