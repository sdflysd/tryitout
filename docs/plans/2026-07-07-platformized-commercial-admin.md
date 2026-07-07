# Platformized Commercial Admin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build TryItOut into a commercial platform with account-based paid usage, access-code credits, queued simulation workers, admin operations, cost monitoring, analytics, BYOK tiers, and audited controls.

**Architecture:** Implement the platform in staged vertical slices while preserving the existing simulation engine. The first implementation keeps the current `frontend` package as the initial runtime package, but introduces clear platform boundaries: shared commercial contracts, server-side commercial services, a separate worker entrypoint, commercial API handlers, and an admin app route. Later extraction into separate deployable apps is supported by these boundaries.

**Tech Stack:** React 19, Vite, Express, TypeScript, Node test runner with `tsx --test`, Postgres-compatible repository interfaces, Redis/BullMQ-style queue abstraction, existing AI Gateway and multi-agent simulation engine, lucide-react, Tailwind CSS.

---

## Ground Rules

- Use TDD. Every commercial behavior starts with a failing test.
- Keep existing demo mode working when `COMMERCIAL_MODE_ENABLED` is false.
- In commercial mode, legacy unauthenticated simulation routes must not bypass credits.
- Credits must be auditable through ledger rows and idempotency keys.
- Access-code raw values are returned only at creation/export time; persistent storage uses hash and masked display fields.
- Admin-sensitive actions must write audit logs.
- Do not store raw prompts, passwords, access-code secrets, or provider API keys in plaintext.

## Phase 1: Platform Foundation

### Task 1: Add Platform Runtime Contracts

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
  ADMIN_AUDIT_ACTIONS,
  COMMERCIAL_FEATURES,
  COMMERCIAL_TASK_STATUSES,
  CREDIT_LEDGER_ENTRY_TYPES,
  PROVIDER_MODES,
  SIMULATION_CREDIT_COSTS,
  USER_ROLES,
  USER_TIERS,
  getSimulationCreditCost,
  hasCommercialFeature,
  isAdminRole,
} from "./commercial.js";

test("commercial constants expose platform account, credit, task, and audit states", () => {
  assert.deepEqual(USER_ROLES, ["user", "admin", "owner"]);
  assert.deepEqual(USER_TIERS, ["basic", "pro", "business"]);
  assert.deepEqual(PROVIDER_MODES, ["platform", "byok"]);
  assert.deepEqual(ACCESS_CODE_STATUSES, ["active", "redeemed", "disabled", "expired"]);
  assert.deepEqual(CREDIT_LEDGER_ENTRY_TYPES, [
    "redeem",
    "hold",
    "capture",
    "release",
    "refund",
    "adjustment",
  ]);
  assert.deepEqual(COMMERCIAL_TASK_STATUSES, [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "refunded",
  ]);
  assert.ok(ADMIN_AUDIT_ACTIONS.includes("access_code_batch_created"));
});

test("simulation credit costs distinguish platform and BYOK deep mode", () => {
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "platform" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "platform" }), 3);
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "byok" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "byok" }), 2);
  assert.deepEqual(SIMULATION_CREDIT_COSTS.platform, { legacy: 1, enabled: 3 });
});

test("feature and admin helpers read commercial entitlement state", () => {
  assert.equal(hasCommercialFeature({ tier: "basic", features: [] }, "custom_model_provider"), false);
  assert.equal(hasCommercialFeature({ tier: "pro", features: ["custom_model_provider"] }, "custom_model_provider"), true);
  assert.equal(isAdminRole("user"), false);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("owner"), true);
});

