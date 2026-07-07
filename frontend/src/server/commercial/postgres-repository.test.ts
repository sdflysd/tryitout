import assert from "node:assert/strict";
import test from "node:test";

import { PostgresCommercialRepository } from "./postgres-repository.js";
import type { CommercialSimulationReportRecord } from "./types.js";

type QueryLog = { sql: string; params?: unknown[] };

function createCapturingRepository(): {
  queries: QueryLog[];
  repo: PostgresCommercialRepository;
} {
  const queries: QueryLog[] = [];
  return {
    queries,
    repo: new PostgresCommercialRepository({
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    }),
  };
}

function createRowRepository(
  rows: Array<Record<string, unknown>>,
): {
  queries: QueryLog[];
  repo: PostgresCommercialRepository;
} {
  const queries: QueryLog[] = [];
  return {
    queries,
    repo: new PostgresCommercialRepository({
      query: async <T = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => {
        queries.push({ sql, params });
        return { rows: rows as T[] };
      },
    }),
  };
}

function parsedJsonParam(params: unknown[] | undefined, index: number): unknown {
  return JSON.parse(params?.[index] as string);
}

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

test("postgres repository creates user with credit account in one atomic query", async () => {
  const { repo, queries } = createCapturingRepository();

  await repo.createUserWithCreditAccount(
    {
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
    },
    {
      userId: "user_1",
      balance: 0,
      frozenCredits: 0,
      totalRedeemed: 0,
      totalCaptured: 0,
      updatedAt: "now",
    },
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /with inserted_user as/i);
  assert.match(queries[0].sql, /insert into users/i);
  assert.match(queries[0].sql, /insert into user_credit_accounts/i);
  assert.match(
    queries[0].sql,
    /select id, \$12, \$13, \$14, \$15, \$16\s+from inserted_user/i,
  );
  assert.doesNotMatch(queries[0].sql, /on conflict/i);
  assert.deepEqual(queries[0].params?.slice(0, 4), [
    "user_1",
    "user@example.test",
    "user@example.test",
    "hash",
  ]);
  assert.deepEqual(queries[0].params?.slice(11), [
    0,
    0,
    0,
    0,
    "now",
  ]);
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

test("postgres repository rejects rows missing required columns", async () => {
  const { repo } = createRowRepository([
    {
      id: "task_1",
      scenario_type: "life_choice",
      interaction_mode: "enabled",
      provider_mode: "platform",
      status: "queued",
      credit_cost: 3,
      created_at: "created",
      updated_at: "updated",
    },
  ]);

  await assert.rejects(repo.getCommercialTask("task_1"), /simulation_tasks\.user_id/);
});

test("postgres repository rejects malformed required array columns", async () => {
  const { repo } = createRowRepository([
    {
      id: "user_1",
      email: "user@example.test",
      email_normalized: "user@example.test",
      password_hash: "hash",
      role: "user",
      tier: "basic",
      status: "active",
      features: { not: "an array" },
      created_at: "created",
      updated_at: "updated",
    },
  ]);

  await assert.rejects(repo.findUserByEmail("user@example.test"), /users\.features/);
});

test("postgres repository rejects wrong-shaped required text columns", async () => {
  const numericId = createRowRepository([
    {
      id: 123,
      email: "user@example.test",
      email_normalized: "user@example.test",
      password_hash: "hash",
      role: "user",
      tier: "basic",
      status: "active",
      features: [],
      created_at: "created",
      updated_at: "updated",
    },
  ]);

  await assert.rejects(numericId.repo.findUserByEmail("user@example.test"), /users\.id/);

  const booleanStatus = createRowRepository([
    {
      id: "user_1",
      email: "user@example.test",
      email_normalized: "user@example.test",
      password_hash: "hash",
      role: "user",
      tier: "basic",
      status: true,
      features: [],
      created_at: "created",
      updated_at: "updated",
    },
  ]);

  await assert.rejects(booleanStatus.repo.getUser("user_1"), /users\.status/);
});

test("postgres repository maps timestamp columns from Date and string values", async () => {
  const { repo } = createRowRepository([
    {
      id: "user_1",
      email: "user@example.test",
      email_normalized: "user@example.test",
      password_hash: "hash",
      role: "user",
      tier: "basic",
      status: "active",
      features: [],
      last_login_at: new Date("2026-07-07T00:02:00.000Z"),
      created_at: new Date("2026-07-07T00:00:00.000Z"),
      updated_at: "2026-07-07T00:01:00.000Z",
    },
  ]);

  assert.deepEqual(await repo.getUser("user_1"), {
    id: "user_1",
    email: "user@example.test",
    emailNormalized: "user@example.test",
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    lastLoginAt: "2026-07-07T00:02:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:01:00.000Z",
  });
});

test("postgres repository rejects malformed required json object columns", async () => {
  const { repo } = createRowRepository([
    {
      id: "batch_1",
      name: "Launch",
      code_count: 2,
      credits: 10,
      features: [],
      metadata: [],
      created_at: "created",
    },
  ]);

  await assert.rejects(repo.getAccessCodeBatch("batch_1"), /access_code_batches\.metadata/);
});

test("postgres repository rejects malformed report JSON columns", async () => {
  const publicReportArray = createRowRepository([
    {
      id: "report_1",
      task_id: "task_1",
      user_id: "user_1",
      public_report: [],
      deep_report: null,
      share_card: null,
      unlocked: true,
      created_at: "created",
      updated_at: "updated",
    },
  ]);

  await assert.rejects(
    publicReportArray.repo.getCommercialReportByTaskId("task_1"),
    /simulation_reports\.public_report/,
  );

  const deepReportPrimitive = createRowRepository([
    {
      id: "report_1",
      task_id: "task_1",
      user_id: "user_1",
      public_report: null,
      deep_report: "not-json-object",
      share_card: null,
      unlocked: true,
      created_at: "created",
      updated_at: "updated",
    },
  ]);

  await assert.rejects(
    deepReportPrimitive.repo.getCommercialReportByTaskId("task_1"),
    /simulation_reports\.deep_report/,
  );
});

test("postgres repository rejects blank numeric strings", async () => {
  const requiredNumber = createRowRepository([
    {
      user_id: "user_1",
      balance: "",
      frozen_credits: 0,
      total_redeemed: 0,
      total_captured: 0,
      updated_at: "updated",
    },
  ]);

  await assert.rejects(requiredNumber.repo.getCreditAccount("user_1"), /user_credit_accounts\.balance/);

  const optionalNumber = createRowRepository([
    {
      id: "feedback_1",
      user_id: "user_1",
      task_id: null,
      report_id: null,
      rating: "   ",
      feedback_type: null,
      comment: null,
      metadata: {},
      created_at: "created",
    },
  ]);

  await assert.rejects(optionalNumber.repo.listUserFeedback("user_1"), /user_feedback\.rating/);
});

test("postgres repository maps sessions writes and nullable row fields", async () => {
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();
  await writeRepo.saveSession({
    id: "sess_1",
    userId: "user_1",
    tokenHash: "token_hash",
    userAgent: "agent",
    ipHash: "ip_hash",
    expiresAt: "expires",
    revokedAt: "revoked",
    createdAt: "created",
  });

  assert.match(writeQueries[0].sql, /insert into user_sessions/i);
  assert.deepEqual(writeQueries[0].params, [
    "sess_1",
    "user_1",
    "token_hash",
    "agent",
    "ip_hash",
    "expires",
    "revoked",
    "created",
  ]);

  const { repo: readRepo, queries: readQueries } = createRowRepository([
    {
      id: "sess_1",
      user_id: "user_1",
      token_hash: "token_hash",
      user_agent: null,
      ip_hash: null,
      expires_at: new Date("2026-07-07T01:00:00.000Z"),
      revoked_at: null,
      created_at: new Date("2026-07-07T00:00:00.000Z"),
    },
  ]);

  assert.deepEqual(await readRepo.findSessionByTokenHash("token_hash"), {
    id: "sess_1",
    userId: "user_1",
    tokenHash: "token_hash",
    expiresAt: "2026-07-07T01:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  assert.deepEqual(readQueries[0].params, ["token_hash"]);
});

test("postgres repository revokes active sessions for a user", async () => {
  const { repo, queries } = createCapturingRepository();

  await repo.revokeUserSessions("user_1", "revoked-now");

  assert.match(queries[0].sql, /update user_sessions/i);
  assert.match(queries[0].sql, /set revoked_at = \$2/i);
  assert.match(queries[0].sql, /where user_id = \$1/i);
  assert.match(queries[0].sql, /revoked_at is null/i);
  assert.deepEqual(queries[0].params, ["user_1", "revoked-now"]);
});

test("postgres repository maps access code batches writes and reads", async () => {
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();
  await writeRepo.saveAccessCodeBatch({
    id: "batch_1",
    createdByUserId: "admin_1",
    name: "Launch",
    source: "campaign",
    codeCount: 2,
    credits: 10,
    tier: "pro",
    features: ["deep_mode"],
    expiresAt: "expires",
    disabledAt: "disabled",
    notes: "notes",
    metadata: { channel: "email" },
    createdAt: "created",
  });

  assert.match(writeQueries[0].sql, /insert into access_code_batches/i);
  assert.deepEqual(writeQueries[0].params, [
    "batch_1",
    "admin_1",
    "Launch",
    "campaign",
    2,
    10,
    "pro",
    JSON.stringify(["deep_mode"]),
    "expires",
    "disabled",
    "notes",
    JSON.stringify({ channel: "email" }),
    "created",
  ]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 7), ["deep_mode"]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 11), {
    channel: "email",
  });

  const { repo: readRepo } = createRowRepository([
    {
      id: "batch_1",
      created_by_user_id: null,
      name: "Launch",
      source: null,
      code_count: "2",
      credits: "10",
      tier: null,
      features: ["deep_mode"],
      expires_at: null,
      disabled_at: null,
      notes: null,
      metadata: { channel: "email" },
      created_at: new Date("2026-07-07T00:00:00.000Z"),
    },
  ]);

  assert.deepEqual(await readRepo.getAccessCodeBatch("batch_1"), {
    id: "batch_1",
    name: "Launch",
    codeCount: 2,
    credits: 10,
    features: ["deep_mode"],
    metadata: { channel: "email" },
    createdAt: "2026-07-07T00:00:00.000Z",
  });
});

test("postgres repository maps access codes writes and reads", async () => {
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();
  await writeRepo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash",
    codeMask: "TEST-****",
    status: "redeemed",
    credits: 10,
    tier: "pro",
    features: ["priority_queue"],
    expiresAt: "expires",
    redeemedByUserId: "user_1",
    redeemedAt: "redeemed",
    disabledAt: "disabled",
    createdAt: "created",
  });

  assert.match(writeQueries[0].sql, /insert into access_codes/i);
  assert.deepEqual(writeQueries[0].params, [
    "code_1",
    "batch_1",
    "hash",
    "TEST-****",
    "redeemed",
    10,
    "pro",
    JSON.stringify(["priority_queue"]),
    "expires",
    "user_1",
    "redeemed",
    "disabled",
    "created",
  ]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 7), [
    "priority_queue",
  ]);

  const { repo: readRepo } = createRowRepository([
    {
      id: "code_1",
      batch_id: "batch_1",
      code_hash: "hash",
      code_mask: "TEST-****",
      status: "active",
      credits: "10",
      tier: null,
      features: [],
      expires_at: null,
      redeemed_by_user_id: null,
      redeemed_at: null,
      disabled_at: null,
      created_at: new Date("2026-07-07T00:00:00.000Z"),
    },
  ]);

  assert.deepEqual(await readRepo.findAccessCodeByHash("hash"), {
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash",
    codeMask: "TEST-****",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "2026-07-07T00:00:00.000Z",
  });
});

