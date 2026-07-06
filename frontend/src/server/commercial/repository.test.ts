import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommercialRepository } from "./repository.js";

const now = new Date("2026-07-06T12:00:00.000Z");

test("users can be found case-insensitively by email", async () => {
  const repository = new InMemoryCommercialRepository();

  await repository.saveUser({
    id: "user_1",
    email: "Founder@TryItOut.ai",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    isAdmin: false,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal((await repository.findUserByEmail("founder@tryitout.ai"))?.id, "user_1");
  assert.equal((await repository.findUserByEmail("FOUNDER@TRYITOUT.AI"))?.email, "Founder@TryItOut.ai");
});

test("credit accounts and ledger entries are stored", async () => {
  const repository = new InMemoryCommercialRepository();

  await repository.saveCreditAccount({
    userId: "user_1",
    balance: 10,
    createdAt: now,
    updatedAt: now,
  });
  await repository.appendLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    type: "redeem",
    amount: 10,
    balanceAfter: 10,
    idempotencyKey: "redeem:code_1:user_1",
    referenceType: "access_code",
    referenceId: "code_1",
    metadata: { codeId: "code_1" },
    createdAt: now,
  });

  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await repository.findLedgerEntryByIdempotencyKey("redeem:code_1:user_1"))?.id, "ledger_1");
  assert.deepEqual((await repository.listLedgerEntriesForUser("user_1")).map((entry) => entry.id), ["ledger_1"]);
});

test("session records can be saved, found by token hash, and revoked", async () => {
  const repository = new InMemoryCommercialRepository();

  await repository.saveSession({
    id: "session_1",
    userId: "user_1",
    tokenHash: "token_hash",
    expiresAt: new Date("2026-07-13T12:00:00.000Z"),
    revokedAt: undefined,
    createdAt: now,
  });

  assert.equal((await repository.findSessionByTokenHash("token_hash"))?.userId, "user_1");

  await repository.revokeSession("session_1", new Date("2026-07-07T12:00:00.000Z"));

  assert.equal(
    (await repository.findSessionByTokenHash("token_hash"))?.revokedAt?.toISOString(),
    "2026-07-07T12:00:00.000Z",
  );
});

test("commercial task records can be saved and loaded", async () => {
  const repository = new InMemoryCommercialRepository();

  await repository.saveCommercialTask({
    id: "task_1",
    userId: "user_1",
    status: "queued",
    scenario: "side_hustle",
    userInput: "test launch",
    interactionMode: "enabled",
    providerMode: "platform",
    creditCost: 3,
    creditHoldLedgerEntryId: "hold_1",
    creditCapturedLedgerEntryId: undefined,
    creditReleasedLedgerEntryId: undefined,
    queueJobId: "job_1",
    reportId: undefined,
    errorCode: undefined,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal((await repository.getCommercialTask("task_1"))?.creditHoldLedgerEntryId, "hold_1");
  assert.deepEqual((await repository.listActiveCommercialTasksForUser("user_1")).map((task) => task.id), [
    "task_1",
  ]);
});

test("user model provider records can be saved, loaded, and deleted", async () => {
  const repository = new InMemoryCommercialRepository();

  await repository.saveUserModelProvider({
    id: "provider_1",
    userId: "user_1",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    encryptedApiKey: "v1:encrypted",
    model: "gpt-4.1-mini",
    createdAt: now,
    updatedAt: now,
  });

  assert.equal((await repository.getUserModelProvider("user_1"))?.model, "gpt-4.1-mini");

  await repository.deleteUserModelProvider("user_1");

  assert.equal(await repository.getUserModelProvider("user_1"), undefined);
});

test("audit log records can be appended and listed", async () => {
  const repository = new InMemoryCommercialRepository();

  await repository.appendAdminAuditLog({
    id: "audit_1",
    adminUserId: "admin_1",
    action: "access_code.disabled",
    targetType: "access_code",
    targetId: "code_1",
    metadata: { reason: "test" },
    createdAt: now,
  });

  assert.deepEqual((await repository.listAdminAuditLogs()).map((entry) => entry.action), [
    "access_code.disabled",
  ]);
});
