import assert from "node:assert/strict";
import test from "node:test";

import { AccessCodeService } from "./access-code-service.js";
import { hashAccessCode } from "./access-code-secrets.js";
import {
  CreditService,
  CreditServiceError,
} from "./credit-service.js";
import {
  InMemoryCommercialRepository,
} from "./repository.js";
import type {
  AccessCodeRecord,
  CommercialSimulationTaskRecord,
  CreditLedgerEntryRecord,
  UserCreditAccountRecord,
} from "./types.js";

const ACCESS_CODE_PEPPER = "test-pepper";
const CREATED_AT = "2026-07-07T00:00:00.000Z";
const NOW_VALUES = [
  CREATED_AT,
  "2026-07-07T00:01:00.000Z",
  "2026-07-07T00:02:00.000Z",
  "2026-07-07T00:03:00.000Z",
  "2026-07-07T00:04:00.000Z",
  "2026-07-07T00:05:00.000Z",
  "2026-07-07T00:06:00.000Z",
  "2026-07-07T00:07:00.000Z",
  "2026-07-07T00:08:00.000Z",
  "2026-07-07T00:09:00.000Z",
  "2026-07-07T00:10:00.000Z",
];
const RAW_CODE = "TIO-ABCD-EFGH-JK23";

test("redeeming an active access code increases balance, writes ledger, and records redemption", async () => {
  const { repo, service, accessCodeService } = await createScenario();
  const created = await accessCodeService.createSingleAccessCode({
    credits: 13,
    tier: "pro",
    features: ["priority_queue"],
    metadata: { campaign: "launch" },
  });

  const result = await service.redeemAccessCode({
    userId: "user_1",
    rawCode: created.rawCode,
    idempotencyKey: "redeem-key-1",
    metadata: { source: "checkout" },
  });

  assert.equal(result.ledger.entryType, "redeem");
  assert.equal(result.ledger.amount, 13);
  assert.equal(result.ledger.balanceAfter, 13);
  assert.equal(result.ledger.frozenAfter, 0);
  assert.equal(result.ledger.accessCodeId, created.record.id);
  assert.equal(result.account.balance, 13);
  assert.equal(result.account.totalRedeemed, 13);
  assert.equal(result.redemption.creditLedgerId, result.ledger.id);
  assert.equal((await repo.getAccessCode(created.record.id))?.status, "redeemed");
  assert.deepEqual(
    await repo.findAccessCodeRedemptionByCodeId(created.record.id),
    result.redemption,
  );
});

test("redeeming same code twice is rejected", async () => {
  const { service, accessCodeService } = await createScenario();
  const created = await accessCodeService.createSingleAccessCode({
    credits: 5,
    features: [],
  });

  await service.redeemAccessCode({
    userId: "user_1",
    rawCode: created.rawCode,
    idempotencyKey: "redeem-key-1",
  });

  await assert.rejects(
    service.redeemAccessCode({
      userId: "user_2",
      rawCode: created.rawCode,
      idempotencyKey: "redeem-key-2",
    }),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );
});

test("repeating redeem with same idempotency key returns existing result without double applying", async () => {
  const { repo, service, accessCodeService } = await createScenario();
  const created = await accessCodeService.createSingleAccessCode({
    credits: 8,
    features: [],
  });

  const first = await service.redeemAccessCode({
    userId: "user_1",
    rawCode: created.rawCode,
    idempotencyKey: "redeem-key-1",
  });
  const second = await service.redeemAccessCode({
    userId: "user_1",
    rawCode: created.rawCode,
    idempotencyKey: "redeem-key-1",
  });

  assert.equal(second.ledger.id, first.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 8);
});