test("commercial features include platform operations flags", () => {
  assert.deepEqual(COMMERCIAL_FEATURES, [
    "deep_mode",
    "priority_queue",
    "custom_model_provider",
    "admin_ops",
  ]);
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

- `USER_ROLES`
- `USER_TIERS`
- `COMMERCIAL_FEATURES`
- `PROVIDER_MODES`
- `ACCESS_CODE_STATUSES`
- `CREDIT_LEDGER_ENTRY_TYPES`
- `COMMERCIAL_TASK_STATUSES`
- `ADMIN_AUDIT_ACTIONS`
- `SIMULATION_CREDIT_COSTS`
- `CommercialEntitlements`
- `hasCommercialFeature`
- `isAdminRole`
- `getSimulationCreditCost`

Use `InteractionMode` from `../types.js`. Default costs:

```ts
export const SIMULATION_CREDIT_COSTS = {
  platform: { legacy: 1, enabled: 3 },
  byok: { legacy: 1, enabled: 2 },
} as const;
```

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
git commit -m "feat: add commercial platform contracts"
```

### Task 2: Add Commercial Environment Validation

**Files:**
- Create: `frontend/src/server/commercial/commercial-config.ts`
- Test: `frontend/src/server/commercial/commercial-config.test.ts`
- Modify: `frontend/.env.example`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/commercial-config.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { resolveCommercialConfig } from "./commercial-config.js";

test("commercial mode is disabled by default", () => {
  const config = resolveCommercialConfig({});
  assert.equal(config.enabled, false);
});

test("commercial mode requires production backing services and secrets", () => {
  assert.throws(
    () => resolveCommercialConfig({ COMMERCIAL_MODE_ENABLED: "true" }),
    /DATABASE_URL.*REDIS_URL.*SESSION_SECRET.*ACCESS_CODE_PEPPER.*USER_SECRET_ENCRYPTION_KEY/s,
  );
});

test("commercial mode resolves required URLs and numeric budgets", () => {
  const config = resolveCommercialConfig({
    COMMERCIAL_MODE_ENABLED: "true",
    DATABASE_URL: "postgres://tryitout:test@localhost:5432/tryitout",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "session-secret-with-at-least-32-characters",
    ACCESS_CODE_PEPPER: "pepper-with-at-least-32-characters",
    USER_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    MAX_WEIGHTED_CONCURRENCY: "12",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.maxWeightedConcurrency, 12);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-config.test.ts
```

Expected: FAIL because `commercial-config.ts` does not exist.

**Step 3: Implement config resolver**

Create `resolveCommercialConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>)`.

Rules:

- `COMMERCIAL_MODE_ENABLED=true` enables commercial mode.
- Enabled mode requires:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `SESSION_SECRET`
  - `ACCESS_CODE_PEPPER`
  - `USER_SECRET_ENCRYPTION_KEY`
- `USER_SECRET_ENCRYPTION_KEY` must be base64-decoded to 32 bytes.
- `MAX_WEIGHTED_CONCURRENCY` defaults to `30`.
- Return a typed config object; do not read `process.env` inside services.

Add the new env vars to `frontend/.env.example`.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-config.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-config.ts frontend/src/server/commercial/commercial-config.test.ts frontend/.env.example
git commit -m "feat: validate commercial platform configuration"
```

### Task 3: Add Database Migration For Platform State

**Files:**
- Create: `frontend/db/migrations/001_platformized_commercial.sql`
- Create: `frontend/db/README.md`

**Step 1: Draft migration**

Create tables:

- `users`
- `user_sessions`
- `user_credit_accounts`
- `credit_ledger`
- `access_code_batches`
- `access_codes`
- `access_code_redemptions`
- `simulation_tasks`
- `simulation_task_runs`
- `simulation_step_runs`
- `simulation_reports`
- `analytics_events`
- `user_feedback`
- `user_model_providers`
- `system_settings`
- `admin_audit_logs`

Required constraints:

- Unique `users.email_normalized`.
- Unique `user_sessions.token_hash`.
- Unique `access_codes.code_hash`.
- Unique `credit_ledger.idempotency_key`.
- Foreign keys from sessions, credits, ledger, redemptions, tasks, reports, feedback, and audit rows to users where applicable.
- Indexes on task status, task user, ledger user, access-code batch, event type, report task, and audit actor.

**Step 2: Add README**

Document:

- Migration order.
- Required env vars.
- Local Postgres requirement.
- Reset workflow.
- Why commercial mode must not use file-backed or in-memory production repositories.

**Step 3: Run static checks**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/db/migrations/001_platformized_commercial.sql frontend/db/README.md
git commit -m "docs: add platform commercial database schema"
```

## Phase 2: Repository And Core Records

### Task 4: Add Commercial Record Types And Repository Interface

**Files:**
- Create: `frontend/src/server/commercial/types.ts`
- Create: `frontend/src/server/commercial/repository.ts`
- Test: `frontend/src/server/commercial/repository.test.ts`

**Step 1: Write the failing test**

Create tests for `InMemoryCommercialRepository`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommercialRepository } from "./repository.js";

test("repository finds users case-insensitively by email", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveUser({
    id: "user_1",
    email: "User@Example.test",
    emailNormalized: "user@example.test",
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  });

  assert.equal((await repo.findUserByEmail("USER@example.test"))?.id, "user_1");
});

test("repository stores credit accounts, ledger entries, sessions, tasks, and audit logs", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveCreditAccount({ userId: "user_1", balance: 10, frozenCredits: 0, totalRedeemed: 10, totalCaptured: 0, updatedAt: "now" });
  await repo.appendCreditLedgerEntry({ id: "ledger_1", userId: "user_1", type: "redeem", amount: 10, balanceAfter: 10, idempotencyKey: "redeem_1", createdAt: "now" });
  await repo.saveSession({ id: "sess_1", userId: "user_1", tokenHash: "hash", expiresAt: "later", createdAt: "now" });
  await repo.saveCommercialTask({ id: "task_1", userId: "user_1", scenarioType: "life_choice", interactionMode: "enabled", providerMode: "platform", status: "queued", creditCost: 3, createdAt: "now", updatedAt: "now" });
  await repo.appendAdminAuditLog({ id: "audit_1", adminUserId: "admin_1", action: "user_credit_adjusted", targetType: "user", targetId: "user_1", metadata: {}, createdAt: "now" });

  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await repo.findCreditLedgerEntryByIdempotencyKey("redeem_1"))?.id, "ledger_1");
  assert.equal((await repo.findSessionByTokenHash("hash"))?.id, "sess_1");
  assert.equal((await repo.getCommercialTask("task_1"))?.status, "queued");
  assert.equal((await repo.listAdminAuditLogs()).length, 1);
});
```

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/repository.test.ts
```

