# Commercial MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first commercial beta loop for TryItOut: email/password accounts, server-side sessions, access-code credits, Postgres-backed paid tasks, Redis/BullMQ queueing, weighted simulation concurrency, admin operations, analytics, and later BYOK tiers.

**Architecture:** Commercial mode is a real paid path, not an in-memory demo. Postgres is the source of truth for accounts, sessions, access codes, credits, tasks, reports, analytics, and audit logs. Redis/BullMQ owns the queue and weighted worker concurrency. The existing file-backed simulation task path remains only for local/demo compatibility and must not bypass credits when `COMMERCIAL_MODE_ENABLED=true`.

**Tech Stack:** React 19, Express, TypeScript, Node test runner with `tsx --test`, Postgres-compatible repository interface, Redis/BullMQ-style queue abstraction, existing AI Gateway and simulation engine.

---

## Non-Negotiable Commercial Requirements

- Commercial mode must fail startup when required secrets or backing services are missing.
- Paid task creation must require a server-side session, sufficient credits, and a transactional credit hold.
- Existing unauthenticated simulation endpoints must be disabled or routed through the commercial service in commercial mode.
- Credit operations must be idempotent: worker retries cannot double-capture or double-release credits.
- Weighted concurrency must be enforced by worker/queue code, not just stored as job metadata.
- BYOK provider URLs must defend against SSRF, not only require `https://`.
- Admin access-code, balance, user, settings, and sensitive report actions must write audit logs.

## Phase 1: Persistence, Contracts, And Migrations

### Task 1: Add Commercial Domain Contracts

**Files:**
- Create: `frontend/src/contracts/commercial.ts`
- Test: `frontend/src/contracts/commercial.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/contracts/commercial.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_CODE_STATUSES,
  COMMERCIAL_TASK_STATUSES,
  CREDIT_LEDGER_ENTRY_TYPES,
  SIMULATION_CREDIT_COSTS,
  USER_TIERS,
  getSimulationCreditCost,
  hasCommercialFeature,
} from "./commercial.js";

test("commercial constants expose MVP account and credit states", () => {
  assert.deepEqual(USER_TIERS, ["basic", "pro", "business"]);
  assert.deepEqual(ACCESS_CODE_STATUSES, ["active", "redeemed", "disabled", "expired"]);
  assert.deepEqual(COMMERCIAL_TASK_STATUSES, [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "refunded",
  ]);
  assert.deepEqual(CREDIT_LEDGER_ENTRY_TYPES, [
    "redeem",
    "hold",
    "capture",
    "release",
    "adjustment",
  ]);
});

test("simulation credit costs distinguish platform and BYOK deep mode", () => {
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "platform" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "platform" }), 3);
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "byok" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "byok" }), 2);
  assert.deepEqual(SIMULATION_CREDIT_COSTS.platform, { legacy: 1, enabled: 3 });
});

test("hasCommercialFeature reads tier feature flags", () => {
  assert.equal(hasCommercialFeature({ tier: "basic", features: [] }, "custom_model_provider"), false);
  assert.equal(hasCommercialFeature({ tier: "pro", features: ["custom_model_provider"] }, "custom_model_provider"), true);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/contracts/commercial.test.ts
```

Expected: FAIL because `commercial.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/contracts/commercial.ts` with:

- `USER_TIERS`
- `COMMERCIAL_FEATURES`
- `ACCESS_CODE_STATUSES`
- `CREDIT_LEDGER_ENTRY_TYPES`
- `COMMERCIAL_TASK_STATUSES`
- `CommercialProviderMode`
- `SIMULATION_CREDIT_COSTS`
- `CommercialEntitlements`
- `hasCommercialFeature`
- `getSimulationCreditCost`