test("redeem idempotency replays when concurrent writer returns undefined after code is consumed", async () => {
  const { repo, service, accessCodeService } = await createScenario();
  const created = await accessCodeService.createSingleAccessCode({
    credits: 8,
    features: [],
  });
  const first = await service.redeemAccessCode({
    userId: "user_1",
    rawCode: created.rawCode,
    idempotencyKey: "redeem-key-1",
  });
  const racingService = createCreditService(
    new UndefinedRedeemReplayRepository(repo, {
      ...created.record,
      status: "active",
    }),
  );

  const replay = await racingService.redeemAccessCode({
    userId: "user_1",
    rawCode: created.rawCode,
    idempotencyKey: "redeem-key-1",
  });

  assert.equal(replay.ledger.id, first.ledger.id);
  assert.equal(replay.redemption.id, first.redemption.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 8);
});

test("reusing idempotency keys with different redeem requests is rejected", async () => {
  const { repo, service, accessCodeService } = await createScenario();
  const firstCode = await accessCodeService.createSingleAccessCode({
    credits: 8,
    features: [],
  });
  await repo.saveAccessCode({
    id: "code_2",
    batchId: "batch_2",
    codeHash: hashAccessCode("TIO-WXYZ-ABCD-EF34", ACCESS_CODE_PEPPER),
    codeMask: "TIO-****-****-EF34",
    status: "active",
    credits: 5,
    features: [],
    createdAt: CREATED_AT,
  });

  await service.redeemAccessCode({
    userId: "user_1",
    rawCode: firstCode.rawCode,
    idempotencyKey: "redeem-key-1",
  });

  await assert.rejects(
    service.redeemAccessCode({
      userId: "user_2",
      rawCode: firstCode.rawCode,
      idempotencyKey: "redeem-key-1",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
  await assert.rejects(
    service.redeemAccessCode({
      userId: "user_1",
      rawCode: "TIO-WXYZ-ABCD-EF34",
      idempotencyKey: "redeem-key-1",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
});

test("holding credits decreases available balance and increases frozen credits", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));

  const result = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
    reason: "task_queued",
  });

  assert.equal(result.ledger.entryType, "hold");
  assert.equal(result.ledger.amount, -4);
  assert.equal(result.account.balance, 6);
  assert.equal(result.account.frozenCredits, 4);
  assert.equal((await repo.getCommercialTask("task_1"))?.creditHoldLedgerId, result.ledger.id);
});

test("holding credits requires a matching unheld task and mutates nothing on task conflicts", async () => {
  const missing = await createScenario({ balance: 10, totalRedeemed: 10 });
  await assert.rejects(
    missing.service.holdCreditsForTask({
      userId: "user_1",
      taskId: "missing_task",
      amount: 4,
      idempotencyKey: "hold-key-1",
    }),
    (error) => hasServiceCode(error, "task_not_found"),
  );
  assert.equal((await missing.repo.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await missing.repo.getCreditAccount("user_1"))?.frozenCredits, 0);

  const mismatch = await createScenario({ balance: 10, totalRedeemed: 10 });
  await mismatch.repo.saveCommercialTask(makeTask({ userId: "user_2" }));
  await assert.rejects(
    mismatch.service.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_1",
      amount: 4,
      idempotencyKey: "hold-key-1",
    }),
    (error) => hasServiceCode(error, "task_not_found"),
  );
  assert.equal((await mismatch.repo.getCreditAccount("user_1"))?.balance, 10);

  const alreadyHeld = await createScenario({ balance: 10, totalRedeemed: 10 });
  await alreadyHeld.repo.saveCommercialTask(makeTask({ creditHoldLedgerId: "ledger_existing" }));
  await assert.rejects(
    alreadyHeld.service.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_1",
      amount: 4,
      idempotencyKey: "hold-key-1",
    }),
    (error) => hasServiceCode(error, "task_hold_conflict"),
  );
  assert.equal((await alreadyHeld.repo.getCreditAccount("user_1"))?.balance, 10);
});

