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

test("repository atomically creates a user with its credit account", async () => {
  const repo = new InMemoryCommercialRepository();

  await repo.createUserWithCreditAccount(makeUser(), makeCreditAccount());

  assert.equal(
    (await repo.getUser("user_1"))?.emailNormalized,
    "user@example.test",
  );
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 0);
});

test("repository createUserWithCreditAccount rejects duplicate user before mutating credit account", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveUser(makeUser());

  await assert.rejects(
    repo.createUserWithCreditAccount(
      { ...makeUser("user_2"), emailNormalized: "user@example.test" },
      makeCreditAccount("user_2"),
    ),
    /users\.emailNormalized/,
  );

  assert.equal(await repo.getCreditAccount("user_2"), undefined);
});

test("repository createUserWithCreditAccount rejects existing credit account before mutating user", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveCreditAccount(makeCreditAccount("user_1"));

  await assert.rejects(
    repo.createUserWithCreditAccount(
      makeUser("user_1"),
      makeCreditAccount("user_1"),
    ),
    /user_credit_accounts\.userId/,
  );

  assert.equal(await repo.getUser("user_1"), undefined);
});

test("repository revokes all active sessions for a user", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveSession({
    id: "sess_1",
    userId: "user_1",
    tokenHash: "hash_1",
    expiresAt: "later",
    createdAt: "now",
  });
  await repo.saveSession({
    id: "sess_2",
    userId: "user_1",
    tokenHash: "hash_2",
    expiresAt: "later",
    revokedAt: "already-revoked",
    createdAt: "now",
  });
  await repo.saveSession({
    id: "sess_3",
    userId: "user_2",
    tokenHash: "hash_3",
    expiresAt: "later",
    createdAt: "now",
  });

  await repo.revokeUserSessions("user_1", "revoked-now");

  assert.equal(
    (await repo.findSessionByTokenHash("hash_1"))?.revokedAt,
    "revoked-now",
  );
  assert.equal(
    (await repo.findSessionByTokenHash("hash_2"))?.revokedAt,
    "already-revoked",
  );
  assert.equal(
    (await repo.findSessionByTokenHash("hash_3"))?.revokedAt,
    undefined,
  );
});

test("repository stores credit accounts, ledger entries, sessions, tasks, and audit logs", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveCreditAccount({
    userId: "user_1",
    balance: 10,
    frozenCredits: 0,
    totalRedeemed: 10,
    totalCaptured: 0,
    updatedAt: "now",
  });
  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    entryType: "redeem",
    amount: 10,
    balanceAfter: 10,
    idempotencyKey: "redeem_1",
    createdAt: "now",
  });
  await repo.saveSession({
    id: "sess_1",
    userId: "user_1",
    tokenHash: "hash",
    expiresAt: "later",
    createdAt: "now",
  });
  await repo.saveCommercialTask({
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    createdAt: "now",
    updatedAt: "now",
  });
  await repo.appendAdminAuditLog({
    id: "audit_1",
    actorUserId: "admin_1",
    action: "user_credit_adjusted",
    targetType: "user",
    targetId: "user_1",
    metadata: {},
    createdAt: "now",
  });

  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 10);
  assert.equal(
    (await repo.findCreditLedgerEntryByIdempotencyKey("redeem_1"))?.id,
    "ledger_1",
  );
  assert.equal((await repo.findSessionByTokenHash("hash"))?.id, "sess_1");
  assert.equal((await repo.getCommercialTask("task_1"))?.status, "queued");
  assert.equal((await repo.listAdminAuditLogs()).length, 1);
});

test("repository rejects duplicate credit ledger idempotency keys", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    entryType: "redeem",
    amount: 10,
    balanceAfter: 10,
    idempotencyKey: "redeem_1",
    createdAt: "now",
  });

  await assert.rejects(
    repo.appendCreditLedgerEntry({
      id: "ledger_2",
      userId: "user_1",
      entryType: "redeem",
      amount: 10,
      balanceAfter: 20,
      idempotencyKey: "redeem_1",
      createdAt: "later",
    }),
    /credit_ledger\.idempotencyKey/,
  );
});