Expected: FAIL.

**Step 3: Implement types and in-memory fake**

Create records for:

- `CommercialUserRecord`
- `CommercialSessionRecord`
- `UserCreditAccountRecord`
- `CreditLedgerEntryRecord`
- `AccessCodeBatchRecord`
- `AccessCodeRecord`
- `AccessCodeRedemptionRecord`
- `CommercialSimulationTaskRecord`
- `SimulationTaskRunRecord`
- `SimulationStepRunCostRecord`
- `CommercialSimulationReportRecord`
- `AnalyticsEventRecord`
- `UserFeedbackRecord`
- `UserModelProviderRecord`
- `SystemSettingRecord`
- `AdminAuditLogRecord`

Create `CommercialRepository` and `InMemoryCommercialRepository`. Keep the fake for tests only.

**Step 4: Run tests**

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

### Task 5: Add Postgres Repository Adapter

**Files:**
- Create: `frontend/src/server/commercial/postgres-repository.ts`
- Test: `frontend/src/server/commercial/postgres-repository.test.ts`

**Step 1: Write failing adapter tests**

Test with a fake query client:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { PostgresCommercialRepository } from "./postgres-repository.js";

test("postgres repository maps saveUser to users upsert", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new PostgresCommercialRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });

  await repo.saveUser({
    id: "user_1",
    email: "user@example.test",
    emailNormalized: "user@example.test",
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    createdAt: "now",
    updatedAt: "now",
  });

  assert.match(queries[0].sql, /insert into users/i);
  assert.deepEqual(queries[0].params?.slice(0, 3), ["user_1", "user@example.test", "user@example.test"]);
});

test("postgres repository maps findUserByEmail row to record", async () => {
  const repo = new PostgresCommercialRepository({
    query: async () => ({
      rows: [{
        id: "user_1",
        email: "user@example.test",
        email_normalized: "user@example.test",
        password_hash: "hash",
        role: "admin",
        tier: "pro",
        status: "active",
        features: ["admin_ops"],
        created_at: "now",
        updated_at: "now",
      }],
    }),
  });

  assert.equal((await repo.findUserByEmail("USER@example.test"))?.role, "admin");
});
```

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/postgres-repository.test.ts
```

Expected: FAIL.

**Step 3: Implement adapter**

Create a `QueryClient` interface:

```ts
export interface QueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
```

Implement mapping methods used by services. Keep driver construction out of this file so tests remain deterministic.

**Step 4: Run tests**

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

## Phase 3: Auth, Sessions, Access Codes, Credits

### Task 6: Add Password, Session, And Access-Code Secret Utilities

**Files:**
- Create: `frontend/src/server/commercial/passwords.ts`
- Create: `frontend/src/server/commercial/tokens.ts`
- Create: `frontend/src/server/commercial/access-code-secrets.ts`
- Test: `frontend/src/server/commercial/passwords.test.ts`
- Test: `frontend/src/server/commercial/tokens.test.ts`
- Test: `frontend/src/server/commercial/access-code-secrets.test.ts`

**Step 1: Write failing tests**

Test:

- Password hash is salted and not plaintext.
- Password verify accepts correct password and rejects wrong password.
- Session token hashing stores only hash.
- Access-code generation creates `TIO-XXXX-XXXX-XXXX`.
- Access-code normalization is case-insensitive and removes separators.
- Access-code hash uses pepper and timing-safe verification.
- Masking returns prefix/suffix only.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/passwords.test.ts src/server/commercial/tokens.test.ts src/server/commercial/access-code-secrets.test.ts
```

Expected: FAIL.

**Step 3: Implement utilities**

Use Node `crypto`:

- `scrypt` for passwords.
- Random 32-byte session tokens.
- SHA-256 over normalized code plus pepper.
- `crypto.timingSafeEqual` for hash verification.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/passwords.test.ts src/server/commercial/tokens.test.ts src/server/commercial/access-code-secrets.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/passwords.ts frontend/src/server/commercial/passwords.test.ts frontend/src/server/commercial/tokens.ts frontend/src/server/commercial/tokens.test.ts frontend/src/server/commercial/access-code-secrets.ts frontend/src/server/commercial/access-code-secrets.test.ts
git commit -m "feat: add commercial secret utilities"
```

### Task 7: Implement Auth Service

**Files:**
- Create: `frontend/src/server/commercial/auth-service.ts`
- Test: `frontend/src/server/commercial/auth-service.test.ts`

**Step 1: Write failing tests**

Test:

- Register normalizes email, hashes password, creates user and credit account.
- Duplicate email is rejected.
- Login verifies password and returns one-time raw session token.
- Repository stores only token hash.
- Disabled users cannot log in.
- Session lookup rejects expired/revoked sessions.
- Logout revokes session.

**Step 2: Run test**

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