test("holding with insufficient credits is rejected", async () => {
  const { repo, service } = await createScenario({ balance: 3, totalRedeemed: 3 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));

  await assert.rejects(
    service.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_1",
      amount: 4,
      idempotencyKey: "hold-key-1",
    }),
    (error) => hasServiceCode(error, "insufficient_credits"),
  );
});

test("repeating hold with same idempotency key does not double freeze", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const first = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });
  const second = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });

  assert.equal(second.ledger.id, first.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 6);
  assert.equal((await repo.getCreditAccount("user_1"))?.frozenCredits, 4);
});

test("hold idempotency replays when concurrent writer returns undefined after task is held", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const first = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
    reason: "task_queued",
  });
  const racingService = createCreditService(
    new UndefinedHoldReplayRepository(repo),
  );

  const replay = await racingService.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
    reason: "task_queued",
  });

  assert.equal(replay.ledger.id, first.ledger.id);
  assert.equal(replay.account.balance, 6);
  assert.equal(replay.account.frozenCredits, 4);
});

test("reusing transition idempotency keys with different request intent is rejected", async () => {
  const { repo, service } = await createScenario({ balance: 20, totalRedeemed: 20 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  await repo.saveCommercialTask(makeTask({ id: "task_2", creditCost: 5 }));
  const hold = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
    reason: "task_queued",
  });

  await assert.rejects(
    service.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_2",
      amount: 4,
      idempotencyKey: "hold-key-1",
      reason: "task_queued",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
  await assert.rejects(
    service.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_1",
      amount: 5,
      idempotencyKey: "hold-key-1",
      reason: "task_queued",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
  await assert.rejects(
    service.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_1",
      amount: 4,
      idempotencyKey: "hold-key-1",
      reason: "different_reason",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
  await assert.rejects(
    service.captureHeldCredits({
      userId: "user_1",
      taskId: "task_1",
      holdLedgerId: hold.ledger.id,
      idempotencyKey: "hold-key-1",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
});

test("duplicate idempotency race returns existing matching hold result", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const first = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
    reason: "task_queued",
  });
  const racingRepo = new DuplicateIdempotencyRepository(
    repo,
    "credit_ledger.idempotencyKey must be unique",
  );
  const racingService = createCreditService(racingRepo);

  const retry = await racingService.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
    reason: "task_queued",
  });

  assert.equal(retry.ledger.id, first.ledger.id);
  assert.equal(retry.account.balance, 6);
  assert.equal(racingRepo.holdCalls, 1);
});

test("duplicate idempotency race with conflicting stored ledger is rejected", async () => {
  const { repo } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.appendCreditLedgerEntry({
    id: "ledger_existing",
    userId: "user_1",
    taskId: "task_2",
    entryType: "hold",
    amount: -4,
    balanceAfter: 6,
    frozenAfter: 4,
    idempotencyKey: "hold-key-1",
    metadata: {
      operation: "hold_task_credits",
      requestUserId: "user_1",
      taskId: "task_2",
      amount: 4,
      requestFingerprint: "different",
    },
    createdAt: CREATED_AT,
  });
  const racingService = createCreditService(
    new DuplicateIdempotencyRepository(
      repo,
      'duplicate key value violates unique constraint "credit_ledger_idempotency_key_key"',
    ),
  );

  await assert.rejects(
    racingService.holdCreditsForTask({
      userId: "user_1",
      taskId: "task_1",
      amount: 4,
      idempotencyKey: "hold-key-1",
    }),
    (error) => hasServiceCode(error, "idempotency_conflict"),
  );
});

test("capturing a hold decreases frozen credits exactly once", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const hold = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });

  const capture = await service.captureHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: hold.ledger.id,
    idempotencyKey: "capture-key-1",
  });
  const retry = await service.captureHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: hold.ledger.id,
    idempotencyKey: "capture-key-1",
  });

  assert.equal(capture.ledger.entryType, "capture");
  assert.equal(capture.ledger.amount, -4);
  assert.equal(retry.ledger.id, capture.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 6);
  assert.equal((await repo.getCreditAccount("user_1"))?.frozenCredits, 0);
  assert.equal((await repo.getCreditAccount("user_1"))?.totalCaptured, 4);
});