Use `InteractionMode` from `../types.js`; default platform costs are legacy `1`, enabled `3`; default BYOK costs are legacy `1`, enabled `2`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/contracts/commercial.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/contracts/commercial.ts frontend/src/contracts/commercial.test.ts
git commit -m "feat: add commercial domain contracts"
```

### Task 2: Add Commercial Record Types And Repository Interface

**Files:**
- Create: `frontend/src/server/commercial/types.ts`
- Create: `frontend/src/server/commercial/repository.ts`
- Test: `frontend/src/server/commercial/repository.test.ts`

**Step 1: Write the failing test**

Create tests that instantiate an `InMemoryCommercialRepository` as a unit-test fake and verify:

- Users can be found case-insensitively by email.
- Credit accounts and ledger entries are stored.
- Session records can be saved, found by token hash, and revoked.
- Commercial task records can be saved and loaded.
- Audit log records can be appended and listed.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/repository.test.ts
```

Expected: FAIL because repository files do not exist.

**Step 3: Implement types and repository fake**

Create `frontend/src/server/commercial/types.ts` with records:

- `CommercialUserRecord`
- `CommercialSessionRecord`
- `UserCreditAccountRecord`
- `CreditLedgerEntryRecord`
- `AccessCodeRecord`
- `AccessCodeRedemptionRecord`
- `CommercialSimulationTaskRecord`
- `SimulationReportRecord`
- `UserFeedbackRecord`
- `AnalyticsEventRecord`
- `AdminAuditLogRecord`
- `SystemSettingRecord`

Important fields:

- `CommercialSessionRecord`: `id`, `userId`, `tokenHash`, `expiresAt`, `revokedAt?`, `createdAt`.
- `CreditLedgerEntryRecord`: include `idempotencyKey`.
- `CommercialSimulationTaskRecord`: include `creditHoldLedgerEntryId?`, `creditCapturedLedgerEntryId?`, `creditReleasedLedgerEntryId?`, `queueJobId?`, `reportId?`, `errorCode?`.
- `AdminAuditLogRecord`: `adminUserId`, `action`, `targetType`, `targetId`, `metadata`, `createdAt`.

Create `CommercialRepository` with methods needed by all records. Create `InMemoryCommercialRepository` only for tests and local non-commercial demos.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/types.ts frontend/src/server/commercial/repository.ts frontend/src/server/commercial/repository.test.ts
git commit -m "feat: add commercial repository contracts"
```

### Task 3: Add Commercial Database Migration

**Files:**
- Create: `frontend/db/migrations/001_commercial_mvp.sql`
- Create: `frontend/db/README.md`

**Step 1: Draft migration**

Create SQL tables:

- `users`
- `user_sessions`
- `user_credit_accounts`
- `credit_ledger`
- `access_codes`
- `access_code_redemptions`
- `user_model_providers`
- `simulation_tasks`
- `simulation_reports`
- `user_feedback`
- `analytics_events`
- `admin_audit_logs`
- `system_settings`

Required constraints:

- Unique `users.email`.
- Unique `user_sessions.token_hash`.
- Unique `access_codes.code_hash`.
- Unique credit ledger `idempotency_key`.
- Foreign keys from sessions/credits/tasks/reports/feedback/audit rows to users where applicable.
- Check constraints for positive credit amounts where appropriate.
- Indexes on task status, task user, ledger user, analytics event type, and audit actor.

**Step 2: Add README**

Document:

- Migration order.
- Required env vars.
- How to run local Postgres.
- How to reset local commercial DB.
- That commercial mode must not use in-memory repositories.

**Step 3: Review SQL manually**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS. SQL is not executed by the current test suite.

**Step 4: Commit**

```bash
git add frontend/db/migrations/001_commercial_mvp.sql frontend/db/README.md
git commit -m "docs: add commercial database migration"
```

### Task 4: Add Postgres Repository Implementation

**Files:**
- Create: `frontend/src/server/commercial/postgres-repository.ts`
- Test: `frontend/src/server/commercial/postgres-repository.test.ts`

**Step 1: Write contract tests**

Use a fake query client and test:

- `saveUser` performs insert/upsert with expected params.
- `findUserByEmail` maps a row to `CommercialUserRecord`.
- `saveSession` and `findSessionByTokenHash` map rows correctly.
- `appendLedgerEntry` writes `idempotencyKey`.
- `saveCommercialTask` persists credit ledger references.
- `appendAdminAuditLog` inserts actor, action, target, and metadata.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/postgres-repository.test.ts
```

