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
import { WorkerMonitoringService } from "./worker-monitoring.js";
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

test("overview includes worker monitoring queue summary", async () => {
  const { repo, service } = createScenario({ maxActiveWeight: 6 });
  await repo.saveCommercialTask(makeTask({
    id: "queued_1",
    status: "queued",
    queuedAt: "2026-07-07T00:10:00.000Z",
    queueWeight: 3,
  }));
  await repo.saveCommercialTask(makeTask({
    id: "running_stuck",
    status: "running",
    startedAt: "2026-07-07T00:00:00.000Z",
    queueWeight: 3,
  }));
  await repo.saveCommercialTask(makeTask({
    id: "retrying_1",
    status: "queued",
    errorCode: "provider_timeout",
    queuedAt: "2026-07-07T00:12:00.000Z",
    queueWeight: 1,
  }));
  await repo.saveWorkerHeartbeat({
    workerId: "worker_1",
    activeWeight: 3,
    currentTaskId: "running_stuck",
    lastHeartbeatAt: "2026-07-07T00:29:00.000Z",
  });

  const overview = await service.getOverview();

  assert.deepEqual(overview.queue, {
    backlog: 3,
    oldestQueuedAt: "2026-07-07T00:10:00.000Z",
    queued: 2,
    running: 1,
    retrying: 1,
    stuck: 1,
    activeWeight: 3,
    maxWeight: 6,
    workers: [
      {
        workerId: "worker_1",
        activeWeight: 3,
        currentTaskId: "running_stuck",
        lastHeartbeatAt: "2026-07-07T00:29:00.000Z",
      },
    ],
  });
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

test("admin creates users with explicit role, tier, features, initial credits, and audit trail", async () => {
  const { repo, service } = createScenario();

  const created = await service.createUser({
    actorUserId: "admin_1",
    email: " New.Admin@Example.TEST ",
    password: "temporary-password",
    role: "admin",
    tier: "business",
    features: ["admin_ops", "priority_queue"],
    initialCredits: 12,
    reason: "operator bootstrap",
  });

  const stored = await repo.findUserByEmail("new.admin@example.test");
  assert.equal(created.email, "New.Admin@Example.TEST");
  assert.equal(created.emailNormalized, "new.admin@example.test");
  assert.equal(created.role, "admin");
  assert.equal(created.tier, "business");
  assert.deepEqual(created.features, ["admin_ops", "priority_queue"]);
  assert.equal("passwordHash" in created, false);
  assert.equal(stored?.passwordHash, "hashed:temporary-password");
  assert.equal((await repo.getCreditAccount(created.id))?.balance, 12);
  assert.deepEqual(
    (await repo.listAdminAuditLogs()).map((log) => ({
      action: log.action,
      targetId: log.targetId,
      metadata: log.metadata,
    })),
    [
      {
        action: "user_created",
        targetId: created.id,
        metadata: {
          email: "New.Admin@Example.TEST",
          role: "admin",
          tier: "business",
          features: ["admin_ops", "priority_queue"],
          initialCredits: 12,
          reason: "operator bootstrap",
        },
      },
    ],
  );
});

test("admin updates user identity, permissions, tier, and features", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { email: "old@example.test" }),
    makeCreditAccount("user_1"),
  );

  const updated = await service.updateUser({
    actorUserId: "admin_1",
    userId: "user_1",
    email: "new@example.test",
    role: "admin",
    tier: "pro",
    features: ["deep_mode", "custom_model_provider"],
    reason: "contract upgrade",
  });

  assert.equal(updated.email, "new@example.test");
  assert.equal(updated.emailNormalized, "new@example.test");
  assert.equal(updated.role, "admin");
  assert.equal(updated.tier, "pro");
  assert.deepEqual(updated.features, ["deep_mode", "custom_model_provider"]);
  assert.equal((await repo.getUser("user_1"))?.emailNormalized, "new@example.test");
  assert.deepEqual((await repo.listAdminAuditLogs())[0]?.metadata, {
    reason: "contract upgrade",
    previous: {
      email: "old@example.test",
      role: "user",
      tier: "basic",
      features: [],
    },
    next: {
      email: "new@example.test",
      role: "admin",
      tier: "pro",
      features: ["deep_mode", "custom_model_provider"],
    },
  });
});