test("releasing a hold returns credits exactly once", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const hold = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });

  const release = await service.releaseHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: hold.ledger.id,
    idempotencyKey: "release-key-1",
    reason: "task_cancelled",
  });
  const retry = await service.releaseHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: hold.ledger.id,
    idempotencyKey: "release-key-1",
    reason: "task_cancelled",
  });

  assert.equal(release.ledger.entryType, "release");
  assert.equal(release.ledger.amount, 4);
  assert.equal(retry.ledger.id, release.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await repo.getCreditAccount("user_1"))?.frozenCredits, 0);
});

test("capture and release reject holds already completed by the opposite transition", async () => {
  const captured = await createScenario({ balance: 10, totalRedeemed: 10 });
  await captured.repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const capturedHold = await captured.service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });
  await captured.service.captureHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: capturedHold.ledger.id,
    idempotencyKey: "capture-key-1",
  });
  await assert.rejects(
    captured.service.releaseHeldCredits({
      userId: "user_1",
      taskId: "task_1",
      holdLedgerId: capturedHold.ledger.id,
      idempotencyKey: "release-key-1",
    }),
    (error) => hasServiceCode(error, "hold_already_completed"),
  );

  const released = await createScenario({ balance: 10, totalRedeemed: 10 });
  await released.repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const releasedHold = await released.service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });
  await released.service.releaseHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: releasedHold.ledger.id,
    idempotencyKey: "release-key-1",
  });
  await assert.rejects(
    released.service.captureHeldCredits({
      userId: "user_1",
      taskId: "task_1",
      holdLedgerId: releasedHold.ledger.id,
      idempotencyKey: "capture-key-1",
    }),
    (error) => hasServiceCode(error, "hold_already_completed"),
  );
});

test("refunding a captured task adds credits with audit reason", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  const hold = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });
  const capture = await service.captureHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: hold.ledger.id,
    idempotencyKey: "capture-key-1",
  });

  const refund = await service.refundCapturedCredits({
    userId: "user_1",
    taskId: "task_1",
    captureLedgerId: capture.ledger.id,
    actorUserId: "admin_1",
    reason: "support_goodwill",
    idempotencyKey: "refund-key-1",
  });
  const retry = await service.refundCapturedCredits({
    userId: "user_1",
    taskId: "task_1",
    captureLedgerId: capture.ledger.id,
    actorUserId: "admin_1",
    reason: "support_goodwill",
    idempotencyKey: "refund-key-1",
  });

  assert.equal(refund.ledger.entryType, "refund");
  assert.equal(refund.ledger.amount, 4);
  assert.equal(refund.ledger.reason, "support_goodwill");
  assert.equal(retry.ledger.id, refund.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 10);
  assert.deepEqual(await repo.listAdminAuditLogs(), [
    {
      id: "admin_audit_log_1",
      actorUserId: "admin_1",
      action: "task_refunded",
      targetType: "task",
      targetId: "task_1",
      metadata: {
        amount: 4,
        captureLedgerId: capture.ledger.id,
        creditLedgerId: refund.ledger.id,
        reason: "support_goodwill",
      },
      createdAt: "2026-07-07T00:02:00.000Z",
    },
  ]);
});

