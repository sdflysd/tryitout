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
  assert.match(queries[0].sql, /on conflict \(id\) do update/i);
  assert.deepEqual(queries[0].params?.slice(0, 3), [
    "user_1",
    "user@example.test",
    "user@example.test",
  ]);
});

test("postgres repository maps findUserByEmail row to record", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new PostgresCommercialRepository({
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return {
        rows: [
          {
            id: "user_1",
            email: "user@example.test",
            email_normalized: "user@example.test",
            password_hash: "hash",
            role: "admin",
            tier: "pro",
            status: "active",
            features: ["admin_ops"],
            created_at: new Date("2026-07-07T00:00:00.000Z"),
            updated_at: new Date("2026-07-07T00:01:00.000Z"),
          } as T,
        ],
      };
    },
  });

  const user = await repo.findUserByEmail(" USER@example.test ");

  assert.equal(user?.role, "admin");
  assert.deepEqual(user?.features, ["admin_ops"]);
  assert.equal(user?.createdAt, "2026-07-07T00:00:00.000Z");
  assert.deepEqual(queries[0].params, ["user@example.test"]);
});

test("postgres repository maps saveCreditAccount to user_credit_accounts upsert", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new PostgresCommercialRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });

  await repo.saveCreditAccount({
    userId: "user_1",
    balance: 20,
    frozenCredits: 3,
    totalRedeemed: 25,
    totalCaptured: 5,
    updatedAt: "now",
  });

  assert.match(queries[0].sql, /insert into user_credit_accounts/i);
  assert.match(queries[0].sql, /on conflict \(user_id\) do update/i);
  assert.deepEqual(queries[0].params, ["user_1", 20, 3, 25, 5, "now"]);
});

test("postgres repository maps appendCreditLedgerEntry to credit_ledger insert", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new PostgresCommercialRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });

  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    taskId: "task_1",
    accessCodeId: "code_1",
    entryType: "redeem",
    amount: 10,
    balanceAfter: 10,
    frozenAfter: 0,
    idempotencyKey: "redeem_1",
    reason: "access_code",
    metadata: { source: "admin" },
    createdAt: "now",
  });

  assert.match(queries[0].sql, /insert into credit_ledger/i);
  assert.match(queries[0].sql, /entry_type/i);
  assert.doesNotMatch(queries[0].sql, /on conflict/i);
  assert.deepEqual(queries[0].params?.slice(0, 5), [
    "ledger_1",
    "user_1",
    "task_1",
    "code_1",
    "redeem",
  ]);
  assert.deepEqual(JSON.parse(queries[0].params?.at(-2) as string), {
    source: "admin",
  });
});

test("postgres repository maps getCommercialTask row to record", async () => {
  const repo = new PostgresCommercialRepository({
    query: async <T = Record<string, unknown>>() => ({
      rows: [
        {
          id: "task_1",
          user_id: "user_1",
          scenario_type: "life_choice",
          interaction_mode: "enabled",
          provider_mode: "platform",
          status: "queued",
          credit_cost: 3,
          credit_hold_ledger_id: null,
          priority: 0,
          queue_weight: 1,
          idempotency_key: null,
          input_summary: {},
          error_code: null,
          queued_at: "queued",
          started_at: null,
          completed_at: null,
          created_at: "created",
          updated_at: "updated",
        } as T,
      ],
    }),
  });

  assert.deepEqual(await repo.getCommercialTask("task_1"), {
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    priority: 0,
    queueWeight: 1,
    inputSummary: {},
    queuedAt: "queued",
    createdAt: "created",
    updatedAt: "updated",
  });
});

test("postgres repository maps appendAdminAuditLog actorUserId to actor_user_id", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new PostgresCommercialRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });

  await repo.appendAdminAuditLog({
    id: "audit_1",
    actorUserId: "admin_1",
    action: "credits_adjusted",
    targetType: "user",
    targetId: "user_1",
    metadata: { amount: 10 },
    ipHash: "ip_hash",
    userAgent: "agent",
    createdAt: "now",
  });

  assert.match(queries[0].sql, /insert into admin_audit_logs/i);
  assert.match(queries[0].sql, /actor_user_id/i);
  assert.doesNotMatch(queries[0].sql, /on conflict/i);
  assert.deepEqual(queries[0].params?.slice(0, 3), [
    "audit_1",
    "admin_1",
    "credits_adjusted",
  ]);
});

test("postgres repository supplies defaults for not-null optional fields", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new PostgresCommercialRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });

  await repo.saveCommercialTask({
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    createdAt: "created",
    updatedAt: "updated",
  });
  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    entryType: "hold",
    amount: -3,
    balanceAfter: 7,
    idempotencyKey: "hold_1",
    createdAt: "now",
  });
  await repo.appendSimulationTaskRun({
    id: "run_1",
    taskId: "task_1",
    status: "running",
    startedAt: "now",
  });
  await repo.appendSimulationStepRunCost({
    id: "step_1",
    taskId: "task_1",
    stepName: "generate_report",
    status: "started",
    startedAt: "now",
  });

  assert.equal(queries[0].params?.[8], 0);
  assert.equal(queries[0].params?.[9], 1);
  assert.equal(queries[0].params?.[13], "created");
  assert.equal(queries[1].params?.[7], 0);
  assert.equal(queries[2].params?.[3], 1);
  assert.equal(queries[3].params?.[16], 0);
});