test("admin soft-deletes users and revokes active sessions", async () => {
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

  const deleted = await service.deleteUser({
    actorUserId: "admin_1",
    userId: "user_1",
    reason: "privacy request",
  });

  assert.equal(deleted.status, "deleted");
  assert.equal((await repo.getUser("user_1"))?.status, "deleted");
  assert.equal((await repo.findSessionByTokenHash("token_hash_1"))?.revokedAt, "2026-07-07T00:00:00.000Z");
  assert.equal((await repo.listAdminAuditLogs())[0]?.action, "user_deleted");
});

test("admin batch user operations update selected users and audit each target", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(makeUser("user_1"), makeCreditAccount("user_1"));
  await repo.createUserWithCreditAccount(makeUser("user_2"), makeCreditAccount("user_2"));

  const result = await service.bulkUpdateUsers({
    actorUserId: "admin_1",
    userIds: ["user_1", "user_2"],
    operation: "disable",
    reason: "risk review",
  });

  assert.deepEqual(result.updatedUserIds, ["user_1", "user_2"]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual((await repo.listUsers()).map((user) => [user.id, user.status]), [
    ["user_1", "disabled"],
    ["user_2", "disabled"],
  ]);
  assert.deepEqual(
    (await repo.listAdminAuditLogs()).map((log) => ({
      action: log.action,
      targetId: log.targetId,
      metadata: log.metadata,
    })),
    [
      {
        action: "user_disabled",
        targetId: "user_1",
        metadata: { reason: "risk review", previousStatus: "active" },
      },
      {
        action: "user_disabled",
        targetId: "user_2",
        metadata: { reason: "risk review", previousStatus: "active" },
      },
    ],
  );
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

test("lists access-code batches with status counts without exposing code hashes", async () => {
  const { repo, service } = createScenario();
  await repo.saveAccessCodeBatch({
    id: "batch_1",
    createdByUserId: "admin_1",
    name: "Founding customers",
    source: "sales-led",
    codeCount: 4,
    credits: 25,
    tier: "pro",
    features: ["priority_queue"],
    expiresAt: "2026-08-01T00:00:00.000Z",
    notes: "Q3 launch",
    metadata: { campaignId: "CRM-1" },
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_active",
    batchId: "batch_1",
    codeHash: "hash_active",
    codeMask: "TIO-****-****-0001",
    status: "active",
    credits: 25,
    features: ["priority_queue"],
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_redeemed",
    batchId: "batch_1",
    codeHash: "hash_redeemed",
    codeMask: "TIO-****-****-0002",
    status: "redeemed",
    credits: 25,
    features: ["priority_queue"],
    redeemedByUserId: "user_1",
    redeemedAt: "2026-07-07T00:10:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_disabled",
    batchId: "batch_1",
    codeHash: "hash_disabled",
    codeMask: "TIO-****-****-0003",
    status: "disabled",
    credits: 25,
    features: ["priority_queue"],
    disabledAt: "2026-07-07T00:11:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_expired",
    batchId: "batch_1",
    codeHash: "hash_expired",
    codeMask: "TIO-****-****-0004",
    status: "expired",
    credits: 25,
    features: ["priority_queue"],
    expiresAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
  });

  const batches = await service.listAccessCodeBatches();

  assert.deepEqual(batches, [
    {
      id: "batch_1",
      name: "Founding customers",
      source: "sales-led",
      codeCount: 4,
      credits: 25,
      tier: "pro",
      features: ["priority_queue"],
      expiresAt: "2026-08-01T00:00:00.000Z",
      notes: "Q3 launch",
      createdAt: "2026-07-07T00:00:00.000Z",
      status: "active",
      redeemedCount: 1,
      activeCount: 1,
      disabledCount: 1,
      expiredCount: 1,
      redemptionRate: 0.25,
    },
  ]);
  assert.equal(JSON.stringify(batches).includes("hash_"), false);
});

test("lists individual access codes with batch and redemption context only", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { email: "redeemer@example.test" }),
    makeCreditAccount("user_1"),
  );
  await repo.saveAccessCodeBatch({
    id: "batch_1",
    name: "Launch",
    codeCount: 2,
    credits: 10,
    features: ["priority_queue"],
    metadata: {},
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_active",
    batchId: "batch_1",
    codeHash: "hash_active",
    codeMask: "TIO-****-****-0001",
    status: "active",
    credits: 10,
    features: ["priority_queue"],
    createdAt: "2026-07-07T00:01:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_redeemed",
    batchId: "batch_1",
    codeHash: "hash_redeemed",
    codeMask: "TIO-****-****-0002",
    status: "redeemed",
    credits: 10,
    features: ["priority_queue"],
    redeemedByUserId: "user_1",
    redeemedAt: "2026-07-07T00:02:00.000Z",
    createdAt: "2026-07-07T00:02:00.000Z",
  });

  const result = await service.listAccessCodes();

  assert.deepEqual(result.items.map((code) => ({
    id: code.id,
    batchName: code.batchName,
    codeMask: code.codeMask,
    redeemedByUserEmail: code.redeemedByUserEmail,
  })), [
    {
      id: "code_redeemed",
      batchName: "Launch",
      codeMask: "TIO-****-****-0002",
      redeemedByUserEmail: "redeemer@example.test",
    },
    {
      id: "code_active",
      batchName: "Launch",
      codeMask: "TIO-****-****-0001",
      redeemedByUserEmail: undefined,
    },
  ]);
  assert.equal(JSON.stringify(result).includes("hash_"), false);
});

