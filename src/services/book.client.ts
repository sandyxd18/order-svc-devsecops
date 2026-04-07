// src/services/book.client.ts
// HTTP client for communicating with book-service.
//
// Features:
//   - Retry with exponential backoff (transient errors: 429, 502, 503, 504)
//   - Circuit breaker (stops calling book-service when failure threshold is reached)
//   - Prometheus metrics for every outgoing call
//   - Structured logging per attempt
//   - OTel auto-instrumentation traces the outgoing HTTP call automatically

import { env } from "../config/env";
import logger from "../observability/logger";
import {
  bookServiceRequestsTotal,
  bookServiceRequestDurationSeconds,
} from "../observability/metrics";

// ── Book data shape returned by book-service ──────────────────────────────────
export interface BookData {
  id:        string;
  title:     string;
  author:    string;
  price:     string;   // Decimal comes as string from JSON
  stock:     number;
  image_url: string | null;
}

// ── Retry config ──────────────────────────────────────────────────────────────
const RETRY_ATTEMPTS   = 3;
const RETRY_BASE_DELAY = 200;   // ms — doubles each attempt (200 → 400 → 800)
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

// ── Circuit Breaker ───────────────────────────────────────────────────────────
// Simple in-memory circuit breaker. For production, use a shared store (Redis).
const CB = {
  failureCount:    0,
  failureThreshold: 5,           // open after 5 consecutive failures
  resetTimeout:    30_000,       // try half-open after 30s
  state:           "CLOSED" as "CLOSED" | "OPEN" | "HALF_OPEN",
  nextAttemptAt:   0,

  recordSuccess() {
    this.failureCount = 0;
    this.state        = "CLOSED";
  },

  recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state        = "OPEN";
      this.nextAttemptAt = Date.now() + this.resetTimeout;
      logger.warn("circuit_breaker_opened", {
        service: "book-service",
        failureCount: this.failureCount,
      });
    }
  },

  canRequest(): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "OPEN") {
      if (Date.now() >= this.nextAttemptAt) {
        this.state = "HALF_OPEN";
        logger.info("circuit_breaker_half_open", { service: "book-service" });
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN — allow one probe request
  },
};

// ── HTTP helper with retry ────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        signal:  AbortSignal.timeout(5000),   // 5s per attempt
      });

      if (RETRYABLE_STATUS.has(res.status) && attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        logger.warn("book_service_retry", {
          url, attempt, status: res.status, delay_ms: delay,
        });
        await Bun.sleep(delay);
        continue;
      }

      return res;

    } catch (err) {
      lastError = err as Error;
      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        logger.warn("book_service_retry", {
          url, attempt, error: lastError.message, delay_ms: delay,
        });
        await Bun.sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("book-service request failed after retries");
}

// ── Public client API ─────────────────────────────────────────────────────────

export const BookClient = {

  /**
   * getBook
   * Fetches book data from book-service by ID.
   * Applies circuit breaker + retry logic + emits metrics.
   */
  async getBook(bookId: string): Promise<BookData> {
    // Circuit breaker check
    if (!CB.canRequest()) {
      const err = new BookServiceUnavailableError(
        "book-service is currently unavailable (circuit open)"
      );
      bookServiceRequestsTotal.inc({ method: "GET", status: "failure", status_code: "0" });
      throw err;
    }

    const url   = `${env.BOOK_SERVICE_URL}/books/${bookId}`;
    const timer = bookServiceRequestDurationSeconds.startTimer({ method: "GET" });

    try {
      const res = await fetchWithRetry(url);
      timer();

      bookServiceRequestsTotal.inc({
        method:      "GET",
        status:      res.ok ? "success" : "failure",
        status_code: String(res.status),
      });

      if (res.status === 404) {
        CB.recordSuccess();
        throw new BookNotFoundError(`Book ${bookId} not found in book-service`);
      }

      if (!res.ok) {
        CB.recordFailure();
        throw new BookServiceUnavailableError(
          `book-service returned ${res.status} for book ${bookId}`
        );
      }

      const body = await res.json() as { success: boolean; data: BookData };
      CB.recordSuccess();

      logger.debug("book_service_fetch_success", { book_id: bookId, title: body.data.title });
      return body.data;

    } catch (err) {
      timer();
      if (err instanceof BookNotFoundError || err instanceof BookServiceUnavailableError) {
        throw err;
      }
      CB.recordFailure();
      bookServiceRequestsTotal.inc({ method: "GET", status: "failure", status_code: "0" });
      logger.error("book_service_fetch_failed", {
        book_id: bookId,
        error:   (err as Error).message,
      });
      throw new BookServiceUnavailableError(`Failed to reach book-service: ${(err as Error).message}`);
    }
  },
};

// ── Custom Errors ─────────────────────────────────────────────────────────────

export class BookNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookNotFoundError";
  }
}

export class BookServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookServiceUnavailableError";
  }
}