test("refund idempotency validates capture, actor, and reason intent", async () => {
  const { repo, service } = await createScenario({ balance: 20, totalRedeemed: 20 });
  await repo.saveCommercialTask(makeTask({ creditCost: 4 }));
  await repo.saveCommercialTask(makeTask({ id: "task_2", creditCost: 3 }));
  const hold1 = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_1",
    amount: 4,
    idempotencyKey: "hold-key-1",
  });
  const capture1 = await service.captureHeldCredits({
    userId: "user_1",
    taskId: "task_1",
    holdLedgerId: hold1.ledger.id,
    idempotencyKey: "capture-key-1",
  });
  const hold2 = await service.holdCreditsForTask({
    userId: "user_1",
    taskId: "task_2",
    amount: 3,
    idempotencyKey: "hold-key-2",
  });
  const capture2 = await service.captureHeldCredits({
    userId: "user_1",
    taskId: "task_2",
    holdLedgerId: hold2.ledger.id,
    idempotencyKey: "capture-key-2",
  });

  await service.refundCapturedCredits({
    userId: "user_1",
    taskId: "task_1",
    captureLedgerId: capture1.ledger.id,
    actorUserId: "admin_1",
    reason: "support_goodwill",
    idempotencyKey: "refund-key-1",
  });

  for (const input of [
    { captureLedgerId: capture2.ledger.id, actorUserId: "admin_1", reason: "support_goodwill" },
    { captureLedgerId: capture1.ledger.id, actorUserId: "admin_2", reason: "support_goodwill" },
    { captureLedgerId: capture1.ledger.id, actorUserId: "admin_1", reason: "different_reason" },
  ]) {
    await assert.rejects(
      service.refundCapturedCredits({
        userId: "user_1",
        taskId: input.captureLedgerId === capture2.ledger.id ? "task_2" : "task_1",
        captureLedgerId: input.captureLedgerId,
        actorUserId: input.actorUserId,
        reason: input.reason,
        idempotencyKey: "refund-key-1",
      }),
      (error) => hasServiceCode(error, "idempotency_conflict"),
    );
  }
});

test("admin adjustment changes balance and records actor/reason", async () => {
  const { repo, service } = await createScenario({ balance: 10, totalRedeemed: 10 });

  const adjustment = await service.adjustCredits({
    userId: "user_1",
    amount: -3,
    actorUserId: "admin_1",
    reason: "manual_correction",
    idempotencyKey: "adjust-key-1",
    metadata: { ticketId: "T-123" },
  });
  const retry = await service.adjustCredits({
    userId: "user_1",
    amount: -3,
    actorUserId: "admin_1",
    reason: "manual_correction",
    idempotencyKey: "adjust-key-1",
  });

  assert.equal(adjustment.ledger.entryType, "adjustment");
  assert.equal(adjustment.ledger.amount, -3);
  assert.equal(adjustment.ledger.balanceAfter, 7);
  assert.equal(adjustment.ledger.metadata?.actorUserId, "admin_1");
  assert.equal(retry.ledger.id, adjustment.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 7);
  assert.deepEqual(await repo.listAdminAuditLogs(), [
    {
      id: "admin_audit_log_1",
      actorUserId: "admin_1",
      action: "credits_adjusted",
      targetType: "user",
      targetId: "user_1",
      metadata: {
        amount: -3,
        creditLedgerId: adjustment.ledger.id,
        reason: "manual_correction",
        ticketId: "T-123",
      },
      createdAt: "2026-07-07T00:00:00.000Z",
    },
  ]);
});

test("admin adjustment cannot make balance negative", async () => {
  const { service } = await createScenario({ balance: 2, totalRedeemed: 2 });

  await assert.rejects(
    service.adjustCredits({
      userId: "user_1",
      amount: -3,
      actorUserId: "admin_1",
      reason: "manual_correction",
      idempotencyKey: "adjust-key-1",
    }),
    (error) => hasServiceCode(error, "insufficient_credits"),
  );
});