Do not set cookies here; API handlers do that.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/auth-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/auth-service.ts frontend/src/server/commercial/auth-service.test.ts
git commit -m "feat: add commercial auth service"
```

### Task 8: Implement Access Code Service

**Files:**
- Create: `frontend/src/server/commercial/access-code-service.ts`
- Test: `frontend/src/server/commercial/access-code-service.test.ts`

**Step 1: Write failing tests**

Test:

- Admin can create a batch and receive raw codes.
- Stored records contain hash and masked code, not raw code.
- Creating codes records batch source, credits, tier grant, features, and expirations.
- Disabled/expired/redeemed codes cannot be redeemed.
- Code lookup uses normalized hash.
- Batch disabling disables active codes and writes audit metadata through dependency.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/access-code-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create:

- `createAccessCodeBatch`
- `createSingleAccessCode`
- `findRedeemableCode`
- `markRedeemed`
- `disableAccessCode`
- `disableAccessCodeBatch`

Return raw codes only from creation methods.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/access-code-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/access-code-service.ts frontend/src/server/commercial/access-code-service.test.ts
git commit -m "feat: add access code batch service"
```

### Task 9: Implement Credit Ledger Service

**Files:**
- Create: `frontend/src/server/commercial/credit-service.ts`
- Test: `frontend/src/server/commercial/credit-service.test.ts`

**Step 1: Write failing tests**

Test:

- Redeeming an active access code increases balance, writes ledger, and records redemption.
- Redeeming same code twice is rejected.
- Holding credits decreases available balance and increases frozen credits.
- Holding with insufficient credits is rejected.
- Capturing a hold decreases frozen credits exactly once.
- Releasing a hold returns credits exactly once.
- Refunding a captured task adds credits with audit reason.
- Admin adjustment changes balance and records actor/reason.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CreditService` with:

- `redeemAccessCode`
- `holdCreditsForTask`
- `captureHeldCredits`
- `releaseHeldCredits`
- `refundCapturedCredits`
- `adjustCredits`

Each write uses an idempotency key and updates `user_credit_accounts`.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/credit-service.ts frontend/src/server/commercial/credit-service.test.ts
git commit -m "feat: add idempotent credit ledger service"
```

### Task 10: Add Admin Audit Service

**Files:**
- Create: `frontend/src/server/commercial/audit-service.ts`
- Test: `frontend/src/server/commercial/audit-service.test.ts`

**Step 1: Write failing tests**

Test:

- Appends audit log for access-code batch creation.
- Appends audit log for credit adjustment.
- Captures actor, action, target type/id, metadata, IP, and user agent.
- Rejects unknown audit action.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/audit-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `AdminAuditService.append` and `assertAuditAction`.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/audit-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/audit-service.ts frontend/src/server/commercial/audit-service.test.ts
git commit -m "feat: add admin audit logging service"
```

## Phase 4: Queue, Paid Tasks, Worker Runtime

### Task 11: Add Weighted Queue Abstraction

**Files:**
- Create: `frontend/src/server/commercial/simulation-queue.ts`
- Test: `frontend/src/server/commercial/simulation-queue.test.ts`

**Step 1: Write failing tests**

Test:

- Ordinary tasks weight 1.
- Deep tasks weight 3.
- Queue job includes task id, user id, mode, provider mode, weight, and idempotency key.
- Weighted limiter claims jobs only within budget.
- Releasing jobs lowers active weight.
- Stale claim release is safe.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/simulation-queue.test.ts
```

Expected: FAIL.

**Step 3: Implement abstraction**

Create:

- `SimulationQueue`
- `SimulationQueueJob`
- `getSimulationJobWeight`
- `WeightedConcurrencyLimiter`
- `InMemorySimulationQueue`

BullMQ adapter comes later.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/simulation-queue.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/simulation-queue.ts frontend/src/server/commercial/simulation-queue.test.ts
git commit -m "feat: add weighted simulation queue"
```

### Task 12: Implement Commercial Simulation Task Service

**Files:**
- Create: `frontend/src/server/commercial/commercial-task-service.ts`
- Test: `frontend/src/server/commercial/commercial-task-service.test.ts`

**Step 1: Write failing tests**

Test:

- Creating a task requires active user.
- User with insufficient credits cannot create task.
- Single user active task limit rejects second queued/running task.
- Task creation calculates credit cost, creates hold, saves task, and enqueues job.
- If enqueue fails, hold is released and task is marked failed.
- Completion captures held credits once and stores report id.
- Failure releases held credits once and records normalized error code.
- Retry of failed/refunded task creates a new hold and queue job.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create methods:

- `createTask`
- `markRunning`
- `markCompleted`
- `markFailed`
- `cancelTask`
- `retryTask`
- `getStatus`
- `getReport`

Use `CreditService` and `SimulationQueue`.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-task-service.ts frontend/src/server/commercial/commercial-task-service.test.ts
git commit -m "feat: add commercial paid task service"
```

### Task 13: Add Simulation Worker Runner

**Files:**
- Create: `frontend/src/server/commercial/simulation-worker.ts`
- Create: `frontend/worker.ts`
- Test: `frontend/src/server/commercial/simulation-worker.test.ts`
- Modify: `frontend/package.json`

**Step 1: Write failing tests**

Test:

- Worker claims a job only when weighted capacity allows.
- Worker marks task running before simulation.
- Worker records task-run attempt.
- Worker saves report and calls task completion on success.
- Worker records step-run cost logs.
- Worker marks failure and releases credits on errors.
- Weighted capacity is released in `finally`.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/simulation-worker.test.ts
```

Expected: FAIL.

**Step 3: Implement runner**

Create a dependency-injected `runSimulationQueueJob` accepting:

- job
- task service
- limiter
- `runSimulation`
- `recordStepRun`
- `now`

Add `frontend/worker.ts` as the future process entrypoint and add package scripts:

```json
"worker": "tsx worker.ts"
```

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/simulation-worker.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/worker.ts frontend/package.json frontend/src/server/commercial/simulation-worker.ts frontend/src/server/commercial/simulation-worker.test.ts
git commit -m "feat: add commercial simulation worker runner"
```

### Task 14: Add BullMQ Queue Adapter

**Files:**
- Create: `frontend/src/server/commercial/bullmq-simulation-queue.ts`
- Test: `frontend/src/server/commercial/bullmq-simulation-queue.test.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Step 1: Write adapter tests**

Test:

- Queue name is stable.
- Job id equals task id.
- Job data includes weight and idempotency key.
- Retry/backoff options are set.

**Step 2: Install dependency**

Run:

```bash
cd frontend
npm install bullmq
```

**Step 3: Run failing test**

```bash
cd frontend
npm test -- src/server/commercial/bullmq-simulation-queue.test.ts
```

Expected: FAIL because adapter is missing.

**Step 4: Implement adapter**

Implement `BullMqSimulationQueue` behind `SimulationQueue`.

**Step 5: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/bullmq-simulation-queue.test.ts
npm run lint
```

Expected: PASS.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/server/commercial/bullmq-simulation-queue.ts frontend/src/server/commercial/bullmq-simulation-queue.test.ts
git commit -m "feat: add BullMQ queue adapter"
```

## Phase 5: API/BFF And Commercial Route Protection

### Task 15: Add Commercial API Handlers

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

Assertions:

- Password hash is never returned.
- Auth-required handlers reject missing session.
- Task creation rejects insufficient credits.
- Login returns a cookie descriptor with httpOnly, sameSite, and secure-in-production rules.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL.

**Step 3: Implement handlers**

Handlers should return:

```ts
type CommercialApiResult = {
  status: number;
  body: unknown;
  cookies?: Array<{ name: string; value: string; options: CookieOptions }>;
};
```

Keep Express response wiring in `server.ts`.

**Step 4: Run test**

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

### Task 16: Protect Legacy Simulation Routes In Commercial Mode

**Files:**
- Create: `frontend/src/server/commercial/commercial-routing.ts`
- Test: `frontend/src/server/commercial/commercial-routing.test.ts`
- Modify: `frontend/server.ts`

**Step 1: Write failing tests**

Test:

- Demo mode allows existing file-backed route handlers.
- Commercial mode rejects unauthenticated legacy `/api/simulations`.
- Commercial mode rejects unauthenticated legacy `/api/simulations/stream`.
- Commercial mode routes `/api/simulation-tasks` through commercial task creation only when session and credits are valid.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-routing.test.ts
```

Expected: FAIL.

**Step 3: Implement routing helper and server wiring**

Add helper functions:

- `isCommercialModeEnabled`
- `shouldBlockLegacySimulationRoute`
- `resolveSimulationTaskRouteMode`

Modify `server.ts` so commercial mode wires commercial handlers and blocks bypasses.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/commercial-routing.test.ts src/server/commercial/commercial-api.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/server.ts frontend/src/server/commercial/commercial-routing.ts frontend/src/server/commercial/commercial-routing.test.ts
git commit -m "feat: protect simulation routes in commercial mode"
```

### Task 17: Add Commercial Service Factory

**Files:**
- Create: `frontend/src/server/commercial/commercial-services.ts`
- Test: `frontend/src/server/commercial/commercial-services.test.ts`
- Modify: `frontend/server.ts`
- Modify: `frontend/worker.ts`

**Step 1: Write failing tests**

Test:

- Commercial mode creates auth, access-code, credit, task, audit, analytics, and queue services.
- Missing required config throws before server starts.
- Demo mode can omit Postgres/Redis.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-services.test.ts
```

Expected: FAIL.

**Step 3: Implement factory**

Create `createCommercialServices(config)` that wires:

- Postgres repository.
- BullMQ queue.
- Auth service.
- Access-code service.
- Credit service.
- Audit service.
- Task service.
- Analytics service placeholder.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/commercial-services.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/server.ts frontend/worker.ts frontend/src/server/commercial/commercial-services.ts frontend/src/server/commercial/commercial-services.test.ts
git commit -m "feat: wire commercial platform services"
```

## Phase 6: Admin Services And Admin App

### Task 18: Add Admin Aggregation Service

**Files:**
- Create: `frontend/src/server/commercial/admin-service.ts`
- Test: `frontend/src/server/commercial/admin-service.test.ts`

**Step 1: Write failing tests**

Test:

- Overview aggregates users, redeemed users, task counts, completion rate, failure rate, credits consumed, and estimated cost.
- Access-code batch creation delegates to access-code service and writes audit log.
- Manual credit adjustment delegates to credit service and writes audit log.
- User disable/restore writes audit log.
- Sensitive report summary access writes audit log.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/admin-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CommercialAdminService` with:

- `getOverview`
- `listUsers`
- `getUserDetail`
- `createAccessCodeBatch`
- `disableAccessCodeBatch`
- `adjustUserCredits`
- `disableUser`
- `restoreUser`
- `getTaskDetail`
- `getAuditLogs`

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/admin-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/admin-service.ts frontend/src/server/commercial/admin-service.test.ts
git commit -m "feat: add commercial admin service"
```

### Task 19: Add Admin API Handlers

**Files:**
- Modify: `frontend/src/server/commercial/commercial-api.ts`
- Test: `frontend/src/server/commercial/commercial-api.test.ts`

**Step 1: Add failing tests**

Test:

- Non-admin session cannot access admin endpoints.
- Admin can fetch overview.
- Admin can create one code and batch codes.
- Admin can disable code batch.
- Admin can adjust credits.
- Admin can list audit logs.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL for new handlers.

**Step 3: Implement admin handlers**

Add handlers under `/api/admin/*` and enforce session-derived role with `isAdminRole`.

**Step 4: Run test**

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-api.ts frontend/src/server/commercial/commercial-api.test.ts
git commit -m "feat: add admin API handlers"
```

### Task 20: Add Admin Client And Dashboard Shell

**Files:**
- Create: `frontend/src/admin/admin-client.ts`
- Create: `frontend/src/admin/AdminApp.tsx`
- Create: `frontend/src/admin/AdminApp.test.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Write failing tests**

Test:

- Admin app renders navigation for Overview, Users, Access Codes, Credits, Tasks, Queue, Costs, Feedback, Settings, Audit Logs.
- Admin overview renders supplied metric values.
- Admin client calls `/api/admin/overview` with credentials included.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/admin/AdminApp.test.tsx
```

Expected: FAIL.

**Step 3: Implement shell**

Build a dense operations UI:

- Left nav.
- Top filters.
- Alert strip.
- Metric strip.
- Tables for recent failures, redemptions, high-cost tasks, feedback.

Avoid nested cards and marketing layout.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/admin/AdminApp.test.tsx
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/admin/admin-client.ts frontend/src/admin/AdminApp.tsx frontend/src/admin/AdminApp.test.tsx frontend/src/App.tsx
git commit -m "feat: add admin dashboard shell"
```

### Task 21: Add Admin Access Codes UI

**Files:**
- Create: `frontend/src/admin/AccessCodesPage.tsx`
- Create: `frontend/src/admin/AccessCodesPage.test.tsx`
- Modify: `frontend/src/admin/AdminApp.tsx`
- Modify: `frontend/src/admin/admin-client.ts`

**Step 1: Write failing tests**

Test:

- Batch table shows batch name, source, credits, features, created count, redeemed count, redemption rate, and status.
- Create form captures count, credits, tier, features, expiration, source, and notes.
- Creation result displays raw codes and a "copy all" control.
- Leaving creation result keeps only masked codes in list data.

**Step 2: Run test**

```bash
cd frontend
npm test -- src/admin/AccessCodesPage.test.tsx
```

Expected: FAIL.

**Step 3: Implement page**

Use compact table and form controls. Use `navigator.clipboard.writeText` behind an injectable copy dependency for tests.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/admin/AccessCodesPage.test.tsx
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/admin/AccessCodesPage.tsx frontend/src/admin/AccessCodesPage.test.tsx frontend/src/admin/AdminApp.tsx frontend/src/admin/admin-client.ts
git commit -m "feat: add admin access code operations UI"
```

### Task 22: Add Admin Users, Credits, Tasks, And Costs UI

**Files:**
- Create: `frontend/src/admin/UsersPage.tsx`
- Create: `frontend/src/admin/TasksPage.tsx`
- Create: `frontend/src/admin/CostsPage.tsx`
- Create: `frontend/src/admin/UsersPage.test.tsx`
- Create: `frontend/src/admin/TasksPage.test.tsx`
- Create: `frontend/src/admin/CostsPage.test.tsx`
- Modify: `frontend/src/admin/AdminApp.tsx`
- Modify: `frontend/src/admin/admin-client.ts`

**Step 1: Write failing tests**

Test:

- Users table shows email, status, tier, available/frozen credits, redeemed batches, task count, completed/failed, recent activity.
- User detail exposes credit adjustment action with confirmation state.
- Tasks table shows task id, user, scenario, mode, status, queue wait, run duration, credits, tokens, cost, error, worker.
- Task detail shows timeline and step cost table.
- Costs page groups cost by provider, model, step, task, and success/failure.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/admin/UsersPage.test.tsx src/admin/TasksPage.test.tsx src/admin/CostsPage.test.tsx
```

Expected: FAIL.

**Step 3: Implement pages**

Use dense tables, status badges, and drill-down panels. Do not reveal raw prompts or raw access codes.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/admin/UsersPage.test.tsx src/admin/TasksPage.test.tsx src/admin/CostsPage.test.tsx
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/admin/UsersPage.tsx frontend/src/admin/TasksPage.tsx frontend/src/admin/CostsPage.tsx frontend/src/admin/UsersPage.test.tsx frontend/src/admin/TasksPage.test.tsx frontend/src/admin/CostsPage.test.tsx frontend/src/admin/AdminApp.tsx frontend/src/admin/admin-client.ts
git commit -m "feat: add admin user task and cost views"
```

## Phase 7: User Commercial Flow

### Task 23: Add User Commercial Client And Account UI

**Files:**
- Create: `frontend/src/commercial-client.ts`
- Create: `frontend/src/components/AccountPanel.tsx`
- Create: `frontend/src/commercial-client.test.ts`
- Create: `frontend/src/components/AccountPanel.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/simulation-tasks.ts`

**Step 1: Write failing tests**

Test:

- Register/login clients include credentials and call correct endpoints.
- Redeem client calls `/api/credits/redeem`.
- Account panel shows email, tier, credits balance, frozen credits, and redeem form.
- Simulation submit shows credit cost and disables start when credits are insufficient in commercial mode.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/commercial-client.test.ts src/components/AccountPanel.test.tsx src/App.test.tsx src/simulation-tasks.test.ts
```

Expected: FAIL.

**Step 3: Implement user flow**

Add:

- `fetchMe`
- `login`
- `register`
- `logout`
- `redeemAccessCode`
- `fetchCredits`
- commercial-aware task creation.

Keep demo mode behavior unchanged.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/commercial-client.test.ts src/components/AccountPanel.test.tsx src/App.test.tsx src/simulation-tasks.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/commercial-client.ts frontend/src/commercial-client.test.ts frontend/src/components/AccountPanel.tsx frontend/src/components/AccountPanel.test.tsx frontend/src/App.tsx frontend/src/simulation-tasks.ts frontend/src/App.test.tsx frontend/src/simulation-tasks.test.ts
git commit -m "feat: add commercial user account flow"
```

## Phase 8: Analytics, Feedback, And Monitoring

### Task 24: Move Validation Events Into Commercial Analytics

Status: Completed on 2026-07-07.

**Files:**
- Create: `frontend/src/server/commercial/analytics-service.ts`
- Test: `frontend/src/server/commercial/analytics-service.test.ts`
- Modify: `frontend/src/server/validation/event-api.ts`
- Modify: `frontend/src/server/validation/event-api.test.ts`

**Step 1: Write failing tests**

Test:

- Sanitized validation events are stored as `analytics_events` in commercial mode.
- Local demo still appends JSONL events.
- Event storage never includes raw private user input.
- Overview metrics can aggregate request, completion, failure, report view, paywall click, lead, and deep-mode counts.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/analytics-service.test.ts src/server/validation/event-api.test.ts
```

Expected: FAIL.

**Step 3: Implement analytics service**

Create:

- `recordEvent`
- `summarizeFunnel`
- `summarizeScenarioMix`
- `summarizeDeepModeHealth`

Inject it into validation event handler in commercial mode.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/analytics-service.test.ts src/server/validation/event-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/analytics-service.ts frontend/src/server/commercial/analytics-service.test.ts frontend/src/server/validation/event-api.ts frontend/src/server/validation/event-api.test.ts
git commit -m "feat: store commercial analytics events"
```

### Task 25: Add Queue And Worker Monitoring Records

Status: Completed on 2026-07-07.

**Files:**
- Modify: `frontend/src/server/commercial/types.ts`
- Modify: `frontend/src/server/commercial/repository.ts`
- Create: `frontend/src/server/commercial/worker-monitoring.ts`
- Test: `frontend/src/server/commercial/worker-monitoring.test.ts`
- Modify: `frontend/src/server/commercial/simulation-worker.ts`

**Step 1: Write failing tests**

Test:

- Worker heartbeat is recorded with worker id, active weight, and current task id.
- Stuck task detection returns running jobs older than threshold.
- Admin queue summary exposes queued, running, retrying, stuck, active weight, and max weight.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/worker-monitoring.test.ts src/server/commercial/simulation-worker.test.ts
```

Expected: FAIL.

**Step 3: Implement monitoring**

Add worker heartbeat records and queue summary helpers.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/worker-monitoring.test.ts src/server/commercial/simulation-worker.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/types.ts frontend/src/server/commercial/repository.ts frontend/src/server/commercial/worker-monitoring.ts frontend/src/server/commercial/worker-monitoring.test.ts frontend/src/server/commercial/simulation-worker.ts frontend/src/server/commercial/simulation-worker.test.ts
git commit -m "feat: add worker and queue monitoring"
```

## Phase 9: BYOK And Tiered Providers

### Task 26: Add Secret Encryption And Provider URL Safety

Status: Completed on 2026-07-07.

**Files:**
- Create: `frontend/src/server/commercial/secrets.ts`
- Create: `frontend/src/server/commercial/provider-url-safety.ts`
- Test: `frontend/src/server/commercial/secrets.test.ts`
- Test: `frontend/src/server/commercial/provider-url-safety.test.ts`

**Step 1: Write failing tests**

Test:

- AES-GCM encryption does not include plaintext.
- Decrypt works with same 32-byte master key.
- Invalid master key length is rejected.
- Provider URL rejects `http`, localhost, loopback, RFC1918 private ranges, link-local, cloud metadata IP, credentials, and blocked redirects.
- Allowed HTTPS provider host is accepted.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/secrets.test.ts src/server/commercial/provider-url-safety.test.ts
```

Expected: FAIL.

**Step 3: Implement utilities**

Use Node `crypto` AES-256-GCM for API keys. Validate provider URLs before saving and before testing.

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/secrets.test.ts src/server/commercial/provider-url-safety.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/secrets.ts frontend/src/server/commercial/secrets.test.ts frontend/src/server/commercial/provider-url-safety.ts frontend/src/server/commercial/provider-url-safety.test.ts
git commit -m "feat: add BYOK secret and URL safety"
```

### Task 27: Add User Model Provider Service

**Files:**
- Create: `frontend/src/server/commercial/model-provider-service.ts`
- Test: `frontend/src/server/commercial/model-provider-service.test.ts`
- Modify: `frontend/src/server/commercial/types.ts`
- Modify: `frontend/src/server/commercial/repository.ts`

**Step 1: Write failing tests**

Test:

- Basic users cannot save custom provider.
- Pro/business users with `custom_model_provider` can save provider.
- API key is encrypted before repository save.
- Public DTO masks key suffix and never returns encrypted value.
- Blocked URLs are rejected.
- Provider test timeout is enforced.

**Step 2: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/model-provider-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create:

- `saveProvider`
- `getPublicProvider`
- `deleteProvider`
- `testProviderConnection`
- `resolveProviderForTask`

**Step 4: Run tests**

```bash
cd frontend
npm test -- src/server/commercial/model-provider-service.test.ts src/server/commercial/repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/model-provider-service.ts frontend/src/server/commercial/model-provider-service.test.ts frontend/src/server/commercial/types.ts frontend/src/server/commercial/repository.ts frontend/src/server/commercial/repository.test.ts
git commit -m "feat: add user BYOK provider service"
```

## Phase 10: Launch Readiness

### Task 28: Add Admin Seed And Operational Scripts

**Files:**
- Create: `frontend/scripts/seed-admin.ts`
- Create: `frontend/scripts/export-access-code-batch.ts`
- Test: `frontend/scripts/seed-admin.test.ts`
- Modify: `frontend/package.json`

**Step 1: Write failing tests**

Test:

- Seed script creates owner user when none exists.
- Seed script is idempotent by normalized email.
- Export script exports only creation-time raw code payloads supplied to it, not database-reconstructed raw codes.

**Step 2: Run tests**

```bash
cd frontend
npm test -- scripts/seed-admin.test.ts
```

Expected: FAIL.

**Step 3: Implement scripts**

Add package scripts:

```json
"seed:admin": "tsx scripts/seed-admin.ts",
"export:access-codes": "tsx scripts/export-access-code-batch.ts"
```

**Step 4: Run tests**

```bash
cd frontend
npm test -- scripts/seed-admin.test.ts
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/scripts/seed-admin.ts frontend/scripts/export-access-code-batch.ts frontend/scripts/seed-admin.test.ts frontend/package.json
git commit -m "feat: add commercial operations scripts"
```

### Task 29: Add Deployment And Commercial Runbook Docs

**Files:**
- Create: `docs/operations/commercial-platform-runbook.md`
- Modify: `frontend/README.md`
- Modify: `README.zh-CN.md`
- Modify: `SECURITY.md`

**Step 1: Write docs**

Document:

- Required services: Postgres, Redis, API process, worker process.
- Required env vars.
- Commercial mode route protection.
- Admin seed process.
- Access-code generation/export rules.
- Credits ledger policy.
- Worker and queue operations.
- Backup/export expectations.
- Privacy and sensitive-data handling.

**Step 2: Run checks**

```bash
cd frontend
npm run lint
```

Expected: PASS.

**Step 3: Commit**

```bash
git add docs/operations/commercial-platform-runbook.md frontend/README.md README.zh-CN.md SECURITY.md
git commit -m "docs: add commercial platform runbook"
```

### Task 30: Final Verification

**Files:**
- No expected source changes unless failures reveal issues.

**Step 1: Run focused commercial tests**

```bash
cd frontend
npm test -- src/server/commercial/*.test.ts src/admin/*.test.tsx src/commercial-client.test.ts
```

Expected: PASS.

**Step 2: Run full test suite**

```bash
cd frontend
npm test
```

Expected: PASS.

**Step 3: Run typecheck**

```bash
cd frontend
npm run lint
```

Expected: PASS.

**Step 4: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

**Step 5: Manual smoke checks**

Run:

```bash
cd frontend
npm run dev
```

Check in demo mode:

- Existing home/input/report flow still works.
- No login is required when commercial mode is off.

Then start with commercial env vars:

- Missing required vars fail startup clearly.
- Login/register endpoints work.
- Unauthenticated legacy simulation endpoints cannot bypass credits.
- Admin owner can create access-code batch and copy raw codes.
- User can redeem code and see credits.
- User can create paid task with credit hold.
- Worker success captures credits.
- Worker failure releases credits.
- Admin dashboard shows users, codes, tasks, costs, and audit logs.

**Step 6: Inspect git**

```bash
git status --short
git log --oneline -10
```

Expected:

- Working tree clean except intentional ignored files.
- Recent commits match completed tasks.