Expected: FAIL.

**Step 3: Implement repository**

Implement a `QueryClient` interface:

```ts
interface QueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
```

Do not hard-code a database driver yet. Keep driver creation in a later wiring task so tests stay fast and deterministic.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/postgres-repository.test.ts src/server/commercial/repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/postgres-repository.ts frontend/src/server/commercial/postgres-repository.test.ts
git commit -m "feat: add postgres commercial repository"
```

## Phase 2: Auth, Sessions, Access Codes, And Credits

### Task 5: Add Password And Access-Code Secret Utilities

**Files:**
- Create: `frontend/src/server/commercial/passwords.ts`
- Create: `frontend/src/server/commercial/access-codes.ts`
- Test: `frontend/src/server/commercial/passwords.test.ts`
- Test: `frontend/src/server/commercial/access-codes.test.ts`

**Step 1: Write failing tests**

Test:

- Password hashing uses a salted non-plaintext format and verifies correct/incorrect passwords.
- Access-code generation produces grouped `TIO-XXXX-XXXX-XXXX` codes.
- Access-code hashing uses a pepper and normalized code.
- Access-code verification is timing-safe.
- Access-code masking hides the middle group.

**Step 2: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/passwords.test.ts src/server/commercial/access-codes.test.ts
```

Expected: FAIL.

**Step 3: Implement utilities**

Use Node `crypto`:

- Passwords: `scrypt` with random salt.
- Codes: SHA-256 over normalized code plus `ACCESS_CODE_PEPPER`.
- Timing-safe hash comparison.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/passwords.test.ts src/server/commercial/access-codes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/passwords.ts frontend/src/server/commercial/passwords.test.ts frontend/src/server/commercial/access-codes.ts frontend/src/server/commercial/access-codes.test.ts
git commit -m "feat: add commercial secret utilities"
```

### Task 6: Implement Auth And Session Service

**Files:**
- Create: `frontend/src/server/commercial/auth-service.ts`
- Test: `frontend/src/server/commercial/auth-service.test.ts`

**Step 1: Write failing tests**

Test:

- Register normalizes email, hashes password, creates credit account.
- Duplicate email is rejected.
- Login verifies password and creates a session.
- Session token is only returned once; repository stores token hash.
- `getUserForSessionToken` returns user for valid non-expired session.
- Logout revokes session.
- Disabled users cannot log in.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/auth-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CommercialAuthService` with:

- `register`
- `login`
- `getUserForSessionToken`
- `logout`
- `changePassword`

Session requirements:

- Random high-entropy token.
- Store only token hash.
- Expiration timestamp.
- HTTP cookie creation is handled in API layer, not service.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/auth-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/auth-service.ts frontend/src/server/commercial/auth-service.test.ts
git commit -m "feat: add commercial auth sessions"
```

### Task 7: Implement Credit Service With Transactions And Idempotency

**Files:**
- Create: `frontend/src/server/commercial/credit-service.ts`
- Test: `frontend/src/server/commercial/credit-service.test.ts`

**Step 1: Write failing tests**

Test:

- Redeeming an active access code increases balance, records ledger, records redemption, and applies tier/features.
- Redeeming the same code twice is rejected.
- Holding credits decreases balance and records a hold ledger entry.
- Holding with insufficient balance is rejected.
- Capturing a hold records a capture once.
- Releasing a hold returns credits once.
- Repeated capture/release calls with the same idempotency key do not double-change balance.
- Admin adjustment changes balance and records reason.

**Step 2: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CreditService` with:

- `redeemAccessCode`
- `holdCredits`
- `captureHeldCredits`
- `releaseHeldCredits`
- `adjustCredits`

Implementation requirements:

- Accept a repository transaction callback if available; in-memory fake can execute immediately.
- Every ledger entry has an `idempotencyKey`.
- Capture/release check whether matching idempotency key already exists.
- Task settlement must reference task id and hold ledger id.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/credit-service.ts frontend/src/server/commercial/credit-service.test.ts
git commit -m "feat: add idempotent credit service"
```

## Phase 3: Queue, Worker, And Paid Simulation Tasks

### Task 8: Add Weighted Queue Abstraction

**Files:**
- Create: `frontend/src/server/commercial/simulation-queue.ts`
- Test: `frontend/src/server/commercial/simulation-queue.test.ts`

**Step 1: Write failing tests**

Test:

- Ordinary tasks have weight `1`.
- Deep tasks have weight `3`.
- Queue job contains task id, user id, mode, weight, and idempotency key.
- A weighted limiter allows jobs only while active weight stays within budget.
- Releasing a job lowers active weight.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/simulation-queue.test.ts
```

Expected: FAIL.

**Step 3: Implement abstraction and test fake**

Create:

- `SimulationQueue`
- `SimulationQueueJob`
- `WeightedConcurrencyLimiter`
- `InMemorySimulationQueue` for tests only

Do not claim BullMQ is implemented here; this task creates the interface and the limiter behavior. Later wiring supplies Redis/BullMQ.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/simulation-queue.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/simulation-queue.ts frontend/src/server/commercial/simulation-queue.test.ts
git commit -m "feat: add weighted simulation queue abstraction"
```

### Task 9: Implement Commercial Simulation Task Service

**Files:**
- Create: `frontend/src/server/commercial/commercial-task-service.ts`
- Test: `frontend/src/server/commercial/commercial-task-service.test.ts`

**Step 1: Write failing tests**

Test:

- Creating a task requires active user.
- Creating a task rejects a second active task for the same user.
- Creating a task calculates credit cost by mode/provider.
- Creating a task creates credit hold and task record before enqueue.
- If enqueue fails, the hold is released and task is marked failed.
- Completing a task captures held credits once and stores report id.
- Failing a task releases held credits once and stores normalized error code.
- Retrying a failed/refunded task creates a new hold and queue job.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CommercialSimulationTaskService` with:

- `createTask`
- `markRunning`
- `markCompleted`
- `markFailed`
- `cancelTask`
- `retryTask`
- `getStatus`
- `getReport`

Implementation requirements:

- Use `CreditService` for hold/capture/release.
- Use `SimulationQueue` to enqueue jobs.
- Store queue job id.
- Use idempotency keys derived from task id and lifecycle action.
- Never expose `userInput` in public status DTO.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-task-service.ts frontend/src/server/commercial/commercial-task-service.test.ts
git commit -m "feat: add paid simulation task service"
```

### Task 10: Add Simulation Worker Runner

**Files:**
- Create: `frontend/src/server/commercial/simulation-worker.ts`
- Test: `frontend/src/server/commercial/simulation-worker.test.ts`

**Step 1: Write failing tests**

Test:

- Worker claims a job only when weighted limiter has capacity.
- Worker marks task running before calling simulation.
- Worker saves report and calls `markCompleted` on success.
- Worker calls `markFailed` on recoverable and non-recoverable provider errors.
- Worker releases limiter capacity in `finally`.
- Worker retry of same completed task does not double-capture credits.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/simulation-worker.test.ts
```

Expected: FAIL.

**Step 3: Implement worker runner**

Create a runner that accepts:

- queue job
- task service
- weighted limiter
- `runSimulation` dependency compatible with existing `runMultiAgentSimulation`
- provider resolver

Keep real BullMQ process startup for a later wiring task.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/simulation-worker.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/simulation-worker.ts frontend/src/server/commercial/simulation-worker.test.ts
git commit -m "feat: add commercial simulation worker runner"
```

### Task 11: Add Redis/BullMQ Queue Adapter

**Files:**
- Create: `frontend/src/server/commercial/bullmq-simulation-queue.ts`
- Test: `frontend/src/server/commercial/bullmq-simulation-queue.test.ts`
- Modify: `frontend/package.json`

**Step 1: Write adapter contract tests**

Use a mocked BullMQ constructor or small wrapper test to verify:

- Queue name is stable.
- Job id is task id.
- Job data includes weight and idempotency key.
- Retry/backoff options are set.

**Step 2: Add dependency**

Add BullMQ dependency:

```bash
cd frontend
npm install bullmq
```

**Step 3: Implement adapter**

Implement `BullMqSimulationQueue` behind the `SimulationQueue` interface.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/bullmq-simulation-queue.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/server/commercial/bullmq-simulation-queue.ts frontend/src/server/commercial/bullmq-simulation-queue.test.ts
git commit -m "feat: add BullMQ simulation queue adapter"
```

