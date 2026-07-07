import assert from "node:assert/strict";
import test from "node:test";

import { AccessCodeService } from "./access-code-service.js";
import { AdminAuditService } from "./audit-service.js";
import {
  CommercialAdminService,
  CommercialAdminServiceError,
} from "./admin-service.js";
import { CreditService } from "./credit-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import type {
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  UserCreditAccountRecord,
} from "./types.js";

const ACCESS_CODE_PEPPER = "test-pepper";
const NOW_VALUES = [
  "2026-07-07T00:00:00.000Z",
  "2026-07-07T00:01:00.000Z",
  "2026-07-07T00:02:00.000Z",
  "2026-07-07T00:03:00.000Z",
  "2026-07-07T00:04:00.000Z",
  "2026-07-07T00:05:00.000Z",
  "2026-07-07T00:06:00.000Z",
  "2026-07-07T00:07:00.000Z",
  "2026-07-07T00:08:00.000Z",
];
const RAW_CODES = [
  "TIO-ABCD-EFGH-JK23",
  "TIO-ABCD-EFGH-JK24",
  "TIO-ABCD-EFGH-JK25",
];

test("overview aggregates commercial operating metrics for the admin dashboard", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { tier: "pro" }),
    makeCreditAccount("user_1", {
      balance: 12,
      frozenCredits: 1,
      totalRedeemed: 20,
      totalCaptured: 3,
    }),
  );
  await repo.createUserWithCreditAccount(
    makeUser("user_2", { status: "disabled" }),
    makeCreditAccount("user_2", {
      balance: 4,
      totalRedeemed: 8,
      totalCaptured: 2,
    }),
  );
  await repo.saveAccessCodeBatch({
    id: "batch_1",
    createdByUserId: "admin_1",
    name: "Launch",
    codeCount: 2,
    credits: 10,
    features: ["priority_queue"],
    metadata: {},
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TIO-****-****-0001",
    status: "redeemed",
    credits: 10,
    features: ["priority_queue"],
    redeemedByUserId: "user_1",
    redeemedAt: "2026-07-07T00:10:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_2",
    batchId: "batch_1",
    codeHash: "hash_2",
    codeMask: "TIO-****-****-0002",
    status: "active",
    credits: 10,
    features: ["priority_queue"],
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveCommercialTask(makeTask({ id: "task_completed", status: "completed", creditCost: 3, userId: "user_1" }));
  await repo.saveCommercialTask(makeTask({ id: "task_failed", status: "failed", creditCost: 3, userId: "user_1" }));
  await repo.saveCommercialTask(makeTask({ id: "task_cancelled", status: "cancelled", creditCost: 2, userId: "user_2" }));
  await repo.saveCommercialTask(makeTask({ id: "task_queued", status: "queued", creditCost: 3, userId: "user_2", queuedAt: "2026-07-07T00:20:00.000Z" }));
  await repo.appendCreditLedgerEntry({
    id: "capture_1",
    userId: "user_1",
    taskId: "task_completed",
    entryType: "capture",
    amount: -3,
    balanceAfter: 9,
    frozenAfter: 0,
    idempotencyKey: "capture_1",
    createdAt: "2026-07-07T00:30:00.000Z",
  });
  await repo.appendCreditLedgerEntry({
    id: "capture_2",
    userId: "user_2",
    taskId: "task_cancelled",
    entryType: "capture",
    amount: -2,
    balanceAfter: 4,
    frozenAfter: 0,
    idempotencyKey: "capture_2",
    createdAt: "2026-07-07T00:31:00.000Z",
  });
  await repo.appendSimulationStepRunCost({
    id: "step_1",
    taskId: "task_completed",
    stepName: "simulate",
    estimatedCost: 0.42,
    status: "completed",
    startedAt: "2026-07-07T00:25:00.000Z",
  });
  await repo.appendSimulationStepRunCost({
    id: "step_2",
    taskId: "task_failed",
    stepName: "simulate",
    estimatedCost: 0.18,
    status: "failed",
    startedAt: "2026-07-07T00:26:00.000Z",
  });

  const overview = await service.getOverview();

  assert.deepEqual(overview.users, {
    total: 2,
    active: 1,
    disabled: 1,
    redeemed: 1,
  });
  assert.deepEqual(overview.tasks.byStatus, {
    queued: 1,
    running: 0,
    completed: 1,
    failed: 1,
    cancelled: 1,
    refunded: 0,
  });
  assert.equal(overview.tasks.total, 4);
  assert.equal(overview.tasks.completionRate, 0.25);
  assert.equal(overview.tasks.failureRate, 0.25);
  assert.equal(overview.credits.totalBalance, 16);
  assert.equal(overview.credits.totalFrozen, 1);
  assert.equal(overview.credits.totalRedeemed, 28);
  assert.equal(overview.credits.consumed, 5);
  assert.equal(overview.costs.estimatedTotal, 0.6);
  assert.equal(overview.queue.backlog, 1);
  assert.equal(overview.queue.oldestQueuedAt, "2026-07-07T00:20:00.000Z");
  assert.equal(overview.accessCodes.total, 2);
  assert.equal(overview.accessCodes.redeemed, 1);
});

