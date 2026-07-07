import assert from "node:assert/strict";
import test from "node:test";

import { PostgresCommercialRepository } from "./postgres-repository.js";
import type {
  AdminAuditLogRecord,
  CommercialSimulationReportRecord,
} from "./types.js";

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

function createSequentialRowRepository(
  rowBatches: Array<Array<Record<string, unknown>>>,
): {
  queries: QueryLog[];
  repo: PostgresCommercialRepository;
} {
  const queries: QueryLog[] = [];
  let index = 0;
  return {
    queries,
    repo: new PostgresCommercialRepository({
      query: async <T = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => {
        queries.push({ sql, params });
        const rows = rowBatches[Math.min(index, rowBatches.length - 1)] ?? [];
        index += 1;
        return { rows: rows as T[] };
      },
    }),
  };
}

function createPoolTransactionRepository(
  rowBatches: Array<Array<Record<string, unknown>>>,
): {
  poolQueries: QueryLog[];
  acquiredQueries: QueryLog[];
  readonly releases: number;
  repo: PostgresCommercialRepository;
} {
  const poolQueries: QueryLog[] = [];
  const acquiredQueries: QueryLog[] = [];
  let releases = 0;
  let index = 0;
  const nextRows = <T = Record<string, unknown>>() => {
    const rows = rowBatches[Math.min(index, rowBatches.length - 1)] ?? [];
    index += 1;
    return { rows: rows as T[] };
  };
  const acquiredClient = {
    query: async <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => {
      acquiredQueries.push({ sql, params });
      return nextRows<T>();
    },
    release: () => {
      releases += 1;
    },
  };

  return {
    poolQueries,
    acquiredQueries,
    get releases() {
      return releases;
    },
    repo: new PostgresCommercialRepository({
      query: async <T = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => {
        poolQueries.push({ sql, params });
        return nextRows<T>();
      },
      connect: async () => acquiredClient,
    }),
  };
}

function parsedJsonParam(params: unknown[] | undefined, index: number): unknown {
  return JSON.parse(params?.[index] as string);
}