async function createScenario(
  accountOverrides: Partial<UserCreditAccountRecord> = {},
): Promise<{
  repo: InMemoryCommercialRepository;
  service: CreditService;
  accessCodeService: AccessCodeService;
}> {
  const repo = new InMemoryCommercialRepository();
  const ids = new TestIds();
  const now = new TestClock(NOW_VALUES);
  const accessCodeService = new AccessCodeService({
    repository: repo,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId: (prefix = "id") => ids.create(prefix),
    generateAccessCode: () => RAW_CODE,
    now: () => now.next(),
  });
  const service = new CreditService({
    repository: repo,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId: (prefix = "id") => ids.create(prefix),
    hashAccessCode: hashAccessCode,
    now: () => now.next(),
  });

  await repo.saveCreditAccount({
    userId: "user_1",
    balance: 0,
    frozenCredits: 0,
    totalRedeemed: 0,
    totalCaptured: 0,
    updatedAt: CREATED_AT,
    ...accountOverrides,
  });

  return { repo, service, accessCodeService };
}

function createCreditService(
  repo: InMemoryCommercialRepository,
  options: { nowValues?: string[] } = {},
): CreditService {
  const ids = new TestIds();
  const now = new TestClock(options.nowValues ?? NOW_VALUES);
  return new CreditService({
    repository: repo,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId: (prefix = "id") => ids.create(prefix),
    hashAccessCode: hashAccessCode,
    now: () => now.next(),
  });
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
    creditCost: 4,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function hasServiceCode(error: unknown, code: CreditServiceError["code"]): boolean {
  return error instanceof CreditServiceError && error.code === code;
}

class TestIds {
  private readonly counters = new Map<string, number>();

  create(prefix = "id"): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next}`;
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

class DuplicateIdempotencyRepository extends InMemoryCommercialRepository {
  holdCalls = 0;

  constructor(
    private readonly backing: InMemoryCommercialRepository,
    private readonly duplicateMessage: string,
  ) {
    super();
  }

  override async holdCreditsForTask(): Promise<never> {
    this.holdCalls += 1;
    throw new Error(this.duplicateMessage);
  }

  override async findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    if (this.holdCalls === 0) {
      return undefined;
    }
    return this.backing.findCreditLedgerEntryByIdempotencyKey(idempotencyKey);
  }

  override async getCreditAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord | undefined> {
    return this.backing.getCreditAccount(userId);
  }
}

class UndefinedRedeemReplayRepository extends InMemoryCommercialRepository {
  private writerReturnedUndefined = false;

  constructor(
    private readonly backing: InMemoryCommercialRepository,
    private readonly activeCodeSnapshot: AccessCodeRecord,
  ) {
    super();
  }

  override async findAccessCodeByHash(): Promise<AccessCodeRecord | undefined> {
    return this.activeCodeSnapshot;
  }

  override async redeemAccessCodeWithCreditLedger(): Promise<undefined> {
    this.writerReturnedUndefined = true;
    return undefined;
  }

  override async findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    if (!this.writerReturnedUndefined) {
      return undefined;
    }
    return this.backing.findCreditLedgerEntryByIdempotencyKey(idempotencyKey);
  }

  override async findAccessCodeRedemptionByCodeId(accessCodeId: string) {
    return this.backing.findAccessCodeRedemptionByCodeId(accessCodeId);
  }

  override async getCreditAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord | undefined> {
    return this.backing.getCreditAccount(userId);
  }
}

class UndefinedHoldReplayRepository extends InMemoryCommercialRepository {
  private writerReturnedUndefined = false;

  constructor(private readonly backing: InMemoryCommercialRepository) {
    super();
  }

  override async holdCreditsForTask(): Promise<undefined> {
    this.writerReturnedUndefined = true;
    return undefined;
  }

  override async findCreditLedgerEntryByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CreditLedgerEntryRecord | undefined> {
    if (!this.writerReturnedUndefined) {
      return undefined;
    }
    return this.backing.findCreditLedgerEntryByIdempotencyKey(idempotencyKey);
  }

  override async getCreditAccount(
    userId: string,
  ): Promise<UserCreditAccountRecord | undefined> {
    return this.backing.getCreditAccount(userId);
  }

  override async getCommercialTask(taskId: string) {
    return this.backing.getCommercialTask(taskId);
  }
}