test("lists users with account and task summaries without leaking password hashes", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", {
      email: "alice@example.test",
      passwordHash: "secret-hash",
      tier: "pro",
      features: ["deep_mode"],
    }),
    makeCreditAccount("user_1", { balance: 10, totalRedeemed: 20 }),
  );
  await repo.createUserWithCreditAccount(
    makeUser("user_2", { email: "bob@example.test", status: "disabled" }),
    makeCreditAccount("user_2", { balance: 0 }),
  );
  await repo.saveCommercialTask(makeTask({ id: "task_1", userId: "user_1", status: "completed" }));
  await repo.saveCommercialTask(makeTask({ id: "task_2", userId: "user_1", status: "failed" }));

  const users = await service.listUsers({ search: "alice" });

  assert.equal(users.total, 1);
  assert.equal(users.items[0]?.id, "user_1");
  assert.equal(users.items[0]?.email, "alice@example.test");
  assert.deepEqual(users.items[0]?.creditAccount, {
    balance: 10,
    frozenCredits: 0,
    totalRedeemed: 20,
    totalCaptured: 0,
    updatedAt: "2026-07-07T00:00:00.000Z",
  });
  assert.deepEqual(users.items[0]?.taskSummary, {
    total: 2,
    completed: 1,
    failed: 1,
    active: 0,
  });
  assert.equal(JSON.stringify(users).includes("secret-hash"), false);
  assert.equal("passwordHash" in users.items[0]!, false);
});

test("creates access-code batches through the code service and audits creation while returning raw codes", async () => {
  const { repo, service } = createScenario();

  const result = await service.createAccessCodeBatch({
    actorUserId: "admin_1",
    name: "Founding customers",
    source: "sales",
    codeCount: 2,
    credits: 25,
    tier: "pro",
    features: ["priority_queue", "deep_mode"],
    expiresAt: "2026-08-01T00:00:00.000Z",
    notes: "Q3 launch",
    metadata: { channel: "crm" },
    requestContext: {
      ipHash: "ip_hash_1",
      userAgent: "AdminConsole/1.0",
    },
  });

  assert.equal(result.batch.id, "batch_1");
  assert.equal(result.batch.createdByUserId, "admin_1");
  assert.deepEqual(
    result.codes.map((code) => code.rawCode),
    RAW_CODES.slice(0, 2),
  );
  assert.equal(JSON.stringify(await repo.getAccessCode("access_code_1")).includes(RAW_CODES[0]), false);
  assert.equal(result.codes[0]?.codeMask, "TIO-****-****-JK23");
  assert.equal("codeHash" in result.codes[0]!, false);
  assert.deepEqual(await repo.listAdminAuditLogs(), [
    {
      id: "admin_audit_log_1",
      actorUserId: "admin_1",
      action: "access_code_batch_created",
      targetType: "access_code_batch",
      targetId: "batch_1",
      metadata: {
        name: "Founding customers",
        source: "sales",
        codeCount: 2,
        credits: 25,
        tier: "pro",
        features: ["priority_queue", "deep_mode"],
        expiresAt: "2026-08-01T00:00:00.000Z",
        notes: "Q3 launch",
        channel: "crm",
      },
      ipHash: "ip_hash_1",
      userAgent: "AdminConsole/1.0",
      createdAt: "2026-07-07T00:01:00.000Z",
    },
  ]);
});

