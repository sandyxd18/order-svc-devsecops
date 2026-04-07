# 🛒 Order Service

Production-ready order microservice for an online bookstore with inter-service communication (retry + circuit breaker), built with **Bun**, **Express**, **PostgreSQL**, and **Prisma** — fully instrumented with metrics, logs, and distributed tracing via the Grafana observability stack.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Framework | Express.js |
| Database | PostgreSQL + Prisma |
| Auth | JWT (shared secret with auth-service) |
| Inter-service | REST → book-service (fetch + retry + circuit breaker) |
| Validation | Zod |
| Metrics | prom-client → Prometheus |
| Logs | Winston (JSON) → Alloy → Loki |
| Traces | OpenTelemetry → Alloy → Tempo |
| Visualization | Grafana |

---

## Project Structure

```
order-service/
├── prisma/
│   └── schema.prisma              # orders + order_items tables
├── src/
│   ├── config/
│   │   └── env.ts                 # Env var validation & typed access
│   ├── controllers/
│   │   └── order.controller.ts    # HTTP layer — parse, validate, respond
│   ├── db/
│   │   └── prisma.ts              # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.ts                # authenticateJWT + authorizeRole + authorizeOwnerOrAdmin
│   │   ├── errorHandler.ts        # Global error handler
│   │   └── requestLogger.ts       # HTTP metrics + structured log
│   ├── observability/
│   │   ├── logger.ts              # Winston JSON logger (injects trace_id/span_id)
│   │   ├── metrics.ts             # prom-client registry + metric definitions
│   │   └── tracing.ts             # OpenTelemetry SDK (MUST be first import)
│   ├── routes/
│   │   └── order.routes.ts        # Route definitions
│   ├── services/
│   │   ├── book.client.ts         # HTTP client → book-service (retry + circuit breaker)
│   │   └── order.service.ts       # Business logic
│   ├── utils/
│   │   ├── response.ts            # Standardized API response helpers
│   │   └── validators.ts          # Zod schemas
│   ├── app.ts                     # Express factory + /metrics endpoint
│   └── server.ts                  # Entry point (tracing imported first)
├── .dockerignore
├── .env.example
├── Dockerfile                     # Multi-stage production image
├── entrypoint.sh                  # DB schema sync → start server
└── package.json
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL >= 14
- book-service running at `BOOK_SERVICE_URL`

### 1. Install

```bash
cd order-service
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5434/order_db"
JWT_SECRET="same-secret-as-auth-service"
BOOK_SERVICE_URL="http://localhost:8000"
PORT=8000
NODE_ENV="development"

# Observability
SERVICE_NAME="order-service"
SERVICE_VERSION="1.0.0"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
LOKI_HOST="http://localhost:3100"
```

### 3. Setup Database

```bash
bun run db:generate
bun run db:push
```

### 4. Start

```bash
bun run dev     # hot reload
bun run start   # production
```

---

## API Reference

### Endpoint Summary

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/health` | — | — | Health check |
| GET | `/metrics` | — | — | Prometheus metrics scrape |
| POST | `/orders` | ✅ JWT | any | Create order |
| GET | `/orders/:id` | ✅ JWT | owner/admin | Get order by ID |
| GET | `/orders/user/:userId` | ✅ JWT | owner/admin | Get user's orders (paginated) |
| PATCH | `/orders/:id/status` | ✅ JWT | admin | Update order status |

---

### POST /orders

Create a new order. Items are validated against book-service for existence, stock, and current prices.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "items": [
    { "book_id": "uuid-of-book-1", "quantity": 2 },
    { "book_id": "uuid-of-book-2", "quantity": 1 }
  ]
}
```

**201 Created:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "id": "order-uuid",
    "user_id": "user-uuid",
    "total_price": "107.97",
    "status": "PENDING",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z",
    "items": [
      {
        "id": "item-uuid",
        "order_id": "order-uuid",
        "book_id": "uuid-of-book-1",
        "quantity": 2,
        "price": "35.99"
      }
    ]
  }
}
```

**422 Unprocessable Entity (insufficient stock):**
```json
{ "success": false, "error": "Insufficient stock for \"Clean Code\". Requested: 10, Available: 3" }
```

**503 Service Unavailable (book-service down):**
```json
{ "success": false, "error": "Book service is temporarily unavailable. Please try again." }
```

---

### GET /orders/:id

Get a single order by ID. Only the order owner or an admin can access.

**Headers:** `Authorization: Bearer <token>`

**200 OK:**
```json
{
  "success": true,
  "data": {
    "id": "order-uuid",
    "user_id": "user-uuid",
    "total_price": "107.97",
    "status": "PENDING",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z",
    "items": [...]
  }
}
```