test("postgres repository maps access code redemptions inserts and reads", async () => {
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();
  await writeRepo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    creditLedgerId: "ledger_1",
    credits: 10,
    tierGranted: "pro",
    featuresGranted: ["deep_mode"],
    redeemedAt: "redeemed",
    metadata: { source: "code" },
  });

  assert.match(writeQueries[0].sql, /insert into access_code_redemptions/i);
  assert.doesNotMatch(writeQueries[0].sql, /on conflict/i);
  assert.deepEqual(writeQueries[0].params, [
    "redemption_1",
    "code_1",
    "user_1",
    "ledger_1",
    10,
    "pro",
    JSON.stringify(["deep_mode"]),
    "redeemed",
    JSON.stringify({ source: "code" }),
  ]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 6), ["deep_mode"]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 8), {
    source: "code",
  });

  const { repo: readRepo } = createRowRepository([
    {
      id: "redemption_1",
      access_code_id: "code_1",
      user_id: "user_1",
      credit_ledger_id: null,
      credits: "10",
      tier_granted: null,
      features_granted: [],
      redeemed_at: new Date("2026-07-07T00:00:00.000Z"),
      metadata: { source: "code" },
    },
  ]);

  assert.deepEqual(
    await readRepo.findAccessCodeRedemptionByCodeId("code_1"),
    {
      id: "redemption_1",
      accessCodeId: "code_1",
      userId: "user_1",
      credits: 10,
      featuresGranted: [],
      redeemedAt: "2026-07-07T00:00:00.000Z",
      metadata: { source: "code" },
    },
  );
});