test("repository rejects duplicate access code hashes", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TEST-****",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "now",
  });

  await assert.rejects(
    repo.saveAccessCode({
      id: "code_2",
      batchId: "batch_1",
      codeHash: "hash_1",
      codeMask: "TEST-****",
      status: "active",
      credits: 10,
      features: [],
      createdAt: "later",
    }),
    /access_codes\.codeHash/,
  );
});

test("repository gets access codes by id and lists them by batch", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TEST-****-001",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "now",
  });
  await repo.saveAccessCode({
    id: "code_2",
    batchId: "batch_2",
    codeHash: "hash_2",
    codeMask: "TEST-****-002",
    status: "active",
    credits: 5,
    features: [],
    createdAt: "now",
  });
  await repo.saveAccessCode({
    id: "code_3",
    batchId: "batch_1",
    codeHash: "hash_3",
    codeMask: "TEST-****-003",
    status: "disabled",
    credits: 10,
    features: [],
    createdAt: "later",
  });

  assert.equal((await repo.getAccessCode("code_1"))?.codeHash, "hash_1");
  assert.deepEqual(
    (await repo.listAccessCodesByBatch("batch_1")).map((code) => code.id),
    ["code_1", "code_3"],
  );
});

test("repository rejects duplicate access code redemptions", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    featuresGranted: [],
    redeemedAt: "now",
    metadata: {},
  });

  await assert.rejects(
    repo.saveAccessCodeRedemption({
      id: "redemption_2",
      accessCodeId: "code_1",
      userId: "user_2",
      credits: 10,
      featuresGranted: [],
      redeemedAt: "later",
      metadata: {},
    }),
    /access_code_redemptions\.accessCodeId/,
  );
});

test("repository rejects duplicate session token hashes", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveSession({
    id: "sess_1",
    userId: "user_1",
    tokenHash: "token_hash",
    expiresAt: "later",
    createdAt: "now",
  });

  await assert.rejects(
    repo.saveSession({
      id: "sess_2",
      userId: "user_2",
      tokenHash: "token_hash",
      expiresAt: "later",
      createdAt: "later",
    }),
    /user_sessions\.tokenHash/,
  );
});

test("repository rejects duplicate report task ids", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveCommercialReport({
    id: "report_1",
    taskId: "task_1",
    userId: "user_1",
    unlocked: false,
    createdAt: "now",
    updatedAt: "now",
  });

  await assert.rejects(
    repo.saveCommercialReport({
      id: "report_2",
      taskId: "task_1",
      userId: "user_1",
      unlocked: false,
      createdAt: "later",
      updatedAt: "later",
    }),
    /simulation_reports\.taskId/,
  );
});

test("repository rejects duplicate model providers for the same user", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveUserModelProvider({
    id: "provider_1",
    userId: "user_1",
    provider: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.example.test",
    encryptedApiKey: "encrypted",
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: "now",
    updatedAt: "now",
  });

  await assert.rejects(
    repo.saveUserModelProvider({
      id: "provider_2",
      userId: "user_1",
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.example.test",
      encryptedApiKey: "encrypted",
      apiKeyMask: "sk-****",
      status: "active",
      createdAt: "later",
      updatedAt: "later",
    }),
    /user_model_providers\.userId_provider/,
  );
});

test("repository allows updating the same id with a unique value", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveAccessCode({
    id: "code_1",
    batchId: "batch_1",
    codeHash: "hash_1",
    codeMask: "TEST-****",
    status: "active",
    credits: 10,
    features: [],
    createdAt: "now",
  });

  await assert.doesNotReject(
    repo.saveAccessCode({
      id: "code_1",
      batchId: "batch_1",
      codeHash: "hash_1",
      codeMask: "TEST-****",
      status: "disabled",
      credits: 10,
      features: [],
      createdAt: "now",
      disabledAt: "later",
    }),
  );
});

