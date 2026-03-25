# System Design Document

## Keyloop Unified Service Scheduler

---

## 1. Overview

**Keyloop Unified Service Scheduler** is an appointment booking platform for automotive dealerships that enables real-time slot availability checks and concurrent-safe bookings.

**Core engineering challenge:** Two users must never claim the same technician or service bay at the same time — even when requests arrive simultaneously.

**Key capabilities:**

- Check availability → Book / Cancel / Reschedule / Complete appointments
- Technician skill matching (e.g., only qualified techs appear for MOT checks)
- Multi-dealership support with isolated resource pools
- Race condition protection via three-layer concurrency strategy

---

## 2. Component Descriptions

| Component               | Role                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **React SPA**           | Two-page UI: BookingPage (availability check + confirm) and AppointmentsPage (view/cancel/reschedule/complete). Typed `fetch` client via `api.ts`.                                         |
| **nginx**               | Serves compiled SPA as static files. Proxies `/api/*` to backend on same origin — eliminates CORS entirely.                                                                                |
| **NestJS API**          | Application core. Handles validation (`ValidationPipe`), structured logging (`nestjs-pino`), error normalisation (`HttpExceptionFilter`), and all business logic via domain modules.       |
| **AvailabilityService** | Read-only. Finds free technicians (skill-matched) and bays for a given time window using `tsrange &&` overlap queries. No locks — fast.                                                    |
| **AppointmentsService** | Transactional writes. Manages booking lifecycle: create (with pessimistic locking), cancel, complete, reschedule.                                                                          |
| **PostgreSQL 16**       | Single source of truth. Enforces no-overlap via `EXCLUDE USING gist` constraints on `TSRANGE` column — the structural guarantee that makes double-booking impossible at the storage layer. |

---

## 3. Technology Stack

| Layer          | Technology                         | Why                                                                                                                                           |
| -------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**   | React 18 + Vite + TypeScript       | Component model fits form-heavy booking UI. Vite for fast HMR. Native fetch keeps bundle lean.                                                |
| **Backend**    | NestJS + TypeScript                | Opinionated module structure prevents code sprawl. DI makes services testable. First-class TypeScript.                                        |
| **ORM**        | TypeORM 0.3                        | `EntityManager` passes transaction context across service boundaries — critical for the locked re-check pattern.                              |
| **Validation** | class-validator + `ValidationPipe` | Declarative DTO validation. `whitelist: true` strips unexpected fields before they hit service layer.                                         |
| **Database**   | PostgreSQL 16                      | Only mainstream DB with `EXCLUDE USING gist` on range types — makes overlap prevention a storage-layer guarantee, not just application logic. |
| **Range type** | `TSRANGE` + `btree_gist`           | Native `&&` overlap operator. Required by EXCLUDE constraints. Cannot be replicated with `start_time`/`end_time` columns alone.               |
| **Logging**    | nestjs-pino                        | Structured JSON logs with per-request UUID correlation IDs. Zero-overhead in production.                                                      |
| **Proxy**      | nginx (Alpine)                     | Same-origin SPA + API → no CORS. Acts as future TLS termination point.                                                                        |
| **Container**  | Docker multi-stage + Compose       | Lean production image (builder + runner stages). Dev overlay pattern shares base config.                                                      |
| **Docs**       | Swagger (`@nestjs/swagger`)        | Auto-generated from DTOs — frontend–backend contract without manual maintenance.                                                              |
| **Health**     | `@nestjs/terminus`                 | `GET /api/health` for Docker/k8s liveness probes and uptime monitoring.                                                                       |

---

## 4. Architecture Diagram

