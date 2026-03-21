# Keyloop Unified Service Scheduler

A production-grade appointment booking system for automotive dealerships, built as a technical assessment for Keyloop.

Customers can check real-time availability, book service slots, and manage appointments — all protected against concurrent double-booking at both the application and database levels.

**Stack:** NestJS · TypeScript · PostgreSQL 16 · React 18 · Vite · Docker Compose

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Running Tests](#running-tests)
4. [API Reference & cURL Examples](#api-reference--curl-examples)
5. [Edge Cases & How They Are Handled](#edge-cases--how-they-are-handled)
6. [Design Decisions](#design-decisions)
7. [Known Limitations](#known-limitations)
8. [AI Collaboration Narrative](#ai-collaboration-narrative)

---

## Quick Start

### Prerequisites

- Docker Desktop 24+ (Docker Compose v2)
- Free ports: `3001` (backend), `5173` (frontend dev), `5436` (postgres dev)

### Development mode — hot-reload

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

| Service             | URL                            |
| ------------------- | ------------------------------ |
| Frontend (Vite HMR) | http://localhost:5173          |
| Backend API         | http://localhost:3001/api      |
| Swagger UI          | http://localhost:3001/api/docs |
| PostgreSQL (direct) | `localhost:5436`               |

### Production mode (nginx + compiled bundles)

```bash
docker compose up --build
```

In production the React SPA is served by nginx, which also reverse-proxies `/api/*` to the backend — the browser never makes a cross-origin request, so no CORS headers are required.

### Seed data

`SEED_ON_STARTUP=true` is set in both compose files. On first boot the database is populated automatically:

| Resource      | Count | Details                                                                                                            |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| Dealerships   | 2     | Keyloop London, Keyloop Birmingham                                                                                 |
| Service Types | 5     | Oil Change (30 min), Tire Rotation (45 min), Brake Inspection (60 min), MOT Check (90 min), Full Service (120 min) |
| Service Bays  | 4     | Bay 1 + Bay 2 (London), Bay A + Bay B (Birmingham)                                                                 |
| Technicians   | 6     | 3 per dealership, each with 2–3 skill specialisations                                                              |
| Customers     | 3     | Jane Doe, John Smith, Sarah Connor                                                                                 |
| Vehicles      | 3     | Audi A4 (Jane), BMW 3 Series (John), Jaguar XE (Sarah)                                                             |

The seed is idempotent — safe to restart without duplicating data.

---

## Project Structure

```
keyloop_assessment/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── appointments/       ← booking transaction, pessimistic lock, 23P01 handling
│   │   │   ├── availability/       ← TSRANGE overlap queries (read-only, unlocked)
│   │   │   ├── dealerships/
│   │   │   ├── service-types/
│   │   │   ├── service-bays/
│   │   │   ├── technicians/
│   │   │   ├── customers/
│   │   │   ├── vehicles/
│   │   │   ├── seed/               ← demo data, runs on SEED_ON_STARTUP=true
│   │   │   └── health/             ← @nestjs/terminus DB ping
│   │   ├── common/
│   │   │   ├── filters/            ← GlobalHttpExceptionFilter (4xx=warn, 5xx=error)
│   │   │   └── interceptors/       ← request/response timing logger
│   │   └── database/
│   │       └── migrations/         ← 8 TypeORM migrations (btree_gist → appointments)
│   └── test/
│       └── appointments.e2e-spec.ts ← Testcontainers integration + concurrency tests
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── BookingPage.tsx     ← 2-step flow: check availability → confirm
│       │   └── AppointmentsPage.tsx
│       ├── components/
│       │   ├── BookingForm.tsx
│       │   └── AvailabilitySlots.tsx
│       └── services/api.ts         ← typed fetch client (all endpoints)
├── docker-compose.yml
├── docker-compose.dev.yml
├── SYSTEM_DESIGN.md
└── WBS.md
```

---

## Running Tests

### Unit tests (no Docker required — fast, uses mocks)

```bash
# via Docker (dev stack must be running)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend npm test

# locally (requires Node 20)
cd backend && npm install && npm test
```

Covers 36 tests across two service files:

**`AppointmentsService` (22 tests):**

- `createAppointment` — happy path, service type not found, technician not found, bay not found, skill mismatch, TOCTOU conflict (Layer 2), 23P01 EXCLUDE violation (Layer 3), unknown error re-throw, idempotency key caching
- `cancel` — success, not found, already-cancelled → 400, completed → 400
- `complete` — success, not found, already-completed → 400, cancelled → 400
- `reschedule` — success, conflict → 409, not confirmed → 400, skill mismatch → 400, 23P01 on save → 409

**`AvailabilityService` (14 tests):**

- `checkAvailability` — available/unavailable combinations, endTime calculation, serviceType included, not found → 404
- `hasConflict` — no conflict, overlap detected, cancelled rows excluded, self-exclusion for reschedule, OR logic (tech OR bay triggers conflict)

### E2E / Integration tests (Testcontainers — real PostgreSQL, no mocks)

Testcontainers starts a real PostgreSQL 16 container for each test run. Migrations execute, data is seeded, tests run, container is destroyed.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend npm run test:e2e

# or locally (requires Docker daemon)
cd backend && npm run test:e2e
```

| #      | Scenario                                     | Expected                           |
| ------ | -------------------------------------------- | ---------------------------------- |
| 1      | Happy path                                   | `201 Created`                      |
| 2      | Same technician, overlapping time            | `409 Conflict`                     |
| 3      | Same bay, overlapping time (different tech)  | `409 Conflict`                     |
| 4      | Skill validation — tech lacks required skill | `400 Bad Request`                  |
| 5      | Missing required fields                      | `400 Bad Request`                  |
| 6      | Availability reflects booking (before/after) | `available: true` → `false`        |
| 7      | Cancel → slot freed → bookable again         | `available: true`                  |
| 8      | Cancel already-cancelled                     | `400 Bad Request`                  |
| 9      | Complete → then cancel → 400                 | state machine enforced             |
| 10     | Reschedule — success + original slot freed   | `200 OK`                           |
| 11     | Reschedule into conflicting slot             | `409 Conflict`                     |
| 12     | Reschedule cancelled appointment             | `400 Bad Request`                  |
| **13** | **10 simultaneous requests, same slot**      | **1× `201`, 9× `409`**             |
| 14     | List all appointments                        | `200 OK`, array                    |
| 15     | Filter by status                             | only matching status returned      |
| 16     | Get single appointment with full relations   | customer, vehicle, technician, bay |
| 17     | Get non-existent appointment                 | `404 Not Found`                    |

Test 13 is the defining test: it proves all three concurrency layers work correctly under genuine concurrent load against real PostgreSQL storage.

### Coverage report

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend npm run test:cov
```

---

## API Reference & cURL Examples

**Base URL:** `http://localhost:3001/api`
**Interactive docs:** http://localhost:3001/api/docs

### 1. Get seed data IDs (needed for subsequent calls)

```bash
# Get dealership IDs
curl -s http://localhost:3001/api/dealerships | python3 -m json.tool

# Get service type IDs
curl -s http://localhost:3001/api/service-types | python3 -m json.tool

# Get customer IDs
curl -s http://localhost:3001/api/customers | python3 -m json.tool

# Get vehicles for a customer
curl -s "http://localhost:3001/api/vehicles?customerId=<customer-uuid>" | python3 -m json.tool
```

### 2. Check availability

```bash
curl -s "http://localhost:3001/api/availability?\
dealershipId=<dealership-uuid>&\
serviceTypeId=<service-type-uuid>&\
startTime=2026-04-01T10%3A00%3A00.000Z" | python3 -m json.tool
```

> `startTime` must be a UTC ISO 8601 string (`2026-04-01T10:00:00.000Z`), URL-encoded when passed as a query parameter.

Response when available:

```json
{
  "available": true,
  "startTime": "2026-04-01T10:00:00.000Z",
  "endTime": "2026-04-01T10:30:00.000Z",
  "availableBays": [{ "id": "...", "name": "Bay A" }],
  "availableTechs": [
    { "id": "...", "name": "David Brown", "skills": ["oil_change"] }
  ],
  "serviceType": { "id": "...", "name": "Oil Change", "durationMinutes": 30 }
}
```

Response when not available:

```json
{
  "available": false,
  "availableBays": [],
  "availableTechs": []
}
```

### 3. Book an appointment

```bash
curl -s -X POST http://localhost:3001/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "<uuid>",
    "vehicleId": "<uuid>",
    "serviceTypeId": "<uuid>",
    "serviceBayId": "<uuid>",
    "technicianId": "<uuid>",
    "startTime": "2026-04-01T10:00:00.000Z",
    "notes": "Please also check tyre pressure"
  }' | python3 -m json.tool
```

Success (`201`):

```json
{
  "id": "d18e5398-...",
  "status": "confirmed",
  "during": {
    "start": "2026-04-01T10:00:00.000Z",
    "end": "2026-04-01T10:30:00.000Z"
  }
}
```

Conflict (`409`):

```json
{ "statusCode": 409, "message": "Slot no longer available" }
```

Past date validation (`400`):

```json
{ "statusCode": 400, "message": ["startTime must be a future date"] }
```

### 4. List appointments

```bash
# All appointments
curl -s http://localhost:3001/api/appointments | python3 -m json.tool

# Filter by customer + status
curl -s "http://localhost:3001/api/appointments?customerId=<uuid>&status=confirmed"
```

### 5. Get single appointment

```bash
curl -s http://localhost:3001/api/appointments/<uuid> | python3 -m json.tool
```

### 6. Cancel an appointment

```bash
curl -s -X PATCH http://localhost:3001/api/appointments/<uuid>/cancel | python3 -m json.tool
```

### 7. Health check

```bash
curl -s http://localhost:3001/api/health
# {"status":"ok","info":{"database":{"status":"up"}}}
```

---

## Edge Cases & How They Are Handled

This section documents every significant failure mode, the risk level, and exactly what the system does.

---

### Concurrency & Double-Booking

#### Case 1: Two users book the exact same slot simultaneously

**Risk:** CRITICAL — the core problem this system exists to solve.

**Scenario:** Two HTTP requests arrive within milliseconds. Both call `GET /availability` (read-only, no lock) and see the slot as free. Both then call `POST /appointments` at the same time.

**Three-layer defence:**

```
Layer 1 (Application — optimistic check):
  GET /availability uses NOT EXISTS + TSRANGE && (overlap operator).
  Fast, no locks. Result: user sees accurate state at query time.

Layer 2 (Application — pessimistic lock inside transaction):
  POST /appointments opens a transaction and does:
    SELECT ... FOR UPDATE on technician row  ← first
    SELECT ... FOR UPDATE on service bay row ← second (consistent order)
  Second request must WAIT until first commits or rolls back.
  Then re-checks availability INSIDE the lock.
  If conflict found: throws 409 immediately.

Layer 3 (Database — EXCLUDE constraint):
  Even if Layer 2 somehow misses (e.g. a third concurrent request),
  PostgreSQL's EXCLUDE USING gist (technician_id WITH =, during WITH &&)
  and EXCLUDE USING gist (service_bay_id WITH =, during WITH &&)
  reject the INSERT with error code 23P01.
  AppointmentsService catches 23P01 and maps it to HTTP 409.
```

**Result:** Exactly one booking succeeds; all others receive `409 Conflict`. Proven by E2E test: 10 simultaneous requests → 1 success, 9 conflicts.

---

#### Case 2: Deadlock between two concurrent bookings

**Risk:** MEDIUM if locks are acquired in inconsistent order.

**Scenario:** Transaction A locks tech T1 then tries to lock bay B1. Transaction B locks bay B1 then tries to lock tech T1. Both wait for each other forever → deadlock.

**How it's handled:** Locks are **always acquired in the same order**: technician row first, service bay row second. This total ordering eliminates circular wait. PostgreSQL will never enter a deadlock for this workload.

---

#### Case 3: Technician double-booked across different dealership requests

**Risk:** HIGH — technicians are shared within a dealership.

**How it's handled:** The `EXCLUDE` constraint on `(technician_id WITH =, during WITH &&)` is unconditional — it applies regardless of which dealership or application logic created the conflicting appointment.

---

#### Case 4: Service bay used by two appointments at the same time

**Risk:** HIGH.

**How it's handled:** Separate `EXCLUDE` constraint on `(service_bay_id WITH =, during WITH &&) WHERE status != 'cancelled'`. Bay and technician conflicts are checked independently — both must be free.

---

#### Case 5: Race between availability check and booking (TOCTOU)

**Risk:** MEDIUM — inherent in any check-then-act system.

**Scenario:** User checks availability at T=0 (slot free). At T=1, someone else books the slot. At T=2, original user tries to book → should fail, not silently overwrite.

**How it's handled:** The backend re-checks availability **inside the pessimistic lock transaction** (Layer 2 above). If the slot was taken between T=0 and T=2, the user receives `409 Conflict: "Slot no longer available"` — not a silent overwrite. The frontend displays this error inline.

---

### Input Validation

#### Case 6: Booking a slot in the past

**Risk:** MEDIUM — creates phantom appointments that confuse reports.

**How it's handled:** `CreateAppointmentDto` uses a custom `@IsFutureDate()` class-validator decorator. Any `startTime` ≤ now returns `400 Bad Request: ["startTime must be a future date"]` before the database is touched.

---

#### Case 7: Invalid UUID format for any ID field

**Risk:** LOW — malformed request.

**How it's handled:** All ID fields decorated with `@IsUUID()`. `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` rejects with `400` before reaching the service layer.

---

#### Case 8: Unknown extra fields in request body

**Risk:** LOW — potential for parameter pollution.

**How it's handled:** `ValidationPipe({ forbidNonWhitelisted: true })` returns `400` for any property not declared in the DTO.

---

#### Case 9: Oversized `notes` field

**Risk:** LOW — DoS via large payloads.

**How it's handled:** `@MaxLength(500)` on `notes` returns `400` for strings exceeding 500 characters.

---

#### Case 10: Wrong technician for the service type (e.g., booking a full service with an oil-change-only tech)

**Risk:** MEDIUM — unskilled technician assigned.

**How it's handled:** Availability query filters with `:requiredSkill = ANY(tech.skills)`. Only qualified technicians appear in the `availableTechs` list. The frontend only allows selecting from this list.

---

### Business Logic Edge Cases

#### Case 11: Cancelling an already-cancelled appointment

**Risk:** LOW — idempotency confusion.

**How it's handled:** `AppointmentsService.cancel()` checks `appointment.status === 'cancelled'` and throws `400 Bad Request: "Appointment is already cancelled"`.

---

#### Case 12: Cancelling a non-existent appointment

**Risk:** LOW.

**How it's handled:** `findOne()` throws `404 Not Found` if the appointment ID doesn't exist.

---

#### Case 13: `GET /availability` after a slot is booked — does it reflect the booking?

**Risk:** Data consistency concern.

**How it's handled:** The availability query uses `NOT EXISTS` which reads committed data. As soon as a booking transaction commits, subsequent availability queries correctly exclude that slot. Because PostgreSQL uses Read Committed isolation by default, there is no stale-read window for committed rows. Proven by E2E test 5.

---

#### Case 14: Cancel an appointment — does the slot become available again?

**Risk:** Business logic correctness.

**How it's handled:** The `EXCLUDE` constraint has a `WHERE status != 'cancelled'` predicate. When a cancellation sets `status = 'cancelled'`, the constraint no longer applies to that row — the slot is freed. Availability queries also filter `a.status != 'cancelled'` in their `NOT EXISTS` subquery. Proven by E2E test 6.

---

### Infrastructure Edge Cases

#### Case 15: Vite proxy to backend in Docker dev mode

**What was wrong:** `vite.config.ts` proxied `/api` to `http://localhost:3001`. Inside Docker, `localhost` is the frontend container itself. All API calls silently received connection refused.

**Fix:** `docker-compose.dev.yml` passes `VITE_API_TARGET=http://backend:3001`. Vite config reads `process.env.VITE_API_TARGET ?? 'http://localhost:3001'`. Dev outside Docker still works without change.

---

#### Case 16: Migration class names rejected by TypeORM at startup

**What was wrong:** TypeORM requires migration class names to end with a **13-digit JavaScript millisecond timestamp**. The original migrations used 10-digit Unix second timestamps (e.g., `CreateAppointments1700000008`), causing TypeORM to throw on startup with no DB connection.

**Fix:** All 8 migration class names updated to 13-digit timestamps (e.g., `CreateAppointments1700000008000`).

---

#### Case 17: `tsrange` column serialised as `{start: null, end: null}`

**What was wrong:** PostgreSQL serialises `tsrange` with **quoted** timestamps: `["2026-03-20 10:00:00","2026-03-20 10:30:00")`. The TypeORM transformer regex captured `"2026-03-20 10:00:00"` (with the double-quotes), which `new Date()` returns as `Invalid Date`, which JSON-serialises to `null`.

**Fix:** The transformer regex now strips the double-quotes before constructing `Date` objects. All appointment time ranges now correctly appear in API responses.

---

#### Case 18: `DATABASE_PORT` pointing to host port instead of container port

**What was wrong:** `docker-compose.yml` set `DATABASE_PORT: 5436` (the host-mapped port). Inside Docker, the backend must connect to the PostgreSQL container on its **internal** port `5432`.

**Fix:** Changed to `DATABASE_PORT: 5432`.

---

#### Case 19: Docker port merge conflict (3000 vs 5173 for frontend)

**What was wrong:** Docker Compose **concatenates** port lists when merging files. The base file had `3000:80` for frontend; the dev overlay added `5173:5173`. The result was Docker trying to bind both `3000` and `5173`. Since port `3000` was already in use on the host, the entire startup failed.

**Fix:** Removed `ports` from the frontend service in `docker-compose.yml` (production can expose via a reverse proxy or explicit flag). Dev overlay retains only `5173:5173`.

---

#### Case 20: `npm ci` fails — missing `package-lock.json`

**What was wrong:** Both Dockerfiles used `npm ci`, which requires a lock file. The repository didn't include `package-lock.json` files.

**Fix:** Changed `npm ci` → `npm install` in both Dockerfiles (builds correctly without a committed lock file).

---

## Design Decisions

### Why PostgreSQL `TSRANGE` + `EXCLUDE` instead of application-level locking?

Application-level locks (Redis SETNX, in-memory mutexes) are a single point of failure and don't survive process restarts. `EXCLUDE USING gist` in PostgreSQL is enforced at the **storage layer** — it is structurally impossible for any application bug or race condition to bypass it. The pessimistic lock at the application layer gives a friendly 409 _before_ hitting the constraint (better UX and performance); the constraint is the **guarantee**.

### Why pessimistic locking instead of optimistic locking?

Optimistic locking (version/ETag) requires the client to retry on conflict. For a booking system, "retry transparently" is wrong — the user should be explicitly told their slot is gone and should pick another time. Pessimistic locking + 409 gives deterministic, user-visible, non-silent outcomes.

### Why NestJS + TypeORM?

NestJS's module system keeps the codebase navigable at scale. TypeORM's `DataSource.transaction()` with `EntityManager` makes it natural to share the same transaction context across the availability double-check and the booking insert — essential for the two-layer concurrency protection.

### Why Testcontainers for E2E tests?

Mocking the database for concurrency tests is futile — you cannot mock a race condition. Testcontainers starts a real PostgreSQL 16 instance, runs migrations, seeds data, and tears it down. The concurrent booking test (10 simultaneous requests) genuinely exercises PostgreSQL's `EXCLUDE` constraint under concurrent load against real storage.

### Why separate availability check from booking?

Availability (`GET /availability`) is a read-only query — it should be fast, uncached, and never block other queries. Booking (`POST /appointments`) is a write operation with locks and a transaction. Separating them allows the availability API to scale horizontally (read replicas, caching) independently of the booking API.

---

## Known Limitations

| Limitation                           | Severity | Production fix                                                                                               |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| No authentication / authorisation    | High     | Add JWT + ownership checks; any user can cancel any appointment in the current demo                          |
| No rate limiting on booking endpoint | Medium   | Add `@nestjs/throttler` (e.g., 10 requests/minute per IP)                                                    |
| No pagination on `GET /appointments` | Low      | Add `limit`/`offset` query params for large deployments                                                      |
| No business-hours enforcement        | Low      | Add configurable working-hours range validation in DTO                                                       |
| Reschedule not surfaced in UI        | Low      | `PATCH /appointments/:id/reschedule` is fully implemented in the backend; not yet wired to a frontend button |
| Technician skills stored as `text[]` | Low      | Works for this scale; normalised `skills` table for richer taxonomy                                          |
| No frontend authentication           | High     | Booking page uses seed customers from dropdown (demo mode); production would derive customer from session    |

---

## AI Collaboration Narrative

**Tool used:** Claude Code (Claude Sonnet 4.6) — Anthropic's CLI that integrates directly into the terminal workflow.

---

### High-Level Strategy for Guiding the AI

I used Claude as a **senior pair-programmer**, not an autonomous agent. The distinction matters: Claude never made architectural decisions unilaterally. Every significant decision started with me forming a position, then using Claude to stress-test it.

My approach had three phases for any non-trivial task:

1. **Design first, then prompt** — Before asking Claude to write anything, I drafted the approach myself. For the concurrency strategy, I sketched the three-layer defence on paper (pessimistic lock → in-transaction re-check → EXCLUDE constraint) and then asked Claude: _"What are the failure modes of this design?"_ This produced the deadlock insight (AB/BA circular wait) that I had missed.

2. **Prompt with constraints, not just goals** — Instead of "write the booking service", I prompted with specific constraints: _"The transaction must hold the technician lock before acquiring the bay lock, to prevent deadlocks. The hasConflict check must run inside the same open transaction, not after. The 23P01 error must be caught and mapped to 409."_ This produced code that matched the design intent.

3. **Treat output as a first draft** — Generated code was read line by line, not merged directly. For every critical path (booking transaction, EXCLUDE constraint SQL, TypeORM migration), I verified the logic was correct before accepting it.

---

### Process for Verifying and Refining Output

| Area                           | Verification method                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency correctness**    | Drew the TOCTOU sequence diagram manually; identified the window between `GET /availability` and `POST /appointments`; confirmed the in-transaction re-check closes it                        |
| **EXCLUDE constraint**         | Verified against [PostgreSQL docs](https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-EXCLUDE); ran `\d appointments` in psql to confirm the constraint was created |
| **Migration timestamp format** | TypeORM docs specify 13-digit millisecond timestamps; confirmed by running migrations and seeing the error on 10-digit format                                                                 |
| **tsrange serialisation bug**  | Queried PostgreSQL directly (`SELECT during FROM appointments`) — saw the quoted format `"2026-03-20 10:00:00"`; traced the `Invalid Date` → `null` bug in the transformer regex              |
| **Skill validation**           | Called `POST /appointments` directly with curl using a mismatched technician; confirmed the bug (no 400 before fix) and the fix (400 after)                                                   |
| **Race condition**             | Wrote the 10-simultaneous-requests integration test before the implementation; ran it against real PostgreSQL via Testcontainers to confirm `exactly 1 success, 9 conflicts`                  |
| **Timezone handling**          | Manually entered "2:00 PM" and observed "9:00 PM" in the result; traced the root cause (Docker UTC vs browser UTC+7); fixed by computing UTC ISO string once in the browser                   |
| **DTO validation**             | Sent malformed requests via curl: past dates, missing fields, unknown properties; confirmed 400 responses                                                                                     |

---

### How I Ensured Final Code Quality

**Tests as acceptance criteria:** For the concurrency logic, the integration test (10 concurrent requests → exactly 1 success) was written and agreed as the pass/fail line before the service implementation. The code wasn't "done" until the test passed against real PostgreSQL.

**Three bugs Claude missed — found manually:**

1. **tsrange null bug** — The TypeORM column transformer produced `Invalid Date` because the PostgreSQL output format quotes timestamps (`"2026-03-20 10:00:00"`) and the regex didn't strip those quotes. Found by calling the API with curl and seeing `during: { start: null, end: null }`.

2. **DATABASE_PORT** — Claude used `5436` (the host-mapped port) as the `DATABASE_PORT` env var. Inside Docker, the backend must connect on the container's internal port `5432`. Found by tracing the TypeORM connection error.

3. **Timezone mismatch** — The backend running in UTC Docker + browser in UTC+7 caused a 7-hour shift in displayed times. Claude helped trace the root cause once I had the symptom, but the bug itself was found through manual testing.

**Code review habit:** Every generated file was read before use. For the migration files especially, I verified that: the `btree_gist` extension was enabled before the EXCLUDE constraint was created, the `WHERE status != 'cancelled'` predicate was present, and the constraint column order matched what the query planner would use.

---

### Where AI Added the Most Value

- **PostgreSQL range type patterns** — `TSRANGE`, `btree_gist`, `EXCLUDE USING gist (... WITH &&) WHERE (...)` — Claude knew these patterns in detail. I verified them, but the initial correct suggestion saved significant research time.
- **NestJS module wiring** — Providers, module imports, DI tokens for TypeORM repositories — correct boilerplate generated quickly.
- **Testcontainers setup** — Container lifecycle management in Jest (`beforeAll`/`afterAll`), running migrations inside test context — Claude suggested the pattern, I verified it against Testcontainers docs.
- **Deadlock prevention** — When I asked _"what are the failure modes of locking two rows?"_, Claude immediately identified the AB/BA circular wait and suggested consistent lock ordering. This is the kind of thing you know about in theory but don't always apply in practice.

---

### Final Ownership Statement

Every file in this repository has been read and understood. Claude accelerated initial scaffolding significantly, but the correctness of the concurrency design, the database schema, the transformer bug fix, and the infrastructure configuration is my responsibility and my understanding. The three bugs Claude missed — and the process of finding and fixing them — reflect that the human remained the final quality gate throughout.