**403 Forbidden (not owner or admin):**
```json
{ "success": false, "error": "Access denied. You can only access your own orders." }
```

---

### GET /orders/user/:userId

Get all orders for a specific user with pagination. Only the user themselves or an admin can access.

**Headers:** `Authorization: Bearer <token>`

**Query params:** `page` (default: 1), `limit` (default: 20, max: 100)

```
GET /orders/user/user-uuid?page=1&limit=10
```

**200 OK:**
```json
{
  "success": true,
  "data": {
    "orders": [...],
    "pagination": {
      "total": 5,
      "page": 1,
      "limit": 10,
      "total_pages": 1
    }
  }
}
```

---

### PATCH /orders/:id/status

Update order status (admin only).

**Headers:** `Authorization: Bearer <admin-token>`

**Request:**
```json
{ "status": "PAID" }
```

**200 OK:**
```json
{
  "success": true,
  "message": "Order status updated",
  "data": { "id": "order-uuid", "status": "PAID", "..." : "..." }
}
```

---

## Inter-Service Communication

### Book-Service Client

`src/services/book.client.ts` implements resilient HTTP calls to book-service:

**Retry with exponential backoff:**

| Attempt | Delay | Retryable HTTP codes |
|---|---|---|
| 1 | 0ms | — |
| 2 | 200ms | 429, 502, 503, 504 |
| 3 | 400ms | 429, 502, 503, 504 |

**Circuit Breaker:**

| State | Condition | Behavior |
|---|---|---|
| CLOSED | Normal | All requests pass through |
| OPEN | 5+ consecutive failures | Requests rejected immediately (503) |
| HALF_OPEN | After 30s cooldown | One probe request allowed |

> When the circuit is open, order creation fails immediately with `503` instead of waiting for timeouts — protecting the order-service from cascading failures.

---

## Order Flow

```
User                    Order Service                Book Service
 │                           │                            │
 │  POST /orders             │                            │
 │  {items: [...]}           │                            │
 │──────────────────────────►│                            │
 │                           │  GET /books/:id            │
 │                           │  (for each item)           │
 │                           │───────────────────────────►│
 │                           │  ◄── book data + stock ────│
 │                           │                            │
 │                           │  [validate stock]          │
 │                           │  [snapshot prices]         │
 │                           │  [calculate total]         │
 │                           │  [save order + items]      │
 │                           │                            │
 │  ◄── order created ──────│                            │
```

---

## Example API Usage (curl)

```bash
BASE=http://localhost:3002

# 1. Login to get JWT token (via auth-service)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234!"}' \
  | jq -r '.data.token')

# 2. Create an order
curl -X POST $BASE/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"book_id":"<book-uuid>","quantity":2}]}'

# 3. Get order by ID
curl -H "Authorization: Bearer $TOKEN" \
  $BASE/orders/<order-uuid>

# 4. Get user's orders
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/orders/user/<user-uuid>?page=1&limit=10"

# 5. Update order status (admin)
curl -X PATCH $BASE/orders/<order-uuid>/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"PAID"}'

# Health check
curl $BASE/health
```

---

## 📊 Observability

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 order-service :3002                        │
│                                                            │
│  /metrics  ──────────────────────────► Prometheus          │
│  stdout (JSON logs) ─────► Alloy ───► Loki                │
│  OTLP traces (gRPC) ─────► Alloy ───► Tempo               │
└──────────────────────────────────────────────────────────┘
                                             │
                                             ▼
                                         Grafana :8000
                              (metrics + logs + traces correlated)
```

### Signal Pipeline

| Signal | Produced by | Collector | Storage |
|---|---|---|---|
| **Metrics** | `prom-client` → `/metrics` | Prometheus scrape | Prometheus TSDB |
| **Logs** | `Winston` JSON → stdout | Alloy Docker scrape | Loki |
| **Traces** | `OpenTelemetry` → OTLP/gRPC | Alloy OTLP receiver | Tempo |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency |
| `http_requests_in_flight` | Gauge | `method`, `route` | Active requests |

---

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start with hot reload |
| `bun run start` | Start production |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:push` | Sync schema to DB |
| `bun run db:migrate` | Create migration files (dev) |
| `bun run db:studio` | Open Prisma Studio |

---

## Security Notes

- JWT validated locally using shared `JWT_SECRET` — no runtime call to auth-service
- Ownership check on every order access — users cannot access other users' orders
- Input validated with Zod before any DB or service call
- Prisma ORM prevents SQL injection
- Price is **snapshotted** at order time — stored in `order_items.price`, not re-fetched
- Circuit breaker prevents cascading failures from book-service outages
- Non-root container user (UID 1001) in Docker
- `x-powered-by` header disabled