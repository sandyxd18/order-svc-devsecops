// src/observability/tracing.ts
// OpenTelemetry SDK initialisation.
// MUST be the very first import in server.ts so auto-instrumentation
// can patch Express, Prisma, and fetch/http before they are loaded.
//
// Trace pipeline:
//   order-service → OTLP/gRPC → Alloy → Tempo → Grafana
//
// Auto-instrumented:
//   - Express HTTP routes (incoming spans)
//   - undici / node:http (outgoing spans to book-service)
//   - Prisma DB queries (db spans)

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const SERVICE_NAME    = process.env.SERVICE_NAME    ?? "order-service";
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? "1.0.0";
const OTLP_ENDPOINT   = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://alloy:4317";

const traceExporter = new OTLPTraceExporter({
  url: `${OTLP_ENDPOINT}/v1/traces`,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]:    SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy fs instrumentation
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();
console.log(`[Tracer] OpenTelemetry SDK started → ${OTLP_ENDPOINT}`);

process.on("SIGTERM", () => sdk.shutdown().catch(console.error));
process.on("SIGINT",  () => sdk.shutdown().catch(console.error));

export default sdk;
