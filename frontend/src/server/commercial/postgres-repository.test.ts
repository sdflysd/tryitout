import assert from "node:assert/strict";
import test from "node:test";

import { PostgresCommercialRepository, type QueryClient } from "./postgres-repository.js";

interface QueryCall {
  sql: string;
  params?: unknown[];
}

class FakeQueryClient implements QueryClient {
  calls: QueryCall[] = [];
  rows: unknown[][] = [];

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ sql, params });
    return { rows: (this.rows.shift() ?? []) as T[] };
  }
}

const now = new Date("2026-07-06T12:00:00.000Z");

test("saveUser performs an upsert with expected params", async () => {
  const client = new FakeQueryClient();
  const repository = new PostgresCommercialRepository(client);

  await repository.saveUser({
    id: "user_1",
    email: "founder@tryitout.ai",
    passwordHash: "hash",
    tier: "pro",
    features: ["custom_model_provider"],
    isAdmin: true,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  assert.match(client.calls[0].sql, /INSERT INTO users/i);
  assert.match(client.calls[0].sql, /ON CONFLICT \(id\) DO UPDATE/i);
  assert.deepEqual(client.calls[0].params, [
    "user_1",
    "founder@tryitout.ai",
    "hash",
    "pro",
    ["custom_model_provider"],
    true,
    null,
    now,
    now,
  ]);
});

test("findUserByEmail maps a row to a CommercialUserRecord", async () => {
  const client = new FakeQueryClient();
  client.rows.push([
    {
      id: "user_1",
      email: "Founder@TryItOut.ai",
      password_hash: "hash",
      tier: "basic",
      features: [],
      is_admin: false,
      disabled_at: null,
      created_at: now,
      updated_at: now,
    },
  ]);
  const repository = new PostgresCommercialRepository(client);

  const user = await repository.findUserByEmail("FOUNDER@TRYITOUT.AI");

  assert.equal(client.calls[0].params?.[0], "founder@tryitout.ai");
  assert.equal(user?.passwordHash, "hash");
  assert.equal(user?.isAdmin, false);
  assert.equal(user?.disabledAt, undefined);
});

test("saveSession and findSessionByTokenHash map rows correctly", async () => {
  const client = new FakeQueryClient();
  const repository = new PostgresCommercialRepository(client);
  const expiresAt = new Date("2026-07-13T12:00:00.000Z");

  await repository.saveSession({
    id: "session_1",
    userId: "user_1",
    tokenHash: "token_hash",
    expiresAt,
    revokedAt: undefined,
    createdAt: now,
  });

  assert.match(client.calls[0].sql, /INSERT INTO user_sessions/i);
  assert.deepEqual(client.calls[0].params, ["session_1", "user_1", "token_hash", expiresAt, null, now]);

  client.rows.push([
    {
      id: "session_1",
      user_id: "user_1",
      token_hash: "token_hash",
      expires_at: expiresAt,
      revoked_at: null,
      created_at: now,
    },
  ]);

  const session = await repository.findSessionByTokenHash("token_hash");

  assert.equal(session?.userId, "user_1");
  assert.equal(session?.revokedAt, undefined);
});

test("appendLedgerEntry writes idempotencyKey", async () => {
  const client = new FakeQueryClient();
  const repository = new PostgresCommercialRepository(client);

  await repository.appendLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    type: "hold",
    amount: -3,
    balanceAfter: 7,
    idempotencyKey: "task_1:hold",
    referenceType: "simulation_task",
    referenceId: "task_1",
    metadata: { taskId: "task_1" },
    createdAt: now,
  });

  assert.match(client.calls[0].sql, /INSERT INTO credit_ledger/i);
  assert.deepEqual(client.calls[0].params, [
    "ledger_1",
    "user_1",
    "hold",
    -3,
    7,
    "task_1:hold",
    "simulation_task",
    "task_1",
    { taskId: "task_1" },
    now,
  ]);
});

test("saveCommercialTask persists credit ledger references", async () => {
  const client = new FakeQueryClient();
  const repository = new PostgresCommercialRepository(client);

  await repository.saveCommercialTask({
    id: "task_1",
    userId: "user_1",
    status: "queued",
    scenario: "side_hustle",
    userInput: "launch",
    interactionMode: "enabled",
    providerMode: "platform",
    creditCost: 3,
    creditHoldLedgerEntryId: "hold_1",
    creditCapturedLedgerEntryId: "capture_1",
    creditReleasedLedgerEntryId: undefined,
    queueJobId: "job_1",
    reportId: "report_1",
    errorCode: undefined,
    createdAt: now,
    updatedAt: now,
  });

  assert.match(client.calls[0].sql, /INSERT INTO simulation_tasks/i);
  assert.deepEqual(client.calls[0].params?.slice(10, 14), ["hold_1", "capture_1", null, "job_1"]);
});

test("appendAdminAuditLog inserts actor, action, target, and metadata", async () => {
  const client = new FakeQueryClient();
  const repository = new PostgresCommercialRepository(client);

  await repository.appendAdminAuditLog({
    id: "audit_1",
    adminUserId: "admin_1",
    action: "credits.adjusted",
    targetType: "user",
    targetId: "user_1",
    metadata: { amount: 5 },
    createdAt: now,
  });

  assert.match(client.calls[0].sql, /INSERT INTO admin_audit_logs/i);
  assert.deepEqual(client.calls[0].params, [
    "audit_1",
    "admin_1",
    "credits.adjusted",
    "user",
    "user_1",
    { amount: 5 },
    now,
  ]);
});