## Phase 4: API Wiring And Commercial Mode Protection

### Task 12: Add Commercial API Handlers

**Files:**
- Create: `frontend/src/server/commercial/commercial-api.ts`
- Test: `frontend/src/server/commercial/commercial-api.test.ts`

**Step 1: Write failing tests**

Test handlers for:

- Register.
- Login.
- Logout.
- `GET /api/me`.
- Redeem access code.
- Get credits.
- Create commercial simulation task.
- Get task status.
- Get task report.
- Cancel task.

Handler tests must prove:

- No handler returns `passwordHash`.
- Auth-required handlers reject missing session.
- Task creation rejects insufficient credits.
- Task creation returns queued task status.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL.

**Step 3: Implement handlers**

Handlers return `{ status, body, cookies? }` so `server.ts` can set session cookies. Session cookie attributes:

- HTTP-only.
- SameSite Lax or Strict.
- Secure in production.
- Path `/`.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-api.ts frontend/src/server/commercial/commercial-api.test.ts
git commit -m "feat: add commercial API handlers"
```

### Task 13: Protect Legacy Simulation Endpoints In Commercial Mode

**Files:**
- Modify: `frontend/server.ts`
- Test: `frontend/src/server/commercial/commercial-mode-routing.test.ts`

**Step 1: Write failing tests**

Create route-decision tests for a helper extracted from `server.ts`:

- When `COMMERCIAL_MODE_ENABLED=false`, legacy `/api/simulation-tasks` can use the existing file-backed service.
- When `COMMERCIAL_MODE_ENABLED=true`, unauthenticated `/api/simulation-tasks`, `/api/simulations`, and `/api/simulations/stream` are rejected or routed to commercial handlers.
- Commercial task creation requires session and credits.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-mode-routing.test.ts
```

Expected: FAIL.

**Step 3: Implement routing helper and server wiring**

Modify `frontend/server.ts`:

- Read `COMMERCIAL_MODE_ENABLED`.
- Instantiate commercial services only through commercial service factory.
- Add auth/session middleware for commercial routes.
- Gate legacy simulation endpoints in commercial mode.
- Keep local/demo behavior unchanged when commercial mode is off.

**Step 4: Run tests and lint**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-mode-routing.test.ts src/server/commercial/commercial-api.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/server.ts frontend/src/server/commercial/commercial-mode-routing.test.ts
git commit -m "feat: protect simulation routes in commercial mode"
```

### Task 14: Add Commercial Service Factory And Startup Validation

**Files:**
- Create: `frontend/src/server/commercial/commercial-services.ts`
- Test: `frontend/src/server/commercial/commercial-services.test.ts`
- Modify: `frontend/server.ts`

**Step 1: Write failing tests**

Test:

- Commercial mode requires `DATABASE_URL`.
- Commercial mode requires `REDIS_URL`.
- Commercial mode requires `SESSION_SECRET`.
- Commercial mode requires `ACCESS_CODE_PEPPER`.
- Commercial mode requires `USER_SECRET_ENCRYPTION_KEY`.
- Non-commercial mode can use file-backed/local defaults.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-services.test.ts
```

Expected: FAIL.

**Step 3: Implement service factory**

Create a factory that builds:

- Postgres repository.
- BullMQ queue.
- Auth service.
- Credit service.
- Task service.
- Admin service.
- Analytics service.

