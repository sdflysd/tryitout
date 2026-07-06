import assert from "node:assert/strict";
import test from "node:test";

import { hashAccessCode, maskAccessCode } from "./access-codes.js";
import { CreditService, CreditServiceError } from "./credit-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import type { CommercialRepository } from "./repository.js";

const now = new Date("2026-07-06T12:00:00.000Z");
const pepper = "test-pepper";

async function seedUser(repository: CommercialRepository): Promise<void> {
  await repository.saveUser({
    id: "user_1",
    email: "founder@tryitout.ai",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    isAdmin: false,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveCreditAccount({
    userId: "user_1",
    balance: 0,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedAccessCode(repository: CommercialRepository, code = "TIO-ABCD-1234-WXYZ"): Promise<void> {
  await repository.saveUser({
    id: "admin_1",
    email: "admin@tryitout.ai",
    passwordHash: "hash",
    tier: "business",
    features: [],
    isAdmin: true,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveAccessCode({
    id: "code_1",
    codeHash: hashAccessCode(code, pepper),
    maskedCode: maskAccessCode(code),
    status: "active",
    creditAmount: 10,
    tier: "pro",
    features: ["custom_model_provider"],
    expiresAt: undefined,
    redeemedByUserId: undefined,
    redeemedAt: undefined,
    disabledAt: undefined,
    createdByAdminUserId: "admin_1",
    createdAt: now,
    updatedAt: now,
  });
}

function createService(repository = new InMemoryCommercialRepository()): CreditService {
  return new CreditService(repository, {
    accessCodePepper: pepper,
    now: () => now,
  });
}

test("redeeming an active access code increases balance and applies tier features", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  await seedAccessCode(repository);
  const service = createService(repository);

  const result = await service.redeemAccessCode({
    userId: "user_1",
    code: "tio-abcd-1234-wxyz",
    idempotencyKey: "redeem:user_1:code_1",
  });

  assert.equal(result.balance, 10);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await repository.getUser("user_1"))?.tier, "pro");
  assert.deepEqual((await repository.getUser("user_1"))?.features, ["custom_model_provider"]);
  assert.equal((await repository.getAccessCode("code_1"))?.status, "redeemed");
  assert.equal((await repository.findAccessCodeRedemption("code_1"))?.userId, "user_1");
  assert.equal((await repository.findLedgerEntryByIdempotencyKey("redeem:user_1:code_1"))?.type, "redeem");
});

test("redeeming the same code twice is rejected", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  await seedAccessCode(repository);
  const service = createService(repository);

  await service.redeemAccessCode({
    userId: "user_1",
    code: "TIO-ABCD-1234-WXYZ",
    idempotencyKey: "redeem:user_1:code_1",
  });

  await assert.rejects(
    service.redeemAccessCode({
      userId: "user_1",
      code: "TIO-ABCD-1234-WXYZ",
      idempotencyKey: "redeem:user_1:code_1:again",
    }),
    new CreditServiceError("access_code_not_active", "Access code is not active."),
  );
});

test("holding credits decreases balance and records a hold ledger entry", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  await repository.saveCreditAccount({ userId: "user_1", balance: 5, createdAt: now, updatedAt: now });
  const service = createService(repository);

  const hold = await service.holdCredits({
    userId: "user_1",
    amount: 3,
    taskId: "task_1",
    idempotencyKey: "task_1:hold",
  });

  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 2);
  assert.equal(hold.amount, -3);
  assert.equal(hold.type, "hold");
  assert.equal(hold.referenceId, "task_1");
});

test("holding with insufficient balance is rejected", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  await repository.saveCreditAccount({ userId: "user_1", balance: 1, createdAt: now, updatedAt: now });
  const service = createService(repository);

  await assert.rejects(
    service.holdCredits({
      userId: "user_1",
      amount: 3,
      taskId: "task_1",
      idempotencyKey: "task_1:hold",
    }),
    new CreditServiceError("insufficient_credits", "Insufficient credits."),
  );
});

test("capturing and releasing a hold are idempotent", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  await repository.saveCreditAccount({ userId: "user_1", balance: 5, createdAt: now, updatedAt: now });
  const service = createService(repository);

  const hold = await service.holdCredits({
    userId: "user_1",
    amount: 3,
    taskId: "task_1",
    idempotencyKey: "task_1:hold",
  });

  const capture = await service.captureHeldCredits({
    userId: "user_1",
    holdLedgerEntryId: hold.id,
    taskId: "task_1",
    idempotencyKey: "task_1:capture",
  });
  const captureRetry = await service.captureHeldCredits({
    userId: "user_1",
    holdLedgerEntryId: hold.id,
    taskId: "task_1",
    idempotencyKey: "task_1:capture",
  });

  assert.equal(capture.id, captureRetry.id);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 2);

  const release = await service.releaseHeldCredits({
    userId: "user_1",
    holdLedgerEntryId: hold.id,
    taskId: "task_2",
    idempotencyKey: "task_2:release",
  });
  const releaseRetry = await service.releaseHeldCredits({
    userId: "user_1",
    holdLedgerEntryId: hold.id,
    taskId: "task_2",
    idempotencyKey: "task_2:release",
  });

  assert.equal(release.id, releaseRetry.id);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 5);
});

test("admin adjustment changes balance and records reason", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  await repository.saveCreditAccount({ userId: "user_1", balance: 2, createdAt: now, updatedAt: now });
  const service = createService(repository);

  const entry = await service.adjustCredits({
    userId: "user_1",
    amount: 5,
    adminUserId: "admin_1",
    reason: "beta grant",
    idempotencyKey: "adjust:user_1:beta",
  });

  assert.equal(entry.balanceAfter, 7);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 7);
  assert.deepEqual(entry.metadata, { adminUserId: "admin_1", reason: "beta grant" });
});