test("admin disables and deletes individual unredeemed access codes with audits", async () => {
  const { repo, service } = createScenario();
  await repo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TIO-****-****-0001",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_2",
    batchId: "batch_1",
    codeHash: "hash_2",
    codeMask: "TIO-****-****-0002",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "2026-07-07T00:00:00.000Z",
  });

  const disabled = await service.disableAccessCode({
    actorUserId: "admin_1",
    accessCodeId: "code_1",
    reason: "fraud risk",
  });
  const deleted = await service.deleteAccessCode({
    actorUserId: "admin_1",
    accessCodeId: "code_2",
    reason: "generated by mistake",
  });

  assert.equal(disabled.status, "disabled");
  assert.equal(deleted.deletedAt, "2026-07-07T00:01:00.000Z");
  assert.equal((await repo.getAccessCode("code_1"))?.status, "disabled");
  assert.equal((await repo.getAccessCode("code_2"))?.deletedAt, "2026-07-07T00:01:00.000Z");
  assert.deepEqual(
    (await repo.listAdminAuditLogs()).map((log) => ({
      action: log.action,
      targetId: log.targetId,
      metadata: log.metadata,
    })),
    [
      {
        action: "access_code_disabled",
        targetId: "code_1",
        metadata: { reason: "fraud risk" },
      },
      {
        action: "access_code_deleted",
        targetId: "code_2",
        metadata: { reason: "generated by mistake" },
      },
    ],
  );
});