### System Components

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Docker Compose Network: scheduler_net                                   │
  │                                                                          │
  │  ┌─────────────────┐    ┌───────────────────────────┐    ┌────────────┐  │
  │  │  frontend :80   │    │  backend :3001             │    │ postgres   │  │
  │  │                 │    │                           │    │ :5432      │  │
  │  │  nginx          │    │  NestJS (TypeScript)       │    │            │  │
  │  │  ┌───────────┐  │    │  ┌─────────────────────┐  │    │ PostgreSQL │  │
  │  │  │ React SPA │  │    │  │ REST Controllers     │  │    │    16      │  │
  │  │  │ (static)  │  │    │  │ ValidationPipe       │  │    │            │  │
  │  │  └───────────┘  │    │  │ LoggingInterceptor   │  │    │ TSRANGE    │  │
  │  │  ┌───────────┐  │    │  └─────────────────────┘  │    │ EXCLUDE    │  │
  │  │  │ /api/* ───┼──┼───▶│  ┌─────────────────────┐  │───▶│ gist index │  │
  │  │  │  proxy    │  │    │  │ AvailabilityService  │  │    │            │  │
  │  │  └───────────┘  │    │  │ AppointmentsService  │  │    │ btree_gist │  │
  │  └─────────────────┘    │  └─────────────────────┘  │    └────────────┘  │
  │                         └───────────────────────────┘                   │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Request Journey — Read Path (`GET /availability`)

> No locks. Safe for high read throughput.

```
  Browser            nginx           NestJS API             PostgreSQL
     │                  │                 │                      │
     │ GET /api/avail   │                 │                      │
     │─────────────────▶│── proxy /api/*─▶│                      │
     │                  │                 │── resolve service ───▶│
     │                  │                 │◀── type + duration ───│
     │                  │                 │── SELECT techs        │
     │                  │                 │   skill match +       │
     │                  │                 │   no time overlap ───▶│
     │                  │                 │◀── [avail techs] ─────│
     │                  │                 │── SELECT bays         │
     │                  │                 │   no time overlap ───▶│
     │                  │                 │◀── [avail bays] ──────│
     │◀─────────────────│◀────────────────│                      │
     │ { available, techs, bays }         │                      │
```

### Request Journey — Write Path (`POST /appointments`)

> Three-layer concurrency protection.

```
  Browser            nginx           NestJS API             PostgreSQL
     │                  │                 │                      │
     │ POST /api/appts  │                 │                      │
     │─────────────────▶│── proxy /api/*─▶│                      │
     │                  │                 │  [ValidationPipe]     │
     │                  │                 │  UUID, date, future   │
     │                  │                 │                       │
     │                  │          LAYER 1│── BEGIN TRANSACTION ─▶│
     │                  │    Pessimistic  │── SELECT tech         │
     │                  │    row locks    │   FOR UPDATE ────────▶│ ← write lock
     │                  │                 │── SELECT bay          │
     │                  │                 │   FOR UPDATE ────────▶│ ← write lock
     │                  │                 │                       │
     │                  │          LAYER 2│── hasConflict()       │
     │                  │    TOCTOU guard │   re-check overlap ──▶│
     │                  │                 │◀── no conflict ───────│
     │                  │                 │                       │
     │                  │          LAYER 3│── INSERT appointment  │
     │                  │    EXCLUDE      │   during=tsrange() ──▶│ ← EXCLUDE check
     │                  │    constraint   │── COMMIT ────────────▶│   (23P01 guard)
     │◀─────────────────│◀────────────────│                      │
     │ 201 Created      │                 │                      │
```

---

## 5. Data Flow

### 5.1 Availability Check

1. Frontend sends `GET /availability?dealershipId&serviceTypeId&startTime` (UTC ISO string)
2. Backend resolves service duration → computes `endTime = startTime + duration`
3. Queries technicians: same dealership + matching skill + no `tsrange` overlap with active appointments
4. Queries bays: same dealership + no `tsrange` overlap
5. Returns `{ available, availableTechs[], availableBays[], startTime, endTime }`

### 5.2 Concurrency-Safe Booking

**The problem — TOCTOU race condition:**
Between `GET /availability` returning "slot is free" and `POST /appointments` committing, another request can claim the same slot. A simple uniqueness check is not enough.

**Three-layer defence:**

| Layer                         | Mechanism                                                                              | What it prevents                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **① Pessimistic lock**        | `SELECT tech FOR UPDATE` then `SELECT bay FOR UPDATE` (consistent order → no deadlock) | Blocks any concurrent transaction on the same tech or bay until commit/rollback           |
| **② In-transaction re-check** | `hasConflict()` overlap query run _inside_ the lock                                    | Catches bookings committed in the window between `GET /availability` and this transaction |
| **③ DB EXCLUDE constraint**   | `EXCLUDE USING gist (technician_id WITH =, during WITH &&)`                            | Absolute backstop — enforced at storage engine level; catches any application logic gap   |

**Isolation level:** `REPEATABLE READ` + explicit `FOR UPDATE` — equivalent correctness to `SERIALIZABLE` without predicate locking overhead.

**Deadlock prevention:** Consistent lock order (technician row → bay row) prevents AB/BA circular wait.

### 5.3 Appointment State Machine

```
confirmed ──────► cancelled   (slot freed — EXCLUDE predicate no longer applies)
    │
    └───────────► completed
```

Reschedule = atomic cancel-old + create-new inside one transaction, running through the same conflict checks.

---

## 6. Observability Strategy

| Concern                  | Implementation                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Structured logging**   | `nestjs-pino` emits JSON in production (Datadog / CloudWatch / ELK-ready), pretty-print in dev |
| **Request correlation**  | UUID v4 `reqId` attached to every request — allows full trace reconstruction from logs         |
| **Error classification** | 4xx → `warn`, 5xx → `error` (with stack trace) via `GlobalHttpExceptionFilter`                 |
| **Health check**         | `GET /api/health` — DB liveness check for orchestration readiness probes                       |
| **API contract**         | `GET /api/docs` — live Swagger UI, auto-generated from DTOs                                    |

**Production extension points:**

| Capability          | Tool                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| Metrics             | Prometheus + `@willsoto/nestjs-prometheus` (request rate, error rate, DB latency) |
| Distributed tracing | OpenTelemetry + Jaeger / Datadog APM                                              |
| Alerting            | Grafana on error-rate threshold                                                   |
| DB monitoring       | `pg_stat_statements` for slow overlap query detection                             |

---

## 7. Error Handling

### Global HTTP Exception Filter

**File:** `backend/src/common/filters/http-exception.filter.ts`

- `4xx` → logged at `warn` level
- `5xx` → logged at `error` level
- PostgreSQL `23P01` → HTTP 409

### Error Code Reference

| HTTP | Scenario                 | Message                                             |
| ---- | ------------------------ | --------------------------------------------------- |
| 400  | DTO validation           | `["field must be X"]`                               |
| 400  | Skill mismatch           | "Technician does not have the required skill..."    |
| 400  | Invalid state transition | "Cannot transition from 'completed' to 'cancelled'" |
| 404  | Resource not found       | "Customer abc123 not found"                         |
| 409  | Layer 2 conflict         | "Slot no longer available"                          |
| 409  | Layer 3 EXCLUDE          | "Booking conflict: slot was taken simultaneously"   |
| 500  | Unexpected error         | Generic message to client; full details in logs     |

---