function rowsForHeldCreditQuery(
  sql: string,
  params?: unknown[],
): Array<Record<string, unknown>> {
  if (/^\s*begin\s*$/i.test(sql) || /^\s*commit\s*$/i.test(sql)) {
    return [];
  }
  if (/from simulation_tasks/i.test(sql) && /for update/i.test(sql)) {
    return [{ id: params?.[0], user_id: params?.[1] }];
  }
  if (/update user_credit_accounts/i.test(sql)) {
    const amount = Number(params?.[1] ?? 0);
    return [
      {
        account_user_id: params?.[0],
        balance: String(10 - amount),
        frozen_credits: String(amount),
        total_redeemed: "10",
        total_captured: "0",
        updated_at: params?.[2],
      },
    ];
  }
  if (/insert into credit_ledger/i.test(sql)) {
    return [
      {
        id: params?.[0],
        user_id: params?.[1],
        task_id: params?.[2],
        access_code_id: params?.[3],
        entry_type: params?.[4],
        amount: String(params?.[5]),
        balance_after: String(params?.[6]),
        frozen_after: String(params?.[7]),
        idempotency_key: params?.[8],
        reason: params?.[9],
        metadata: JSON.parse(params?.[10] as string),
        created_at: params?.[11],
      },
    ];
  }
  if (/update simulation_tasks/i.test(sql)) {
    return [{ id: params?.[0] }];
  }
  return [];
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

test("postgres repository maps admin list views for users, accounts, ledger, codes, tasks, reports, and costs", async () => {
  const userRepo = createRowRepository([
    {
      id: "user_1",
      email: "user@example.test",
      email_normalized: "user@example.test",
      password_hash: "hash",
      role: "admin",
      tier: "pro",
      status: "active",
      features: ["admin_ops"],
      created_at: "created",
      updated_at: "updated",
    },
  ]);
  assert.equal((await userRepo.repo.listUsers())[0]?.id, "user_1");
  assert.match(userRepo.queries[0].sql, /from users/i);
  assert.match(userRepo.queries[0].sql, /order by created_at desc/i);

  const accountRepo = createRowRepository([
    {
      user_id: "user_1",
      balance: "10",
      frozen_credits: "2",
      total_redeemed: "20",
      total_captured: "3",
      updated_at: "updated",
    },
  ]);
  assert.equal((await accountRepo.repo.listCreditAccounts())[0]?.balance, 10);
  assert.match(accountRepo.queries[0].sql, /from user_credit_accounts/i);

  const ledgerRepo = createRowRepository([
    {
      id: "ledger_1",
      user_id: "user_1",
      task_id: null,
      access_code_id: null,
      entry_type: "adjustment",
      amount: "10",
      balance_after: "10",
      frozen_after: "0",
      idempotency_key: "adjust_1",
      reason: "manual",
      metadata: {},
      created_at: "created",
    },
  ]);
  assert.equal(
    (await ledgerRepo.repo.listCreditLedgerEntries("user_1"))[0]?.id,
    "ledger_1",
  );
  assert.deepEqual(ledgerRepo.queries[0].params, ["user_1"]);

  const batchRepo = createRowRepository([
    {
      id: "batch_1",
      created_by_user_id: "admin_1",
      name: "Batch",
      source: "sales",
      code_count: "1",
      credits: "10",
      tier: "pro",
      features: ["deep_mode"],
      expires_at: null,
      disabled_at: null,
      notes: null,
      metadata: {},
      created_at: "created",
    },
  ]);
  assert.equal((await batchRepo.repo.listAccessCodeBatches())[0]?.id, "batch_1");
  assert.match(batchRepo.queries[0].sql, /from access_code_batches/i);

  const codeRepo = createRowRepository([
    {
      id: "code_1",
      batch_id: "batch_1",
      code_hash: "hash_1",
      code_mask: "TEST-****-001",
      status: "redeemed",
      credits: "10",
      tier: null,
      features: [],
      expires_at: null,
      redeemed_by_user_id: "user_1",
      redeemed_at: "redeemed",
      disabled_at: null,
      created_at: "created",
    },
  ]);
  assert.equal((await codeRepo.repo.listAccessCodes())[0]?.redeemedByUserId, "user_1");
  assert.match(codeRepo.queries[0].sql, /from access_codes/i);

  const taskRepo = createRowRepository([
    {
      id: "task_1",
      user_id: "user_1",
      scenario_type: "life_choice",
      interaction_mode: "enabled",
      provider_mode: "platform",
      status: "completed",
      credit_cost: "3",
      credit_hold_ledger_id: null,
      priority: "0",
      queue_weight: "1",
      idempotency_key: null,
      input_summary: {},
      error_code: null,
      queued_at: "queued",
      started_at: null,
      completed_at: "completed",
      created_at: "created",
      updated_at: "updated",
    },
  ]);
  assert.equal((await taskRepo.repo.listCommercialTasks("user_1"))[0]?.id, "task_1");
  assert.deepEqual(taskRepo.queries[0].params, ["user_1"]);

  const reportRepo = createRowRepository([
    {
      id: "report_1",
      task_id: "task_1",
      user_id: "user_1",
      public_report: null,
      deep_report: null,
      share_card: null,
      unlocked: true,
      created_at: "created",
      updated_at: "updated",
    },
  ]);
  assert.equal((await reportRepo.repo.listCommercialReports("user_1"))[0]?.id, "report_1");
  assert.deepEqual(reportRepo.queries[0].params, ["user_1"]);

  const costRepo = createRowRepository([
    {
      id: "cost_1",
      task_run_id: null,
      task_id: "task_1",
      stage_index: null,
      step_name: "simulate",
      round_index: null,
      agent_id: null,
      provider: null,
      model_id: null,
      model_profile_id: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      cached_tokens: null,
      estimated_cost: "0.12",
      latency_ms: null,
      retry_count: null,
      status: "completed",
      error_code: null,
      started_at: "started",
      completed_at: "completed",
      metadata: {},
    },
  ]);
  assert.equal((await costRepo.repo.listSimulationStepRunCosts())[0]?.estimatedCost, 0.12);
  assert.equal(costRepo.queries[0].params, undefined);
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

test("postgres repository adjusts credits with audit in one CTE query", async () => {
  const { repo, queries } = createRowRepository([
    {
      id: "ledger_1",
      user_id: "user_1",
      task_id: null,
      access_code_id: null,
      entry_type: "adjustment",
      amount: "-3",
      balance_after: "7",
      frozen_after: "0",
      idempotency_key: "adjust_1",
      reason: "manual_correction",
      metadata: { actorUserId: "admin_1" },
      created_at: "adjusted",
      account_user_id: "user_1",
      balance: "7",
      frozen_credits: "0",
      total_redeemed: "10",
      total_captured: "0",
      updated_at: "adjusted",
    },
  ]);

  const result = await repo.adjustCreditsWithAudit({
    ledgerEntry: {
      id: "ledger_1",
      userId: "user_1",
      entryType: "adjustment",
      amount: -3,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "adjust_1",
      reason: "manual_correction",
      metadata: { actorUserId: "admin_1" },
      createdAt: "adjusted",
    },
    amount: -3,
    auditLog: {
      id: "audit_1",
      actorUserId: "admin_1",
      action: "credits_adjusted",
      targetType: "user",
      targetId: "user_1",
      metadata: { creditLedgerId: "ledger_1" },
      createdAt: "adjusted",
    },
  });

  assert.equal(result?.ledger.id, "ledger_1");
  assert.equal(result?.account.balance, 7);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /with updated_account as/i);
  assert.match(queries[0].sql, /update user_credit_accounts/i);
  assert.match(queries[0].sql, /insert into credit_ledger/i);
  assert.match(queries[0].sql, /insert into admin_audit_logs/i);
  assert.deepEqual(queries[0].params?.slice(0, 4), [
    "user_1",
    -3,
    "adjusted",
    "ledger_1",
  ]);
});

test("postgres repository redeems access code transactionally after locking code and account", async () => {
  const { repo, queries } = createSequentialRowRepository([
    [],
    [
      {
        id: "code_1",
        credits: "10",
        tier: "pro",
        features: ["deep_mode"],
      },
    ],
    [],
    [
      {
        account_user_id: "user_1",
        balance: "10",
        frozen_credits: "0",
        total_redeemed: "10",
        total_captured: "0",
        updated_at: "redeemed",
      },
    ],
    [
      {
        id: "ledger_1",
        user_id: "user_1",
        task_id: null,
        access_code_id: "code_1",
        entry_type: "redeem",
        amount: "10",
        balance_after: "10",
        frozen_after: "0",
        idempotency_key: "redeem_1",
        reason: null,
        metadata: { source: "code" },
        created_at: "redeemed",
      },
    ],
    [
      {
        redemption_id: "redemption_1",
        redemption_access_code_id: "code_1",
        redemption_user_id: "user_1",
        redemption_credit_ledger_id: "ledger_1",
        redemption_credits: "10",
        redemption_tier_granted: "pro",
        redemption_features_granted: ["deep_mode"],
        redemption_redeemed_at: "redeemed",
        redemption_metadata: { source: "code" },
      },
    ],
    [],
  ]);

  const redeemed = await repo.redeemAccessCodeWithCreditLedger(
    {
      id: "code_1",
      batchId: "batch_1",
      codeHash: "hash_1",
      codeMask: "TEST-****-001",
      status: "redeemed",
      credits: 10,
      tier: "pro",
      features: ["deep_mode"],
      redeemedByUserId: "user_1",
      redeemedAt: "stale-code-redeemed-at",
      createdAt: "created",
    },
    {
      id: "redemption_1",
      accessCodeId: "code_1",
      userId: "user_1",
      creditLedgerId: "ledger_1",
      credits: 10,
      tierGranted: "pro",
      featuresGranted: ["deep_mode"],
      redeemedAt: "redeemed",
      metadata: { source: "code" },
    },
    {
      id: "ledger_1",
      userId: "user_1",
      accessCodeId: "code_1",
      entryType: "redeem",
      amount: 10,
      balanceAfter: 10,
      frozenAfter: 0,
      idempotencyKey: "redeem_1",
      metadata: { source: "code" },
      createdAt: "redeemed",
    },
  );

  assert.equal(redeemed?.ledger.id, "ledger_1");
  assert.equal(redeemed?.account.balance, 10);
  assert.equal(redeemed?.redemption.creditLedgerId, "ledger_1");
  assert.equal(queries[0].sql.trim().toLowerCase(), "begin");
  assert.match(queries[1].sql, /from access_codes/i);
  assert.match(queries[1].sql, /for update/i);
  assert.match(queries[2].sql, /update access_codes/i);
  assert.match(queries[3].sql, /update user_credit_accounts/i);
  assert.match(queries[3].sql, /balance = balance \+ \$\d+/i);
  assert.match(queries[3].sql, /total_redeemed = total_redeemed \+ \$\d+/i);
  assert.match(queries[4].sql, /insert into credit_ledger/i);
  assert.match(queries[5].sql, /insert into access_code_redemptions/i);
  assert.equal(queries.at(-1)?.sql.trim().toLowerCase(), "commit");
  assert.equal(queries[2].params?.[2], "redeemed");
  assert.notEqual(queries[2].params?.[2], "stale-code-redeemed-at");
});

test("postgres repository holds credits transactionally after locking task", async () => {
  const { repo, queries } = createSequentialRowRepository([
    [],
    [{ id: "task_1", user_id: "user_1" }],
    [
      {
        account_user_id: "user_1",
        balance: "7",
        frozen_credits: "3",
        total_redeemed: "10",
        total_captured: "0",
        updated_at: "held",
      },
    ],
    [
      {
        id: "ledger_1",
        user_id: "user_1",
        task_id: "task_1",
        access_code_id: null,
        entry_type: "hold",
        amount: "-3",
        balance_after: "7",
        frozen_after: "3",
        idempotency_key: "hold_1",
        reason: "task_queued",
        metadata: {},
        created_at: "held",
      },
    ],
    [{ id: "task_1" }],
    [],
  ]);

  const result = await repo.holdCreditsForTask({
    ledgerEntry: {
      id: "ledger_1",
      userId: "user_1",
      taskId: "task_1",
      entryType: "hold",
      amount: -3,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "hold_1",
      reason: "task_queued",
      metadata: {},
      createdAt: "held",
    },
    amount: 3,
    taskUpdatedAt: "held",
  });

  assert.equal(result?.account.balance, 7);
  assert.equal(result?.ledger.balanceAfter, 7);
  assert.equal(queries[0].sql.trim().toLowerCase(), "begin");
  assert.match(queries[1].sql, /from simulation_tasks/i);
  assert.match(queries[1].sql, /credit_hold_ledger_id is null/i);
  assert.match(queries[1].sql, /for update/i);
  assert.match(queries[2].sql, /update user_credit_accounts/i);
  assert.match(queries[2].sql, /balance = balance - \$\d+/i);
  assert.match(queries[2].sql, /frozen_credits = frozen_credits \+ \$\d+/i);
  assert.match(queries[2].sql, /balance >= \$\d+/i);
  assert.match(queries[3].sql, /insert into credit_ledger/i);
  assert.match(queries[4].sql, /update simulation_tasks/i);
  assert.match(queries[4].sql, /credit_hold_ledger_id = \$\d+/i);
  assert.match(queries[4].sql, /credit_hold_ledger_id is null/i);
  assert.equal(queries.at(-1)?.sql.trim().toLowerCase(), "commit");
});

test("postgres repository returns undefined when hold account update matches no rows", async () => {
  const { repo, queries } = createSequentialRowRepository([
    [],
    [{ id: "task_1", user_id: "user_1" }],
    [],
    [],
  ]);

  const result = await repo.holdCreditsForTask({
    ledgerEntry: {
      id: "ledger_1",
      userId: "user_1",
      taskId: "task_1",
      entryType: "hold",
      amount: -3,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "hold_1",
      reason: "task_queued",
      metadata: {},
      createdAt: "held",
    },
    amount: 3,
    taskUpdatedAt: "held",
  });

  assert.equal(result, undefined);
  assert.equal(queries[0].sql.trim().toLowerCase(), "begin");
  assert.match(queries[1].sql, /from simulation_tasks/i);
  assert.match(queries[2].sql, /update user_credit_accounts/i);
  assert.equal(queries.at(-1)?.sql.trim().toLowerCase(), "commit");
  assert.equal(queries.some((query) => /insert into credit_ledger/i.test(query.sql)), false);
  assert.equal(queries.some((query) => /update simulation_tasks/i.test(query.sql)), false);
});

test("postgres repository binds transaction queries to an acquired pool client", async () => {
  const txRepo = createPoolTransactionRepository([
    [],
    [{ id: "task_1", user_id: "user_1" }],
    [
      {
        account_user_id: "user_1",
        balance: "7",
        frozen_credits: "3",
        total_redeemed: "10",
        total_captured: "0",
        updated_at: "held",
      },
    ],
    [
      {
        id: "ledger_1",
        user_id: "user_1",
        task_id: "task_1",
        access_code_id: null,
        entry_type: "hold",
        amount: "-3",
        balance_after: "7",
        frozen_after: "3",
        idempotency_key: "hold_1",
        reason: "task_queued",
        metadata: {},
        created_at: "held",
      },
    ],
    [{ id: "task_1" }],
    [],
  ]);

  await txRepo.repo.holdCreditsForTask({
    ledgerEntry: {
      id: "ledger_1",
      userId: "user_1",
      taskId: "task_1",
      entryType: "hold",
      amount: -3,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "hold_1",
      reason: "task_queued",
      metadata: {},
      createdAt: "held",
    },
    amount: 3,
    taskUpdatedAt: "held",
  });

  assert.deepEqual(txRepo.poolQueries, []);
  assert.equal(txRepo.acquiredQueries[0].sql.trim().toLowerCase(), "begin");
  assert.match(txRepo.acquiredQueries[1].sql, /from simulation_tasks/i);
  assert.match(txRepo.acquiredQueries[2].sql, /update user_credit_accounts/i);
  assert.match(txRepo.acquiredQueries[3].sql, /insert into credit_ledger/i);
  assert.match(txRepo.acquiredQueries[4].sql, /update simulation_tasks/i);
  assert.equal(txRepo.acquiredQueries.at(-1)?.sql.trim().toLowerCase(), "commit");
  assert.equal(txRepo.releases, 1);
});

test("postgres repository releases acquired pool client after transaction rollback", async () => {
  const txRepo = createPoolTransactionRepository([
    [],
    [{ id: "task_1", user_id: "user_1" }],
    [
      {
        account_user_id: "user_1",
        balance: "7",
        frozen_credits: "3",
        total_redeemed: "10",
        total_captured: "0",
        updated_at: "held",
      },
    ],
    [
      {
        id: "ledger_1",
        user_id: "user_1",
        task_id: "task_1",
        access_code_id: null,
        entry_type: "hold",
        amount: "-3",
        balance_after: "7",
        frozen_after: "3",
        idempotency_key: "hold_1",
        reason: "task_queued",
        metadata: {},
        created_at: "held",
      },
    ],
    [],
    [],
  ]);

  await assert.rejects(
    txRepo.repo.holdCreditsForTask({
      ledgerEntry: {
        id: "ledger_1",
        userId: "user_1",
        taskId: "task_1",
        entryType: "hold",
        amount: -3,
        balanceAfter: 0,
        frozenAfter: 0,
        idempotencyKey: "hold_1",
        reason: "task_queued",
        metadata: {},
        createdAt: "held",
      },
      amount: 3,
      taskUpdatedAt: "held",
    }),
    /simulation_tasks\.creditHoldLedgerId/,
  );

  assert.deepEqual(txRepo.poolQueries, []);
  assert.equal(txRepo.acquiredQueries[0].sql.trim().toLowerCase(), "begin");
  assert.equal(txRepo.acquiredQueries.at(-1)?.sql.trim().toLowerCase(), "rollback");
  assert.equal(txRepo.releases, 1);
});

test("postgres repository keeps overlapping transactions isolated by acquired client", async () => {
  const poolQueries: QueryLog[] = [];
  const clients: Array<{ id: number; queries: QueryLog[]; releases: number }> = [];
  let releaseFirstTask!: () => void;
  let markFirstTaskSelected!: () => void;
  let pausedFirstTask = false;
  const firstTaskSelected = new Promise<void>((resolve) => {
    markFirstTaskSelected = resolve;
  });
  const firstTaskCanReturn = new Promise<void>((resolve) => {
    releaseFirstTask = resolve;
  });
  const makeClient = (id: number) => ({
    query: async <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => {
      clients[id - 1]!.queries.push({ sql, params });
      if (
        id === 1 &&
        !pausedFirstTask &&
        /from simulation_tasks/i.test(sql) &&
        /for update/i.test(sql)
      ) {
        pausedFirstTask = true;
        markFirstTaskSelected();
        await firstTaskCanReturn;
      }
      return { rows: rowsForHeldCreditQuery(sql, params) as T[] };
    },
    release: () => {
      clients[id - 1]!.releases += 1;
    },
  });
  const repo = new PostgresCommercialRepository({
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      poolQueries.push({ sql, params });
      return { rows: rowsForHeldCreditQuery(sql, params) as T[] };
    },
    connect: async () => {
      const id = clients.length + 1;
      clients.push({ id, queries: [], releases: 0 });
      return makeClient(id);
    },
  });

  const first = repo.holdCreditsForTask({
    ledgerEntry: {
      id: "ledger_1",
      userId: "user_1",
      taskId: "task_1",
      entryType: "hold",
      amount: -3,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "hold_1",
      reason: "task_queued",
      metadata: {},
      createdAt: "held",
    },
    amount: 3,
    taskUpdatedAt: "held",
  });

  await firstTaskSelected;
  const second = await repo.holdCreditsForTask({
    ledgerEntry: {
      id: "ledger_2",
      userId: "user_2",
      taskId: "task_2",
      entryType: "hold",
      amount: -2,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "hold_2",
      reason: "task_queued",
      metadata: {},
      createdAt: "held",
    },
    amount: 2,
    taskUpdatedAt: "held",
  });
  assert.equal(second?.ledger.id, "ledger_2");
  releaseFirstTask();
  const firstResult = await first;
  assert.equal(firstResult?.ledger.id, "ledger_1");

  assert.deepEqual(poolQueries, []);
  assert.equal(clients.length, 2);
  assert.equal(clients[0]?.queries[0]?.sql.trim().toLowerCase(), "begin");
  assert.equal(clients[1]?.queries[0]?.sql.trim().toLowerCase(), "begin");
  assert.equal(clients[0]?.queries.at(-1)?.sql.trim().toLowerCase(), "commit");
  assert.equal(clients[1]?.queries.at(-1)?.sql.trim().toLowerCase(), "commit");
  assert.equal(clients[0]?.releases, 1);
  assert.equal(clients[1]?.releases, 1);
});

test("postgres repository completes holds and refunds captures with locks inside transactions", async () => {
  const captureRepo = createSequentialRowRepository([
    [],
    [
      {
        id: "hold_ledger",
        user_id: "user_1",
        task_id: "task_1",
        amount: "-4",
      },
    ],
    [],
    [
      {
        account_user_id: "user_1",
        balance: "6",
        frozen_credits: "0",
        total_redeemed: "10",
        total_captured: "4",
        updated_at: "captured",
      },
    ],
    [
      {
        id: "capture_ledger",
        user_id: "user_1",
        task_id: "task_1",
        access_code_id: null,
        entry_type: "capture",
        amount: "-4",
        balance_after: "6",
        frozen_after: "0",
        idempotency_key: "capture_1",
        reason: null,
        metadata: { holdLedgerId: "hold_ledger" },
        created_at: "captured",
      },
    ],
    [],
  ]);
  await captureRepo.repo.captureHeldCredits({
    ledgerEntry: {
      id: "capture_ledger",
      userId: "user_1",
      taskId: "task_1",
      entryType: "capture",
      amount: -4,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "capture_1",
      metadata: { holdLedgerId: "wrong_hold", source: "caller" },
      createdAt: "captured",
    },
    holdLedgerId: "hold_ledger",
    amount: 4,
  });

  assert.equal(captureRepo.queries[0].sql.trim().toLowerCase(), "begin");
  assert.match(captureRepo.queries[1].sql, /from credit_ledger/i);
  assert.match(captureRepo.queries[1].sql, /entry_type = 'hold'/i);
  assert.match(captureRepo.queries[1].sql, /for update/i);
  assert.match(captureRepo.queries[2].sql, /metadata ->> 'holdLedgerId' = \$\d+/i);
  assert.match(captureRepo.queries[3].sql, /frozen_credits = frozen_credits \+ \$\d+/i);
  assert.match(captureRepo.queries[3].sql, /total_captured = total_captured \+ \$\d+/i);
  assert.deepEqual(captureRepo.queries[3].params?.slice(1, 4), [0, -4, 4]);
  assert.deepEqual(parsedJsonParam(captureRepo.queries[4].params, 10), {
    holdLedgerId: "hold_ledger",
    source: "caller",
  });
  assert.equal(captureRepo.queries.at(-1)?.sql.trim().toLowerCase(), "commit");

  const refundRepo = createSequentialRowRepository([
    [],
    [
      {
        id: "capture_ledger",
        user_id: "user_1",
        task_id: "task_1",
        amount: "-4",
      },
    ],
    [],
    [
      {
        account_user_id: "user_1",
        balance: "10",
        frozen_credits: "0",
        total_redeemed: "10",
        total_captured: "4",
        updated_at: "refunded",
      },
    ],
    [
      {
        id: "refund_ledger",
        user_id: "user_1",
        task_id: "task_1",
        access_code_id: null,
        entry_type: "refund",
        amount: "4",
        balance_after: "10",
        frozen_after: "0",
        idempotency_key: "refund_1",
        reason: "support_goodwill",
        metadata: { captureLedgerId: "capture_ledger" },
        created_at: "refunded",
      },
    ],
    [{ id: "audit_1" }],
    [],
  ]);
  await refundRepo.repo.refundCapturedCreditsWithAudit({
    ledgerEntry: {
      id: "refund_ledger",
      userId: "user_1",
      taskId: "task_1",
      entryType: "refund",
      amount: 4,
      balanceAfter: 0,
      frozenAfter: 0,
      idempotencyKey: "refund_1",
      reason: "support_goodwill",
      metadata: { captureLedgerId: "wrong_capture", source: "caller" },
      createdAt: "refunded",
    },
    captureLedgerId: "capture_ledger",
    amount: 4,
    auditLog: {
      id: "audit_1",
      actorUserId: "admin_1",
      action: "task_refunded",
      targetType: "task",
      targetId: "task_1",
      metadata: { creditLedgerId: "refund_ledger" },
      createdAt: "refunded",
    },
  });

  assert.equal(refundRepo.queries[0].sql.trim().toLowerCase(), "begin");
  assert.match(refundRepo.queries[1].sql, /from credit_ledger/i);
  assert.match(refundRepo.queries[1].sql, /entry_type = 'capture'/i);
  assert.match(refundRepo.queries[1].sql, /for update/i);
  assert.match(refundRepo.queries[2].sql, /metadata ->> 'captureLedgerId' = \$\d+/i);
  assert.match(refundRepo.queries[3].sql, /balance = balance \+ \$\d+/i);
  assert.match(refundRepo.queries[4].sql, /insert into credit_ledger/i);
  assert.deepEqual(parsedJsonParam(refundRepo.queries[4].params, 10), {
    captureLedgerId: "capture_ledger",
    source: "caller",
  });
  assert.match(refundRepo.queries[5].sql, /insert into admin_audit_logs/i);
  assert.equal(refundRepo.queries.at(-1)?.sql.trim().toLowerCase(), "commit");
});

test("postgres repository does not expose raw credit ledger apply APIs", () => {
  const repo = new PostgresCommercialRepository({
    query: async () => ({ rows: [] }),
  });

  assert.equal("applyCreditLedgerEntry" in repo, false);
  assert.equal("applyCreditLedgerEntryWithAudit" in repo, false);
});

test("postgres repository rolls back transactional credit transitions on later failure", async () => {
  const { repo, queries } = createSequentialRowRepository([
    [],
    [{ id: "task_1", user_id: "user_1" }],
    [
      {
        account_user_id: "user_1",
        balance: "7",
        frozen_credits: "3",
        total_redeemed: "10",
        total_captured: "0",
        updated_at: "held",
      },
    ],
    [
      {
        id: "ledger_1",
        user_id: "user_1",
        task_id: "task_1",
        access_code_id: null,
        entry_type: "hold",
        amount: "-3",
        balance_after: "7",
        frozen_after: "3",
        idempotency_key: "hold_1",
        reason: "task_queued",
        metadata: {},
        created_at: "held",
      },
    ],
    [],
  ]);

  await assert.rejects(
    repo.holdCreditsForTask({
      ledgerEntry: {
        id: "ledger_1",
        userId: "user_1",
        taskId: "task_1",
        entryType: "hold",
        amount: -3,
        balanceAfter: 0,
        frozenAfter: 0,
        idempotencyKey: "hold_1",
        reason: "task_queued",
        metadata: {},
        createdAt: "held",
      },
      amount: 3,
      taskUpdatedAt: "held",
    }),
    /simulation_tasks\.creditHoldLedgerId/,
  );

  assert.equal(queries[0].sql.trim().toLowerCase(), "begin");
  assert.equal(queries.at(-1)?.sql.trim().toLowerCase(), "rollback");
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

test("postgres repository finds active commercial task by user id", async () => {
  const queries: QueryLog[] = [];
  const repo = new PostgresCommercialRepository({
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return {
        rows: [
          {
            id: "task_1",
            user_id: "user_1",
            scenario_type: "life_choice",
            interaction_mode: "enabled",
            provider_mode: "platform",
            status: "running",
            credit_cost: "3",
            credit_hold_ledger_id: null,
            priority: "5",
            queue_weight: "3",
            idempotency_key: "task_key_1",
            input_summary: { brief: "summary" },
            error_code: null,
            queued_at: "queued",
            started_at: "started",
            completed_at: null,
            created_at: "created",
            updated_at: "updated",
          } as T,
        ],
      };
    },
  });

  const result = await repo.findActiveCommercialTaskByUserId("user_1");

  assert.equal(result?.id, "task_1");
  assert.match(queries[0].sql, /from simulation_tasks/i);
  assert.match(queries[0].sql, /status in \('queued', 'running'\)/i);
  assert.match(queries[0].sql, /order by queued_at asc, created_at asc/i);
  assert.deepEqual(queries[0].params, ["user_1"]);
});

test("postgres repository finds commercial task by idempotency key", async () => {
  const queries: QueryLog[] = [];
  const repo = new PostgresCommercialRepository({
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return {
        rows: [
          {
            id: "task_1",
            user_id: "user_1",
            scenario_type: "life_choice",
            interaction_mode: "enabled",
            provider_mode: "platform",
            status: "queued",
            credit_cost: "3",
            credit_hold_ledger_id: null,
            priority: "0",
            queue_weight: "3",
            idempotency_key: "task-key-1",
            input_summary: {},
            error_code: null,
            queued_at: "queued",
            started_at: null,
            completed_at: null,
            created_at: "created",
            updated_at: "updated",
          } as T,
        ],
      };
    },
  });

  const result = await repo.findCommercialTaskByIdempotencyKey("task-key-1");

  assert.equal(result?.id, "task_1");
  assert.match(queries[0].sql, /from simulation_tasks/i);
  assert.match(queries[0].sql, /where idempotency_key = \$1/i);
  assert.deepEqual(queries[0].params, ["task-key-1"]);
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

test("postgres repository rejects unknown admin audit actions before querying", async () => {
  const queries: QueryLog[] = [];
  const repo = new PostgresCommercialRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });

  await assert.rejects(
    repo.appendAdminAuditLog({
      id: "audit_1",
      actorUserId: "admin_1",
      action: "billing_plan_deleted",
      targetType: "billing_plan",
      targetId: "plan_1",
      metadata: {},
      createdAt: "now",
    } as unknown as AdminAuditLogRecord),
    /admin_audit_logs\.action/,
  );
  assert.deepEqual(queries, []);
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

test("postgres repository saves simulation task runs by id", async () => {
  const { repo, queries } = createCapturingRepository();

  await repo.saveSimulationTaskRun({
    id: "run_1",
    taskId: "task_1",
    workerId: "worker_1",
    attempt: 1,
    status: "completed",
    errorCode: "none",
    startedAt: "started",
    completedAt: "completed",
    metadata: { source: "worker" },
  });

  assert.match(queries[0].sql, /insert into simulation_task_runs/i);
  assert.match(queries[0].sql, /on conflict \(id\) do update/i);
  assert.deepEqual(queries[0].params, [
    "run_1",
    "task_1",
    "worker_1",
    1,
    "completed",
    "none",
    "started",
    "completed",
    JSON.stringify({ source: "worker" }),
  ]);
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

test("postgres repository gets access codes by id and lists by batch", async () => {
  const { repo: getRepo, queries: getQueries } = createRowRepository([
    {
      id: "code_1",
      batch_id: "batch_1",
      code_hash: "hash_1",
      code_mask: "TIO-****-****-JK23",
      status: "active",
      credits: "10",
      tier: "pro",
      features: ["deep_mode"],
      expires_at: null,
      redeemed_by_user_id: null,
      redeemed_at: null,
      disabled_at: null,
      created_at: "created",
    },
  ]);

  assert.deepEqual(await getRepo.getAccessCode("code_1"), {
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TIO-****-****-JK23",
    status: "active",
    credits: 10,
    tier: "pro",
    features: ["deep_mode"],
    createdAt: "created",
  });
  assert.match(getQueries[0].sql, /from access_codes/i);
  assert.match(getQueries[0].sql, /where id = \$1/i);
  assert.deepEqual(getQueries[0].params, ["code_1"]);

  const { repo: listRepo, queries: listQueries } = createRowRepository([
    {
      id: "code_1",
      batch_id: "batch_1",
      code_hash: "hash_1",
      code_mask: "TIO-****-****-JK23",
      status: "active",
      credits: "10",
      tier: null,
      features: [],
      expires_at: null,
      redeemed_by_user_id: null,
      redeemed_at: null,
      disabled_at: null,
      created_at: "created",
    },
    {
      id: "code_2",
      batch_id: "batch_1",
      code_hash: "hash_2",
      code_mask: "TIO-****-****-JK24",
      status: "disabled",
      credits: "10",
      tier: null,
      features: [],
      expires_at: null,
      redeemed_by_user_id: null,
      redeemed_at: null,
      disabled_at: "disabled",
      created_at: "later",
    },
  ]);

  assert.deepEqual(
    (await listRepo.listAccessCodesByBatch("batch_1")).map((code) => code.id),
    ["code_1", "code_2"],
  );
  assert.match(listQueries[0].sql, /from access_codes/i);
  assert.match(listQueries[0].sql, /where batch_id = \$1/i);
  assert.deepEqual(listQueries[0].params, ["batch_1"]);
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

test("postgres repository creates access code batch and codes in one CTE query", async () => {
  const { repo, queries } = createCapturingRepository();

  await repo.createAccessCodeBatchWithCodes(
    {
      id: "batch_1",
      createdByUserId: "admin_1",
      name: "Launch",
      source: "campaign",
      codeCount: 2,
      credits: 10,
      tier: "pro",
      features: ["deep_mode"],
      expiresAt: "expires",
      notes: "notes",
      metadata: { channel: "email" },
      createdAt: "created",
    },
    [
      {
        id: "code_1",
        batchId: "batch_1",
        codeHash: "hash_1",
        codeMask: "TEST-****-001",
        status: "active",
        credits: 10,
        tier: "pro",
        features: ["deep_mode"],
        expiresAt: "expires",
        createdAt: "created",
      },
      {
        id: "code_2",
        batchId: "batch_1",
        codeHash: "hash_2",
        codeMask: "TEST-****-002",
        status: "active",
        credits: 10,
        tier: "pro",
        features: ["deep_mode"],
        expiresAt: "expires",
        createdAt: "created",
      },
    ],
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /with inserted_batch as/i);
  assert.match(queries[0].sql, /insert into access_code_batches/i);
  assert.match(queries[0].sql, /insert into access_codes/i);
  assert.match(queries[0].sql, /jsonb_to_recordset/i);
  assert.doesNotMatch(queries[0].sql, /on conflict/i);
  assert.equal(queries[0].params?.[0], "batch_1");
  assert.deepEqual(parsedJsonParam(queries[0].params, 13), [
    {
      id: "code_1",
      batchId: "batch_1",
      codeHash: "hash_1",
      codeMask: "TEST-****-001",
      status: "active",
      credits: 10,
      tier: "pro",
      features: ["deep_mode"],
      expiresAt: "expires",
      redeemedByUserId: null,
      redeemedAt: null,
      disabledAt: null,
      createdAt: "created",
    },
    {
      id: "code_2",
      batchId: "batch_1",
      codeHash: "hash_2",
      codeMask: "TEST-****-002",
      status: "active",
      credits: 10,
      tier: "pro",
      features: ["deep_mode"],
      expiresAt: "expires",
      redeemedByUserId: null,
      redeemedAt: null,
      disabledAt: null,
      createdAt: "created",
    },
  ]);
});

test("postgres repository rejects mismatched access code batch ids before querying", async () => {
  const { repo, queries } = createCapturingRepository();

  await assert.rejects(
    repo.createAccessCodeBatchWithCodes(
      {
        id: "batch_1",
        name: "Launch",
        codeCount: 1,
        credits: 10,
        features: [],
        metadata: {},
        createdAt: "created",
      },
      [
        {
          id: "code_1",
          batchId: "other_batch",
          codeHash: "hash_1",
          codeMask: "TEST-****-001",
          status: "active",
          credits: 10,
          features: [],
          createdAt: "created",
        },
      ],
    ),
    /access_codes\.batchId/,
  );

  assert.equal(queries.length, 0);
});

test("postgres repository rejects batch code count mismatch before querying", async () => {
  const { repo, queries } = createCapturingRepository();

  await assert.rejects(
    repo.createAccessCodeBatchWithCodes(
      {
        id: "batch_1",
        name: "Launch",
        codeCount: 2,
        credits: 10,
        features: [],
        metadata: {},
        createdAt: "created",
      },
      [
        {
          id: "code_1",
          batchId: "batch_1",
          codeHash: "hash_1",
          codeMask: "TEST-****-001",
          status: "active",
          credits: 10,
          features: [],
          createdAt: "created",
        },
      ],
    ),
    /access_code_batches\.codeCount/,
  );

  assert.equal(queries.length, 0);
});

test("postgres repository rejects duplicate incoming code ids and hashes before querying", async () => {
  const duplicateIds = createCapturingRepository();
  await assert.rejects(
    duplicateIds.repo.createAccessCodeBatchWithCodes(
      {
        id: "batch_1",
        name: "Launch",
        codeCount: 2,
        credits: 10,
        features: [],
        metadata: {},
        createdAt: "created",
      },
      [
        {
          id: "code_1",
          batchId: "batch_1",
          codeHash: "hash_1",
          codeMask: "TEST-****-001",
          status: "active",
          credits: 10,
          features: [],
          createdAt: "created",
        },
        {
          id: "code_1",
          batchId: "batch_1",
          codeHash: "hash_2",
          codeMask: "TEST-****-002",
          status: "active",
          credits: 10,
          features: [],
          createdAt: "created",
        },
      ],
    ),
    /access_codes\.id/,
  );
  assert.equal(duplicateIds.queries.length, 0);

  const duplicateHashes = createCapturingRepository();
  await assert.rejects(
    duplicateHashes.repo.createAccessCodeBatchWithCodes(
      {
        id: "batch_1",
        name: "Launch",
        codeCount: 2,
        credits: 10,
        features: [],
        metadata: {},
        createdAt: "created",
      },
      [
        {
          id: "code_1",
          batchId: "batch_1",
          codeHash: "hash_1",
          codeMask: "TEST-****-001",
          status: "active",
          credits: 10,
          features: [],
          createdAt: "created",
        },
        {
          id: "code_2",
          batchId: "batch_1",
          codeHash: "hash_1",
          codeMask: "TEST-****-002",
          status: "active",
          credits: 10,
          features: [],
          createdAt: "created",
        },
      ],
    ),
    /access_codes\.codeHash/,
  );
  assert.equal(duplicateHashes.queries.length, 0);
});

test("postgres repository redeems access code with conditional update and redemption insert", async () => {
  const { repo, queries } = createRowRepository([{ redeemed: true }]);

  const redeemed = await repo.redeemAccessCode(
    {
      id: "code_1",
      batchId: "batch_1",
      codeHash: "hash_1",
      codeMask: "TEST-****-001",
      status: "redeemed",
      credits: 10,
      tier: "pro",
      features: ["deep_mode"],
      redeemedByUserId: "user_1",
      redeemedAt: "stale-code-redeemed-at",
      createdAt: "created",
    },
    {
      id: "redemption_1",
      accessCodeId: "code_1",
      userId: "user_1",
      credits: 10,
      tierGranted: "pro",
      featuresGranted: ["deep_mode"],
      redeemedAt: "redeemed",
      metadata: { source: "code" },
    },
  );

  assert.equal(redeemed, true);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /with updated_code as/i);
  assert.match(queries[0].sql, /update access_codes/i);
  assert.match(queries[0].sql, /set\s+status = 'redeemed'/i);
  assert.match(queries[0].sql, /where id = \$1/i);
  assert.match(queries[0].sql, /status = 'active'/i);
  assert.match(queries[0].sql, /redeemed_at is null/i);
  assert.match(queries[0].sql, /disabled_at is null/i);
  assert.match(queries[0].sql, /expires_at is null\s+or expires_at > \$3/i);
  assert.match(queries[0].sql, /insert into access_code_redemptions/i);
  assert.match(queries[0].sql, /from updated_code/i);
  assert.match(
    queries[0].sql,
    /updated_code\.credits,\s+updated_code\.tier,\s+updated_code\.features/i,
  );
  assert.deepEqual(queries[0].params?.slice(0, 4), [
    "code_1",
    "user_1",
    "redeemed",
    "redemption_1",
  ]);
  assert.equal(queries[0].params?.[2], "redeemed");
  assert.notEqual(queries[0].params?.[2], "stale-code-redeemed-at");
});

test("postgres repository rejects mismatched redemption code id before querying", async () => {
  const { repo, queries } = createCapturingRepository();

  await assert.rejects(
    repo.redeemAccessCode(
      {
        id: "code_1",
        batchId: "batch_1",
        codeHash: "hash_1",
        codeMask: "TEST-****-001",
        status: "redeemed",
        credits: 10,
        features: [],
        redeemedByUserId: "user_1",
        redeemedAt: "redeemed",
        createdAt: "created",
      },
      {
        id: "redemption_1",
        accessCodeId: "code_2",
        userId: "user_1",
        credits: 10,
        featuresGranted: [],
        redeemedAt: "redeemed",
        metadata: {},
      },
    ),
    /access_code_redemptions\.accessCodeId must match access_codes\.id/,
  );

  assert.equal(queries.length, 0);
});

test("postgres repository reports redemption false when conditional update matches nothing", async () => {
  const { repo } = createRowRepository([]);

  assert.equal(
    await repo.redeemAccessCode(
      {
        id: "code_1",
        batchId: "batch_1",
        codeHash: "hash_1",
        codeMask: "TEST-****-001",
        status: "redeemed",
        credits: 10,
        features: [],
        redeemedByUserId: "user_1",
        redeemedAt: "redeemed",
        createdAt: "created",
      },
      {
        id: "redemption_1",
        accessCodeId: "code_1",
        userId: "user_1",
        credits: 10,
        featuresGranted: [],
        redeemedAt: "redeemed",
        metadata: {},
      },
    ),
    false,
  );
});

test("postgres repository disables single access code with audit in one CTE query", async () => {
  const { repo, queries } = createRowRepository([
    {
      id: "code_1",
      batch_id: "batch_1",
      code_hash: "hash_1",
      code_mask: "TEST-****-001",
      status: "disabled",
      credits: 10,
      tier: null,
      features: [],
      expires_at: null,
      redeemed_by_user_id: null,
      redeemed_at: null,
      disabled_at: "disabled",
      created_at: "created",
    },
  ]);

  const result = await repo.disableAccessCodeWithAudit("code_1", "disabled", {
    id: "audit_1",
    actorUserId: "admin_1",
    action: "access_code_disabled",
    targetType: "access_code",
    targetId: "code_1",
    metadata: { reason: "fraud" },
    createdAt: "disabled",
  });

  assert.equal(result?.status, "disabled");
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /with updated_code as/i);
  assert.match(queries[0].sql, /update access_codes/i);
  assert.match(queries[0].sql, /set status = 'disabled'/i);
  assert.match(queries[0].sql, /status = 'active'/i);
  assert.match(queries[0].sql, /redeemed_at is null/i);
  assert.match(queries[0].sql, /disabled_at is null/i);
  assert.match(queries[0].sql, /insert into admin_audit_logs/i);
  assert.deepEqual(queries[0].params?.slice(0, 4), [
    "code_1",
    "disabled",
    "audit_1",
    "admin_1",
  ]);
});

test("postgres repository disables access code batch with audit and actual disabled count", async () => {
  const { repo, queries } = createRowRepository([
    {
      id: "batch_1",
      name: "Launch",
      code_count: 2,
      credits: 10,
      features: [],
      metadata: {},
      disabled_at: "disabled",
      created_at: "created",
      disabled_code_count: "1",
    },
  ]);

  const result = await repo.disableAccessCodeBatchWithAudit("batch_1", "disabled", {
    id: "audit_1",
    actorUserId: "admin_1",
    action: "access_code_batch_disabled",
    targetType: "access_code_batch",
    targetId: "batch_1",
    metadata: { reason: "ended" },
    createdAt: "disabled",
  });

  assert.equal(result?.disabledCodeCount, 1);
  assert.equal(result?.batch.disabledAt, "disabled");
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /with updated_batch as/i);
  assert.match(queries[0].sql, /updated_codes as/i);
  assert.match(queries[0].sql, /update access_codes/i);
  assert.match(queries[0].sql, /status = 'active'/i);
  assert.match(queries[0].sql, /redeemed_at is null/i);
  assert.match(queries[0].sql, /disabled_at is null/i);
  assert.match(queries[0].sql, /insert into admin_audit_logs/i);
  assert.match(queries[0].sql, /disabledCodeCount/i);
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