test("admin batch user operations update role, tier, features, and delete users", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(makeUser("user_1"), makeCreditAccount("user_1"));
  await repo.createUserWithCreditAccount(makeUser("user_2"), makeCreditAccount("user_2"));

  const entitlement = await service.bulkUpdateUsers({
    actorUserId: "admin_1",
    userIds: ["user_1", "user_2"],
    operation: "update_entitlements",
    role: "admin",
    tier: "business",
    features: ["admin_ops", "priority_queue"],
    reason: "ops migration",
  });
  const deleted = await service.bulkUpdateUsers({
    actorUserId: "admin_1",
    userIds: ["user_2"],
    operation: "delete",
    reason: "offboarded",
  });

  assert.deepEqual(entitlement.updatedUserIds, ["user_1", "user_2"]);
  assert.deepEqual(deleted.updatedUserIds, ["user_2"]);
  const users = await repo.listUsers();
  assert.equal(users.find((user) => user.id === "user_1")?.role, "admin");
  assert.equal(users.find((user) => user.id === "user_1")?.tier, "business");
  assert.deepEqual(users.find((user) => user.id === "user_1")?.features, [
    "admin_ops",
    "priority_queue",
  ]);
  assert.equal(users.find((user) => user.id === "user_2")?.status, "deleted");
});

test("admin access-code bulk operations skip redeemed codes", async () => {
  const { repo, service } = createScenario();
  await repo.saveAccessCode({
    id: "code_active",
    batchId: "batch_1",
    codeHash: "hash_active",
    codeMask: "TIO-****-****-0001",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "2026-07-07T00:00:00.000Z",
  });
  await repo.saveAccessCode({
    id: "code_redeemed",
    batchId: "batch_1",
    codeHash: "hash_redeemed",
    codeMask: "TIO-****-****-0002",
    status: "redeemed",
    credits: 10,
    features: [],
    redeemedByUserId: "user_1",
    redeemedAt: "2026-07-07T00:02:00.000Z",
    createdAt: "2026-07-07T00:02:00.000Z",
  });

  const result = await service.bulkAccessCodeOperation({
    actorUserId: "admin_1",
    accessCodeIds: ["code_active", "code_redeemed", "missing"],
    operation: "delete",
    reason: "campaign cleanup",
  });

  assert.deepEqual(result.updatedCodeIds, ["code_active"]);
  assert.deepEqual(result.skipped, [
    { id: "code_redeemed", reason: "redeemed" },
    { id: "missing", reason: "not_found" },
  ]);
  assert.equal((await repo.getAccessCode("code_active"))?.deletedAt, "2026-07-07T00:00:00.000Z");
  assert.equal((await repo.getAccessCode("code_redeemed"))?.deletedAt, undefined);
  assert.equal((await repo.listAdminAuditLogs())[0]?.action, "access_codes_bulk_deleted");
});

test("lists admin tasks with user emails, timeline, and safe step costs", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { email: "alice@example.test" }),
    makeCreditAccount("user_1"),
  );
  await repo.saveCommercialTask(makeTask({
    id: "task_1",
    userId: "user_1",
    status: "failed",
    creditCost: 3,
    queuedAt: "2026-07-07T00:00:00.000Z",
    startedAt: "2026-07-07T00:00:04.000Z",
    completedAt: "2026-07-07T00:01:40.000Z",
    errorCode: "model_timeout",
  }));
  await repo.appendSimulationTaskRun({
    id: "run_1",
    taskId: "task_1",
    workerId: "worker_a",
    status: "failed",
    errorCode: "model_timeout",
    startedAt: "2026-07-07T00:00:04.000Z",
    completedAt: "2026-07-07T00:01:40.000Z",
  });
  await repo.appendSimulationStepRunCost({
    id: "cost_1",
    taskRunId: "run_1",
    taskId: "task_1",
    stepName: "generate_report",
    provider: "openai",
    modelId: "gpt-5-mini",
    promptTokens: 1400,
    completionTokens: 900,
    totalTokens: 2300,
    estimatedCost: 0.42,
    status: "failed",
    errorCode: "model_timeout",
    startedAt: "2026-07-07T00:00:10.000Z",
    metadata: { rawPrompt: "do not expose" },
  });

  const tasks = await service.listTasks();

  assert.deepEqual(tasks, [
    {
      id: "task_1",
      userEmail: "alice@example.test",
      scenarioType: "life_choice",
      interactionMode: "enabled",
      providerMode: "platform",
      status: "failed",
      queueWaitMs: 4000,
      runDurationMs: 96000,
      credits: 3,
      promptTokens: 1400,
      completionTokens: 900,
      estimatedCost: 0.42,
      errorCode: "model_timeout",
      workerId: "worker_a",
      createdAt: "2026-07-07T00:00:00.000Z",
      timeline: [
        { label: "Queued", at: "2026-07-07T00:00:00.000Z" },
        { label: "Running", at: "2026-07-07T00:00:04.000Z" },
        { label: "Failed", at: "2026-07-07T00:01:40.000Z" },
      ],
      stepCosts: [
        {
          stepName: "generate_report",
          provider: "openai",
          modelId: "gpt-5-mini",
          tokens: 2300,
          estimatedCost: 0.42,
          status: "failed",
        },
      ],
    },
  ]);
  assert.equal(JSON.stringify(tasks).includes("rawPrompt"), false);
});

