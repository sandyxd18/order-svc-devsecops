// src/config/env.ts
// Centralized env var validation — fails fast at startup if required vars are missing.

const required = ["DATABASE_URL", "JWT_SECRET", "BOOK_SERVICE_URL"] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[Config] FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export const env = {
  // App
  PORT:          parseInt(process.env.PORT ?? "8000", 10),
  NODE_ENV:      process.env.NODE_ENV ?? "development",
  IS_PRODUCTION: process.env.NODE_ENV === "production",

  // Auth
  JWT_SECRET: process.env.JWT_SECRET as string,

  // Database
  DATABASE_URL: process.env.DATABASE_URL as string,

  // Inter-service
  BOOK_SERVICE_URL: process.env.BOOK_SERVICE_URL as string,

  // Observability
  SERVICE_NAME:                process.env.SERVICE_NAME    ?? "order-service",
  SERVICE_VERSION:             process.env.SERVICE_VERSION ?? "1.0.0",
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://alloy:4317",
  LOKI_HOST:                   process.env.LOKI_HOST       ?? "http://loki:3100",
};