Commercial startup must throw a clear error if required env vars are missing.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-services.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-services.ts frontend/src/server/commercial/commercial-services.test.ts frontend/server.ts
git commit -m "feat: add commercial service startup validation"
```

### Task 15: Update Frontend Auth, Credits, And Task Client

**Files:**
- Create: `frontend/src/commercial-client.ts`
- Test: `frontend/src/commercial-client.test.ts`
- Modify: `frontend/src/simulation-tasks.ts`
- Modify: `frontend/src/App.tsx`

**Step 1: Write failing tests**

Test:

- Login/register clients call auth endpoints with credentials included.
- Credit redemption client calls `/api/credits/redeem`.
- Commercial task creation uses the same public task polling shape as existing progress UI.
- Insufficient credits surfaces a user-facing error.

**Step 2: Run tests**

Run:

```bash
cd frontend
npm test -- src/commercial-client.test.ts src/simulation-tasks.test.ts src/App.test.tsx
```

Expected: FAIL.

**Step 3: Implement client wiring**

Add minimal UI states:

- Logged-out prompt.
- Redeem access code form.
- Credit balance display.
- Start simulation disabled when balance is insufficient.

Keep the UI practical and compact; this is product surface, not a landing page.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/commercial-client.test.ts src/simulation-tasks.test.ts src/App.test.tsx
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/commercial-client.ts frontend/src/commercial-client.test.ts frontend/src/simulation-tasks.ts frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: add commercial user flow client"
```

## Phase 5: Admin MVP And Audit Logs

### Task 16: Implement Admin Service With Audit Logs

**Files:**
- Create: `frontend/src/server/commercial/admin-service.ts`
- Test: `frontend/src/server/commercial/admin-service.test.ts`

**Step 1: Write failing tests**

Test:

- Batch code generation stores code hashes and masked values.
- Raw codes are returned only in creation response.
- Disabling a code writes an audit log.
- Manual credit adjustment writes ledger and audit log.
- Disabling a user writes audit log.
- Changing system setting writes audit log.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/admin-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CommercialAdminService` with:

- `createAccessCode`
- `createAccessCodeBatch`
- `disableAccessCode`
- `adjustUserCredits`
- `disableUser`
- `updateSystemSetting`
- `appendAuditLog`

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/admin-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/admin-service.ts frontend/src/server/commercial/admin-service.test.ts
git commit -m "feat: add audited admin service"
```

### Task 17: Add Admin API Handlers

**Files:**
- Modify: `frontend/src/server/commercial/commercial-api.ts`
- Test: `frontend/src/server/commercial/commercial-api.test.ts`

**Step 1: Write failing tests**

Test:

- Non-admin sessions are rejected.
- Admin can create one code.
- Admin can batch create codes.
- Admin can disable code.
- Admin can adjust credits.
- Admin can list audit logs.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL.

**Step 3: Implement handlers**

Add admin handlers with session-derived admin user, not `isAdmin` booleans supplied by the caller.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-api.ts frontend/src/server/commercial/commercial-api.test.ts
git commit -m "feat: add audited admin APIs"
```

### Task 18: Add Admin Dashboard Skeleton

**Files:**
- Create: `frontend/src/components/admin/AdminDashboard.tsx`
- Create: `frontend/src/components/admin/AdminDashboard.test.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Write failing component test**

Use existing React component test patterns. Test that the dashboard renders sections:

- Overview.
- Users.
- Access Codes.
- Tasks.
- Feedback.
- Settings.
- Audit Logs.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/components/admin/AdminDashboard.test.tsx
```

Expected: FAIL.

**Step 3: Implement skeleton**

Build a dense operations UI:

- Tabs or left navigation.
- Summary metrics.
- Table placeholders.
- No nested cards.
- Admin-only route guard placeholder.

**Step 4: Run test and lint**

Run:

```bash
cd frontend
npm test -- src/components/admin/AdminDashboard.test.tsx
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/components/admin/AdminDashboard.tsx frontend/src/components/admin/AdminDashboard.test.tsx frontend/src/App.tsx
git commit -m "feat: add admin dashboard skeleton"
```

## Phase 6: Analytics And Feedback

### Task 19: Move Validation Events To Commercial Analytics Storage

**Files:**
- Create: `frontend/src/server/commercial/analytics-service.ts`
- Test: `frontend/src/server/commercial/analytics-service.test.ts`
- Modify: `frontend/src/server/validation/event-api.ts`

**Step 1: Write failing tests**

Test:

- Stores sanitized events in repository.
- Adds `createdAt`.
- Preserves existing validation event API behavior.
- Falls back to file append only in non-commercial local mode.

**Step 2: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/analytics-service.test.ts src/server/validation/event-api.test.ts
```