test("summarizes costs by provider, model, step, task, and outcome", async () => {
  const { repo, service } = createScenario();
  await repo.saveCommercialTask(makeTask({ id: "task_1", status: "completed" }));
  await repo.saveCommercialTask(makeTask({ id: "task_2", status: "failed" }));
  await repo.appendSimulationStepRunCost({
    id: "cost_1",
    taskId: "task_1",
    stepName: "generate_report",
    provider: "openai",
    modelId: "gpt-5-mini",
    totalTokens: 1000,
    estimatedCost: 0.3,
    status: "completed",
    startedAt: "2026-07-07T00:10:00.000Z",
  });
  await repo.appendSimulationStepRunCost({
    id: "cost_2",
    taskId: "task_2",
    stepName: "validate_output",
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    promptTokens: 200,
    completionTokens: 300,
    estimatedCost: 0.2,
    status: "failed",
    startedAt: "2026-07-07T00:11:00.000Z",
  });

  const summary = await service.getCostSummary();

  assert.deepEqual(summary, {
    totalEstimatedCost: 0.5,
    providerGroups: [
      { key: "openai", cost: 0.3, tokens: 1000 },
      { key: "gemini", cost: 0.2, tokens: 500 },
    ],
    modelGroups: [
      { key: "gpt-5-mini", cost: 0.3, tokens: 1000 },
      { key: "gemini-2.5-flash", cost: 0.2, tokens: 500 },
    ],
    stepGroups: [
      { key: "generate_report", cost: 0.3, tokens: 1000 },
      { key: "validate_output", cost: 0.2, tokens: 500 },
    ],
    taskGroups: [
      { key: "task_1", cost: 0.3, tokens: 1000 },
      { key: "task_2", cost: 0.2, tokens: 500 },
    ],
    outcomeGroups: [
      { key: "completed", cost: 0.3, tokens: 1000 },
      { key: "failed", cost: 0.2, tokens: 500 },
    ],
  });
});

test("returns credit operations with accounts and recent ledger entries", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { email: "alice@example.test" }),
    makeCreditAccount("user_1", {
      balance: 12,
      frozenCredits: 3,
      totalRedeemed: 20,
      totalCaptured: 5,
    }),
  );
  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    entryType: "adjustment",
    amount: 12,
    balanceAfter: 12,
    frozenAfter: 3,
    idempotencyKey: "support-1",
    reason: "offline invoice",
    metadata: { ticketId: "T-1" },
    createdAt: "2026-07-07T00:05:00.000Z",
  });

  const operations = await service.getCreditOperations();

  assert.deepEqual(operations, {
    accounts: [
      {
        userId: "user_1",
        userEmail: "alice@example.test",
        balance: 12,
        frozenCredits: 3,
        totalRedeemed: 20,
        totalCaptured: 5,
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    ],
    ledger: [
      {
        id: "ledger_1",
        userId: "user_1",
        userEmail: "alice@example.test",
        entryType: "adjustment",
        amount: 12,
        balanceAfter: 12,
        frozenAfter: 3,
        idempotencyKey: "support-1",
        reason: "offline invoice",
        createdAt: "2026-07-07T00:05:00.000Z",
      },
    ],
  });
});

