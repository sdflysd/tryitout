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