test("repository rejects duplicate primary ids on append-only records", async () => {
  const repo = new InMemoryCommercialRepository();

  await repo.appendCreditLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    entryType: "redeem",
    amount: 10,
    balanceAfter: 10,
    idempotencyKey: "redeem_1",
    createdAt: "now",
  });
  await assert.rejects(
    repo.appendCreditLedgerEntry({
      id: "ledger_1",
      userId: "user_1",
      entryType: "adjustment",
      amount: 5,
      balanceAfter: 15,
      idempotencyKey: "adjust_1",
      createdAt: "later",
    }),
    /credit_ledger\.id/,
  );

  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    featuresGranted: [],
    redeemedAt: "now",
    metadata: {},
  });
  await assert.rejects(
    repo.saveAccessCodeRedemption({
      id: "redemption_1",
      accessCodeId: "code_2",
      userId: "user_2",
      credits: 10,
      featuresGranted: [],
      redeemedAt: "later",
      metadata: {},
    }),
    /access_code_redemptions\.id/,
  );

  await repo.appendSimulationTaskRun({
    id: "run_1",
    taskId: "task_1",
    status: "running",
    startedAt: "now",
  });
  await assert.rejects(
    repo.appendSimulationTaskRun({
      id: "run_1",
      taskId: "task_1",
      status: "completed",
      startedAt: "later",
      completedAt: "later",
    }),
    /simulation_task_runs\.id/,
  );

  await repo.appendSimulationStepRunCost({
    id: "step_1",
    taskId: "task_1",
    stepName: "generate_report",
    status: "started",
    startedAt: "now",
  });
  await assert.rejects(
    repo.appendSimulationStepRunCost({
      id: "step_1",
      taskId: "task_1",
      stepName: "generate_report",
      status: "completed",
      startedAt: "later",
      completedAt: "later",
    }),
    /simulation_step_runs\.id/,
  );

  await repo.appendAnalyticsEvent({
    id: "event_1",
    eventType: "task_started",
    properties: {},
    occurredAt: "now",
  });
  await assert.rejects(
    repo.appendAnalyticsEvent({
      id: "event_1",
      eventType: "task_completed",
      properties: {},
      occurredAt: "later",
    }),
    /analytics_events\.id/,
  );

  await repo.appendUserFeedback({
    id: "feedback_1",
    userId: "user_1",
    rating: 5,
    metadata: {},
    createdAt: "now",
  });
  await assert.rejects(
    repo.appendUserFeedback({
      id: "feedback_1",
      userId: "user_1",
      rating: 1,
      metadata: {},
      createdAt: "later",
    }),
    /user_feedback\.id/,
  );

  await repo.appendAdminAuditLog({
    id: "audit_1",
    actorUserId: "admin_1",
    action: "user_credit_adjusted",
    targetType: "user",
    targetId: "user_1",
    metadata: {},
    createdAt: "now",
  });
  await assert.rejects(
    repo.appendAdminAuditLog({
      id: "audit_1",
      actorUserId: "admin_1",
      action: "task_cancelled",
      targetType: "task",
      targetId: "task_1",
      metadata: {},
      createdAt: "later",
    }),
    /admin_audit_logs\.id/,
  );
});

function makeUser(id = "user_1") {
  const email = id === "user_1" ? "user@example.test" : `${id}@example.test`;
  return {
    id,
    email,
    emailNormalized: email,
    passwordHash: "hash",
    role: "user" as const,
    tier: "basic" as const,
    status: "active" as const,
    features: [],
    createdAt: "now",
    updatedAt: "now",
  };
}

function makeCreditAccount(userId = "user_1") {
  return {
    userId,
    balance: 0,
    frozenCredits: 0,
    totalRedeemed: 0,
    totalCaptured: 0,
    updatedAt: "now",
  };
}