test("returns admin feedback and known settings from real repository data", async () => {
  const { repo, service } = createScenario();
  await repo.createUserWithCreditAccount(
    makeUser("user_1", { email: "alice@example.test" }),
    makeCreditAccount("user_1"),
  );
  await repo.appendUserFeedback({
    id: "feedback_1",
    userId: "user_1",
    taskId: "task_1",
    reportId: "report_1",
    rating: 4,
    feedbackType: "quality",
    comment: "Useful but slow",
    metadata: { source: "report" },
    createdAt: "2026-07-07T00:06:00.000Z",
  });
  await repo.saveSystemSetting({
    key: "queue.paused",
    value: true,
    description: "Pause commercial queue",
    updatedByUserId: "admin_1",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:07:00.000Z",
  });

  const feedback = await service.getFeedback();
  const settings = await service.getSettings();

  assert.deepEqual(feedback.items, [
    {
      id: "feedback_1",
      userId: "user_1",
      userEmail: "alice@example.test",
      taskId: "task_1",
      reportId: "report_1",
      rating: 4,
      feedbackType: "quality",
      comment: "Useful but slow",
      metadata: { source: "report" },
      createdAt: "2026-07-07T00:06:00.000Z",
    },
  ]);
  assert.deepEqual(feedback.summary, {
    total: 1,
    averageRating: 4,
    withComments: 1,
  });
  assert.deepEqual(settings.items.find((item) => item.key === "queue.paused"), {
    key: "queue.paused",
    value: true,
    description: "Pause commercial queue",
    updatedByUserId: "admin_1",
    configured: true,
    updatedAt: "2026-07-07T00:07:00.000Z",
  });
  assert.equal(settings.items.some((item) => item.configured === false), true);
});

test("admin can configure platform models exposed to users", async () => {
  const { repo, service } = createScenario();

  const settings = await service.updatePlatformModels({
    actorUserId: "admin_1",
    enabledModelProfileIds: ["anthropic_sonnet_balanced", "gemini_flash_deep"],
  });

  assert.deepEqual(settings.platformModels.enabledModelProfileIds, [
    "anthropic_sonnet_balanced",
    "gemini_flash_deep",
  ]);
  assert.deepEqual(
    settings.platformModels.enabled.map((model) => model.id),
    ["gemini_flash_deep", "anthropic_sonnet_balanced"],
  );
  assert.deepEqual(
    (await repo.getSystemSetting("platform.models.enabled"))?.value,
    ["anthropic_sonnet_balanced", "gemini_flash_deep"],
  );
  assert.deepEqual(
    (await repo.listAdminAuditLogs()).map((log) => ({
      action: log.action,
      targetId: log.targetId,
      metadata: log.metadata,
    })),
    [
      {
        action: "system_setting_updated",
        targetId: "platform.models.enabled",
        metadata: {
          enabledModelProfileIds: ["anthropic_sonnet_balanced", "gemini_flash_deep"],
        },
      },
    ],
  );
});