test("postgres repository maps report writes and nullable JSONB reads", async () => {
  const publicReport = {
    id: "simulation_1",
  } as unknown as NonNullable<CommercialSimulationReportRecord["publicReport"]>;
  const deepReport = {
    projectName: "Deep report",
  } as unknown as NonNullable<CommercialSimulationReportRecord["deepReport"]>;
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();

  await writeRepo.saveCommercialReport({
    id: "report_1",
    taskId: "task_1",
    userId: "user_1",
    publicReport,
    deepReport,
    shareCard: { title: "Share" },
    unlocked: true,
    createdAt: "created",
    updatedAt: "updated",
  });

  assert.match(writeQueries[0].sql, /insert into simulation_reports/i);
  assert.match(writeQueries[0].sql, /on conflict \(id\) do update/i);
  assert.deepEqual(writeQueries[0].params, [
    "report_1",
    "task_1",
    "user_1",
    JSON.stringify(publicReport),
    JSON.stringify(deepReport),
    JSON.stringify({ title: "Share" }),
    true,
    "created",
    "updated",
  ]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 5), {
    title: "Share",
  });

  const { repo: readRepo } = createRowRepository([
    {
      id: "report_1",
      task_id: "task_1",
      user_id: "user_1",
      public_report: null,
      deep_report: { projectName: "Deep report" },
      share_card: null,
      unlocked: true,
      created_at: new Date("2026-07-07T00:00:00.000Z"),
      updated_at: "updated",
    },
  ]);

  assert.deepEqual(await readRepo.getCommercialReportByTaskId("task_1"), {
    id: "report_1",
    taskId: "task_1",
    userId: "user_1",
    deepReport: { projectName: "Deep report" },
    unlocked: true,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "updated",
  });
});