test("disables access-code batches through the code service and preserves audit metadata", async () => {
  const { repo, service } = createScenario();
  const created = await service.createAccessCodeBatch({
    actorUserId: "admin_1",
    name: "Temporary campaign",
    codeCount: 2,
    credits: 5,
    features: [],
  });

  const disabled = await service.disableAccessCodeBatch({
    actorUserId: "admin_2",
    batchId: created.batch.id,
    reason: "campaign ended",
  });

  assert.equal(disabled.batch.disabledAt, "2026-07-07T00:02:00.000Z");
  assert.equal(disabled.disabledCodeCount, 2);
  assert.deepEqual(
    (await repo.listAdminAuditLogs()).map((log) => log.action),
    ["access_code_batch_created", "access_code_batch_disabled"],
  );
  assert.deepEqual((await repo.listAdminAuditLogs())[1]?.metadata, {
    reason: "campaign ended",
    disabledCodeCount: 2,
  });
});

test("adjusts user credits through credit service and writes a single admin audit log", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1"),
    makeCreditAccount("user_1", { balance: 10, totalRedeemed: 10 }),
  );

  const adjusted = await service.adjustUserCredits({
    actorUserId: "admin_1",
    userId: "user_1",
    amount: -3,
    reason: "manual_correction",
    idempotencyKey: "adjust_user_1",
    metadata: { ticketId: "T-123" },
  });

  assert.equal(adjusted.account.balance, 7);
  assert.equal(adjusted.ledger.entryType, "adjustment");
  assert.deepEqual(await repo.listAdminAuditLogs(), [
    {
      id: "admin_audit_log_1",
      actorUserId: "admin_1",
      action: "credits_adjusted",
      targetType: "user",
      targetId: "user_1",
      metadata: {
        amount: -3,
        creditLedgerId: adjusted.ledger.id,
        reason: "manual_correction",
        ticketId: "T-123",
      },
      createdAt: "2026-07-07T00:00:00.000Z",
    },
  ]);
});

test("disables and restores users with audit logs and revokes sessions on disable", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1"),
    makeCreditAccount("user_1"),
  );
  await repo.saveSession({
    id: "session_1",
    userId: "user_1",
    tokenHash: "token_hash_1",
    expiresAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });

  const disabled = await service.disableUser({
    actorUserId: "admin_1",
    userId: "user_1",
    reason: "chargeback_risk",
  });
  const restored = await service.restoreUser({
    actorUserId: "admin_2",
    userId: "user_1",
    reason: "risk_cleared",
  });

  assert.equal(disabled.status, "disabled");
  assert.equal(restored.status, "active");
  assert.equal((await repo.findSessionByTokenHash("token_hash_1"))?.revokedAt, "2026-07-07T00:00:00.000Z");
  assert.deepEqual(
    (await repo.listAdminAuditLogs()).map((log) => ({
      action: log.action,
      actorUserId: log.actorUserId,
      targetId: log.targetId,
      metadata: log.metadata,
    })),
    [
      {
        action: "user_disabled",
        actorUserId: "admin_1",
        targetId: "user_1",
        metadata: { reason: "chargeback_risk", previousStatus: "active" },
      },
      {
        action: "user_restored",
        actorUserId: "admin_2",
        targetId: "user_1",
        metadata: { reason: "risk_cleared", previousStatus: "disabled" },
      },
    ],
  );
});

test("task detail can include a sensitive report summary and audits that access", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1"),
    makeCreditAccount("user_1"),
  );
  await repo.saveCommercialTask(makeTask({ id: "task_1", status: "completed" }));
  await repo.saveCommercialReport({
    id: "report_1",
    taskId: "task_1",
    userId: "user_1",
    publicReport: { id: "public_report_1" } as never,
    deepReport: {
      rawPrompt: "do not leak this",
      recommendation: "sensitive details",
    },
    unlocked: true,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  });

  const detail = await service.getTaskDetail({
    actorUserId: "admin_1",
    taskId: "task_1",
    includeSensitiveReportSummary: true,
  });

  assert.equal(detail.task.id, "task_1");
  assert.equal(detail.report?.id, "report_1");
  assert.deepEqual(detail.sensitiveReportSummary, {
    reportId: "report_1",
    unlocked: true,
    hasPublicReport: true,
    hasDeepReport: true,
    deepReportTopLevelKeys: ["rawPrompt", "recommendation"],
    deepReportEstimatedBytes: JSON.stringify({
      rawPrompt: "do not leak this",
      recommendation: "sensitive details",
    }).length,
  });
  assert.equal(JSON.stringify(detail).includes("do not leak this"), false);
  assert.deepEqual(await repo.listAdminAuditLogs(), [
    {
      id: "admin_audit_log_1",
      actorUserId: "admin_1",
      action: "sensitive_report_viewed",
      targetType: "report",
      targetId: "report_1",
      metadata: {
        taskId: "task_1",
        userId: "user_1",
        summaryOnly: true,
      },
      createdAt: "2026-07-07T00:00:00.000Z",
    },
  ]);
});