test("admin saves platform provider secrets as masks and manages repository-backed profiles", async () => {
  const { repo, service } = createScenario();

  const provider = await service.savePlatformModelProvider({
    actorUserId: "admin_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-platform-secret123456",
  });
  const profile = await service.savePlatformModelProfile({
    actorUserId: "admin_1",
    id: "openrouter_deep",
    providerConfigId: provider.id,
    label: "OpenRouter Deep",
    modelId: "anthropic/claude-sonnet-4",
    quality: "deep",
    visibleToUser: true,
    status: "active",
  });
  const settings = await service.getSettings();

  assert.equal(provider.apiKeyMask, "sk-pla...3456");
  assert.equal(JSON.stringify(provider).includes("sk-platform-secret123456"), false);
  assert.equal((await repo.getPlatformModelProvider(provider.id))?.encryptedApiKey, "encrypted:sk-platform-secret123456");
  assert.equal(profile.id, "openrouter_deep");
  assert.deepEqual(settings.platformModelProviders.map((item) => ({
    id: item.id,
    provider: item.provider,
    apiKeyMask: item.apiKeyMask,
  })), [
    {
      id: provider.id,
      provider: "openai_compatible",
      apiKeyMask: "sk-pla...3456",
    },
  ]);
  assert.deepEqual(settings.platformModels.enabledModelProfileIds, [
    "openrouter_deep",
  ]);
  assert.equal(settings.platformModels.available[0]?.source, "admin");
  assert.equal(settings.platformModels.available[0]?.modelId, "anthropic/claude-sonnet-4");
});

test("admin provider test updates masked provider status without exposing secret", async () => {
  const { service } = createScenario();
  const provider = await service.savePlatformModelProvider({
    actorUserId: "admin_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-platform-secret123456",
  });

  const tested = await service.testPlatformModelProvider({
    actorUserId: "admin_1",
    providerConfigId: provider.id,
  });

  assert.equal(tested.lastTestStatus, "passed");
  assert.equal(tested.lastTestedAt, "2026-07-07T00:02:00.000Z");
  assert.equal(JSON.stringify(tested).includes("sk-platform-secret123456"), false);
});

test("admin provider model discovery decrypts secrets without returning them", async () => {
  const observed: unknown[] = [];
  const { service } = createScenario({
    discoverPlatformProviderModels: async (input) => {
      observed.push(input);
      return {
        models: [
          { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
          { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
        ],
      };
    },
  });
  const provider = await service.savePlatformModelProvider({
    actorUserId: "admin_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-platform-secret123456",
  });

  const catalog = await service.listPlatformProviderModels({
    actorUserId: "admin_1",
    providerConfigId: provider.id,
  });

  assert.deepEqual(observed, [
    {
      provider: "openai_compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-platform-secret123456",
    },
  ]);
  assert.deepEqual(catalog, {
    providerId: provider.id,
    provider: "openai_compatible",
    models: [
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
    ],
    unsupported: false,
  });
  assert.equal(JSON.stringify(catalog).includes("sk-platform-secret123456"), false);
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

function createScenario(options: {
  maxActiveWeight?: number;
  discoverPlatformProviderModels?: ConstructorParameters<typeof CommercialAdminService>[0]["discoverPlatformProviderModels"];
} = {}): {
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
  const workerMonitoringService = new WorkerMonitoringService({
    repository: repo,
    maxActiveWeight: options.maxActiveWeight ?? 30,
    now: () => "2026-07-07T00:30:00.000Z",
  });
  return {
    repo,
    service: new CommercialAdminService({
      repository: repo,
      accessCodeService,
      creditService,
      auditService,
      workerMonitoringService,
      now: () => clock.next(),
      createId: (prefix = "id") => ids.create(prefix),
      hashPassword: async (password) => `hashed:${password}`,
      secretEncryptionKey: Buffer.alloc(32, 7),
      encryptSecret: (plaintext) => `encrypted:${plaintext}`,
      decryptSecret: (encrypted) => encrypted.replace(/^encrypted:/, ""),
      maskSecret: (secret) => `${secret.slice(0, 6)}...${secret.slice(-4)}`,
      testPlatformProviderConnection: async () => ({ ok: true }),
      discoverPlatformProviderModels: options.discoverPlatformProviderModels,
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