test("postgres repository maps analytics and feedback lists", async () => {
  const { repo: analyticsRepo } = createRowRepository([
    {
      id: "event_1",
      user_id: null,
      task_id: "task_1",
      session_id: null,
      event_type: "task_started",
      source: "server",
      properties: { mode: "enabled" },
      occurred_at: new Date("2026-07-07T00:00:00.000Z"),
    },
  ]);
  assert.deepEqual(await analyticsRepo.listAnalyticsEvents(), [
    {
      id: "event_1",
      taskId: "task_1",
      eventType: "task_started",
      source: "server",
      properties: { mode: "enabled" },
      occurredAt: "2026-07-07T00:00:00.000Z",
    },
  ]);

  const { repo: feedbackRepo, queries } = createRowRepository([
    {
      id: "feedback_1",
      user_id: "user_1",
      task_id: null,
      report_id: "report_1",
      rating: "5",
      feedback_type: null,
      comment: "Useful",
      metadata: { source: "report" },
      created_at: new Date("2026-07-07T00:01:00.000Z"),
    },
  ]);
  assert.deepEqual(await feedbackRepo.listUserFeedback("user_1"), [
    {
      id: "feedback_1",
      userId: "user_1",
      reportId: "report_1",
      rating: 5,
      comment: "Useful",
      metadata: { source: "report" },
      createdAt: "2026-07-07T00:01:00.000Z",
    },
  ]);
  assert.deepEqual(queries[0].params, ["user_1"]);
});