test("user detail combines profile, account, tasks, ledger, and redemptions without secrets", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { passwordHash: "secret-hash" }),
    makeCreditAccount("user_1", { balance: 10 }),
  );
  await repo.saveCommercialTask(makeTask({ id: "task_1", userId: "user_1", status: "completed" }));
  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    entryType: "adjustment",
    amount: 10,
    balanceAfter: 10,
    idempotencyKey: "adjust_1",
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TIO-****-****-0001",
    status: "redeemed",
    credits: 10,
    features: [],
    redeemedByUserId: "user_1",
    redeemedAt: "2026-07-07T00:10:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });

  const detail = await service.getUserDetail("user_1");

  assert.equal(detail.user.id, "user_1");
  assert.equal(detail.creditAccount?.balance, 10);
  assert.equal(detail.tasks[0]?.id, "task_1");
  assert.equal(detail.creditLedger[0]?.id, "ledger_1");
  assert.deepEqual(detail.redemptions, [
    {
      accessCodeId: "code_1",
      batchId: "batch_1",
      codeMask: "TIO-****-****-0001",
      credits: 10,
      redeemedAt: "2026-07-07T00:10:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(detail).includes("secret-hash"), false);
  assert.equal(JSON.stringify(detail).includes("hash_1"), false);
});

test("admin service reports missing users and tasks as domain errors", async () => {
  const { service } = createScenario();

  await assert.rejects(
    service.getUserDetail("missing_user"),
    (error) => hasAdminCode(error, "user_not_found"),
  );
  await assert.rejects(
    service.getTaskDetail({
      actorUserId: "admin_1",
      taskId: "missing_task",
      includeSensitiveReportSummary: true,
    }),
    (error) => hasAdminCode(error, "task_not_found"),
  );
});

function createScenario(): {
  repo: InMemoryCommercialRepository;
  service: CommercialAdminService;
} {
  const repo = new InMemoryCommercialRepository();
  const ids = new TestIds();
  const clock = new TestClock(NOW_VALUES);
  const accessCodeService = new AccessCodeService({
    repository: repo,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId: (prefix = "id") => ids.create(prefix),
    generateAccessCode: () => RAW_CODES[ids.nextCodeIndex()]!,
    now: () => clock.next(),
  });
  const creditService = new CreditService({
    repository: repo,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId: (prefix = "id") => ids.create(prefix),
    now: () => clock.next(),
  });
  const auditService = new AdminAuditService({
    repository: repo,
    createId: (prefix = "id") => ids.create(prefix),
    now: () => clock.next(),
  });
  return {
    repo,
    service: new CommercialAdminService({
      repository: repo,
      accessCodeService,
      creditService,
      auditService,
      now: () => clock.next(),
    }),
  };
}

function makeUser(
  id: string,
  overrides: Partial<CommercialUserRecord> = {},
): CommercialUserRecord {
  const email = overrides.email ?? `${id}@example.test`;
  return {
    id,
    email,
    emailNormalized: email.trim().toLowerCase(),
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeCreditAccount(
  userId: string,
  overrides: Partial<UserCreditAccountRecord> = {},
): UserCreditAccountRecord {
  return {
    userId,
    balance: 0,
    frozenCredits: 0,
    totalRedeemed: 0,
    totalCaptured: 0,
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeTask(
  overrides: Partial<CommercialSimulationTaskRecord> = {},
): CommercialSimulationTaskRecord {
  return {
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    queuedAt: "2026-07-07T00:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function hasAdminCode(
  error: unknown,
  code: CommercialAdminServiceError["code"],
): boolean {
  return error instanceof CommercialAdminServiceError && error.code === code;
}

class TestIds {
  private readonly counters = new Map<string, number>();
  private codeIndex = 0;

  create(prefix = "id"): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next}`;
  }

  nextCodeIndex(): number {
    const current = this.codeIndex;
    this.codeIndex += 1;
    return current;
  }
}

class TestClock {
  private index = 0;

  constructor(private readonly values: string[]) {}

  next(): string {
    const value = this.values[Math.min(this.index, this.values.length - 1)]!;
    this.index += 1;
    return value;
  }
}