Expected: FAIL for missing analytics service.

**Step 3: Implement service and adapter**

Keep `appendValidationEvent` for local fallback, but allow commercial mode to inject `analyticsService`.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/analytics-service.test.ts src/server/validation/event-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/analytics-service.ts frontend/src/server/commercial/analytics-service.test.ts frontend/src/server/validation/event-api.ts
git commit -m "feat: add commercial analytics storage"
```

### Task 20: Add Report Feedback API

**Files:**
- Create: `frontend/src/server/commercial/feedback-service.ts`
- Test: `frontend/src/server/commercial/feedback-service.test.ts`
- Modify: `frontend/src/server/commercial/commercial-api.ts`

**Step 1: Write failing tests**

Test:

- Authenticated user can submit rating, usefulness, text, report id, and task id.
- Text is trimmed and capped.
- Invalid rating is rejected.
- Feedback links to task owner.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/feedback-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service and API handler**

Create:

- `FeedbackService.submitFeedback`
- `handleReportFeedbackRequest`

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/feedback-service.test.ts src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/feedback-service.ts frontend/src/server/commercial/feedback-service.test.ts frontend/src/server/commercial/commercial-api.ts
git commit -m "feat: add report feedback API"
```

## Phase 7: BYOK Tiers

### Task 21: Add API Key Encryption Utilities

**Files:**
- Create: `frontend/src/server/commercial/secrets.ts`
- Test: `frontend/src/server/commercial/secrets.test.ts`

**Step 1: Write failing tests**

Test:

- Encrypts plaintext API key.
- Decrypts with same master key.
- Does not store plaintext in ciphertext payload.
- Rejects invalid master key length.
- Rejects malformed payloads.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/secrets.test.ts
```

Expected: FAIL.

**Step 3: Implement AES-GCM encryption**

Use Node `crypto`:

- 32-byte master key from base64 env string.
- Random 12-byte IV.
- AES-256-GCM.
- Store `v1:<iv>:<tag>:<ciphertext>`.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/secrets.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/secrets.ts frontend/src/server/commercial/secrets.test.ts
git commit -m "feat: add encrypted secret storage utilities"
```

### Task 22: Add BYOK URL Safety Validation

**Files:**
- Create: `frontend/src/server/commercial/provider-url-safety.ts`
- Test: `frontend/src/server/commercial/provider-url-safety.test.ts`

**Step 1: Write failing tests**

Test rejection of:

- `http://` URLs.
- `localhost`.
- `127.0.0.1`.
- `0.0.0.0`.
- RFC1918 private ranges.
- Link-local ranges.
- IPv6 loopback.
- Cloud metadata IP `169.254.169.254`.
- URLs with credentials.
- Redirects to blocked hosts.

Test acceptance of:

- Explicitly allowed provider hosts.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/provider-url-safety.test.ts
```

Expected: FAIL.

**Step 3: Implement validator**

Implement:

- `validateProviderBaseUrl`
- `isBlockedProviderHost`
- Optional allowed-host list.

Provider test calls must disable automatic redirects or revalidate redirect targets before following.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/provider-url-safety.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/provider-url-safety.ts frontend/src/server/commercial/provider-url-safety.test.ts
git commit -m "feat: add BYOK provider URL safety checks"
```

### Task 23: Add User Model Provider Service

**Files:**
- Create: `frontend/src/server/commercial/model-provider-service.ts`
- Test: `frontend/src/server/commercial/model-provider-service.test.ts`
- Modify: `frontend/src/server/commercial/types.ts`
- Modify: `frontend/src/server/commercial/repository.ts`

**Step 1: Write failing tests**

Test:

- Basic users cannot save custom provider.
- Pro users with `custom_model_provider` can save provider.
- API key is encrypted in repository.
- Public DTO masks key and never returns encrypted value.
- Non-HTTPS and blocked hosts are rejected.
- Provider test timeout is enforced.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/model-provider-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Add `UserModelProviderRecord` and repository methods:

- `saveUserModelProvider`
- `getUserModelProvider`
- `deleteUserModelProvider`

Create service methods:

- `saveProvider`
- `getPublicProvider`
- `deleteProvider`
- `testProviderConnection`

Use `secrets.ts` and `provider-url-safety.ts`.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/model-provider-service.test.ts src/server/commercial/repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/model-provider-service.ts frontend/src/server/commercial/model-provider-service.test.ts frontend/src/server/commercial/types.ts frontend/src/server/commercial/repository.ts
git commit -m "feat: add BYOK model provider service"
```

### Task 24: Route Commercial Tasks To User Providers

**Files:**
- Modify: `frontend/src/server/ai/provider-config.ts`
- Modify: `frontend/src/server/ai/ai-gateway.ts`
- Modify: `frontend/src/server/commercial/commercial-task-service.ts`
- Test: `frontend/src/server/commercial/commercial-task-service.test.ts`

**Step 1: Write failing test**

Add tests that BYOK commercial tasks:

- Require stored provider config.
- Require `custom_model_provider` entitlement.
- Record `providerMode: "byok"`.
- Use decrypted OpenAI-compatible adapter metadata for worker execution.
- Release held credits on provider configuration failure.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: FAIL.

**Step 3: Implement provider resolution**

Add a helper that builds an OpenAI-compatible adapter from decrypted user provider config. Keep platform provider as default. Worker chooses user provider only when task `providerMode` is `byok`.

**Step 4: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts src/server/ai/adapters/openai-compatible.adapter.test.ts src/server/ai/provider-config.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/ai/provider-config.ts frontend/src/server/ai/ai-gateway.ts frontend/src/server/commercial/commercial-task-service.ts frontend/src/server/commercial/commercial-task-service.test.ts
git commit -m "feat: route commercial tasks to BYOK providers"
```

## Phase 8: Documentation And Verification

### Task 25: Document Commercial Configuration

**Files:**
- Modify: `frontend/.env.example`
- Modify: `frontend/README.md`
- Modify: `README.zh-CN.md`

**Step 1: Update env example**

Add:

- `COMMERCIAL_MODE_ENABLED`
- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `ACCESS_CODE_PEPPER`
- `USER_SECRET_ENCRYPTION_KEY`
- `MAX_WEIGHTED_CONCURRENCY`
- `PLATFORM_LEGACY_CREDIT_COST`
- `PLATFORM_DEEP_CREDIT_COST`
- `BYOK_LEGACY_CREDIT_COST`
- `BYOK_DEEP_CREDIT_COST`

**Step 2: Update docs**

Explain:

- Commercial mode requires Postgres and Redis.
- In-memory repositories are only for tests/local demo.
- Existing demo simulation endpoints are disabled or protected in commercial mode.
- Access-code credits and queue-backed task execution.
- BYOK security requirements.

**Step 3: Run checks**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/.env.example frontend/README.md README.zh-CN.md
git commit -m "docs: document commercial MVP configuration"
```

## Final Verification

Run:

```bash
cd frontend
npm run lint
npm test
npm run build
```

Expected:

- TypeScript check passes.
- Existing and new tests pass.
- Build succeeds.

Then inspect:

```bash
git status --short
git log --oneline -10
```

Expected:

- Working tree is clean except intentional local ignored files.
- Recent commits match completed tasks.

## Post-Plan Manual Checks

Before paid users:

- Start app with `COMMERCIAL_MODE_ENABLED=true` and missing env vars; confirm startup fails clearly.
- Start app with valid Postgres/Redis env vars; confirm health endpoint and auth routes work.
- Confirm unauthenticated `/api/simulation-tasks`, `/api/simulations`, and `/api/simulations/stream` cannot bypass credits.
- Register a user, redeem an access code, run ordinary task, confirm one credit captured.
- Run deep task, confirm three credits captured.
- Force worker failure, confirm credits release once.
- Retry worker completion callback, confirm credits are not double-captured.
- Configure BYOK with blocked URL, confirm rejection.
- Configure allowed BYOK provider with bad key, confirm clear failure and credit release.
- Generate and disable access code as admin, confirm audit logs.