test("postgres repository maps model provider writes and reads", async () => {
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();
  await writeRepo.saveUserModelProvider({
    id: "provider_1",
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.example.test",
    encryptedApiKey: "encrypted",
    apiKeyMask: "sk-****",
    modelFast: "fast",
    modelBalanced: "balanced",
    modelDeep: "deep",
    status: "active",
    lastTestedAt: "tested",
    lastTestStatus: "passed",
    createdAt: "created",
    updatedAt: "updated",
  });

  assert.match(writeQueries[0].sql, /insert into user_model_providers/i);
  assert.deepEqual(writeQueries[0].params, [
    "provider_1",
    "user_1",
    "openai",
    "OpenAI",
    "https://api.example.test",
    "encrypted",
    "sk-****",
    "fast",
    "balanced",
    "deep",
    "active",
    "tested",
    "passed",
    "created",
    "updated",
  ]);

  const { repo: readRepo, queries: readQueries } = createRowRepository([
    {
      id: "provider_1",
      user_id: "user_1",
      provider: "openai",
      display_name: "OpenAI",
      base_url: "https://api.example.test",
      encrypted_api_key: "encrypted",
      api_key_mask: "sk-****",
      model_fast: null,
      model_balanced: "balanced",
      model_deep: null,
      status: "disabled",
      last_tested_at: new Date("2026-07-07T00:00:00.000Z"),
      last_test_status: "failed",
      created_at: "created",
      updated_at: new Date("2026-07-07T00:01:00.000Z"),
    },
  ]);

  assert.deepEqual(await readRepo.listUserModelProviders("user_1"), [
    {
      id: "provider_1",
      userId: "user_1",
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.example.test",
      encryptedApiKey: "encrypted",
      apiKeyMask: "sk-****",
      modelBalanced: "balanced",
      status: "disabled",
      lastTestedAt: "2026-07-07T00:00:00.000Z",
      lastTestStatus: "failed",
      createdAt: "created",
      updatedAt: "2026-07-07T00:01:00.000Z",
    },
  ]);
  assert.deepEqual(readQueries[0].params, ["user_1"]);
});

test("postgres repository maps system setting writes and reads", async () => {
  const { repo: writeRepo, queries: writeQueries } = createCapturingRepository();
  await writeRepo.saveSystemSetting({
    key: "queue.paused",
    value: { paused: true },
    description: "Queue pause flag",
    updatedByUserId: "admin_1",
    createdAt: "created",
    updatedAt: "updated",
  });

  assert.match(writeQueries[0].sql, /insert into system_settings/i);
  assert.deepEqual(writeQueries[0].params, [
    "queue.paused",
    JSON.stringify({ paused: true }),
    "Queue pause flag",
    "admin_1",
    "created",
    "updated",
  ]);
  assert.deepEqual(parsedJsonParam(writeQueries[0].params, 1), {
    paused: true,
  });

  const { repo: readRepo } = createRowRepository([
    {
      key: "queue.paused",
      value: { paused: false },
      description: null,
      updated_by_user_id: null,
      created_at: new Date("2026-07-07T00:00:00.000Z"),
      updated_at: "updated",
    },
  ]);

  assert.deepEqual(await readRepo.getSystemSetting("queue.paused"), {
    key: "queue.paused",
    value: { paused: false },
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "updated",
  });
});

test("postgres repository leaves natural-key duplicate handling to database constraints", async () => {
  const { repo: reportRepo, queries: reportQueries } = createCapturingRepository();
  await reportRepo.saveCommercialReport({
    id: "report_1",
    taskId: "task_1",
    userId: "user_1",
    unlocked: false,
    createdAt: "created",
    updatedAt: "updated",
  });
  assert.match(reportQueries[0].sql, /on conflict \(id\) do update/i);
  assert.doesNotMatch(reportQueries[0].sql, /on conflict \(task_id\)/i);

  const { repo: providerRepo, queries: providerQueries } = createCapturingRepository();
  await providerRepo.saveUserModelProvider({
    id: "provider_1",
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.example.test",
    encryptedApiKey: "encrypted",
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: "created",
    updatedAt: "updated",
  });
  assert.match(providerQueries[0].sql, /on conflict \(id\) do update/i);
  assert.doesNotMatch(providerQueries[0].sql, /on conflict \(user_id, provider\)/i);

  const duplicateError = new Error(
    'duplicate key value violates unique constraint "simulation_reports_task_unique"',
  );
  const repo = new PostgresCommercialRepository({
    query: async () => {
      throw duplicateError;
    },
  });

  await assert.rejects(
    repo.saveCommercialReport({
      id: "report_2",
      taskId: "task_1",
      userId: "user_1",
      unlocked: false,
      createdAt: "created",
      updatedAt: "updated",
    }),
    /simulation_reports_task_unique/,
  );
});
