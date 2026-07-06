import assert from "node:assert/strict";
import test from "node:test";

import { hashAccessCode } from "./access-codes.js";
import { CommercialAdminService } from "./admin-service.js";
import { CreditService } from "./credit-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import type { CommercialRepository } from "./repository.js";

const now = new Date("2026-07-06T12:00:00.000Z");
const pepper = "test-pepper";

async function seedAdmin(repository: CommercialRepository): Promise<void> {
  await repository.saveUser({
    id: "admin_1",
    email: "admin@tryitout.ai",
    passwordHash: "hash",
    tier: "business",
    features: ["custom_model_provider"],
    isAdmin: true,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedUser(repository: CommercialRepository): Promise<void> {
  await repository.saveUser({
    id: "user_1",
    email: "user@tryitout.ai",
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
    balance: 2,
    createdAt: now,
    updatedAt: now,
  });
}

function createService(repository = new InMemoryCommercialRepository()): CommercialAdminService {
  const creditService = new CreditService(repository, {
    accessCodePepper: pepper,
    now: () => now,
  });
  return new CommercialAdminService(repository, creditService, {
    accessCodePepper: pepper,
    now: () => now,
  });
}

test("batch code generation stores code hashes and masked values", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdmin(repository);
  const service = createService(repository);

  const result = await service.createAccessCodeBatch({
    adminUserId: "admin_1",
    count: 2,
    creditAmount: 25,
    tier: "pro",
    features: ["custom_model_provider"],
  });

  assert.equal(result.length, 2);
  assert.notEqual(result[0]?.rawCode, result[1]?.rawCode);
  for (const code of result) {
    assert.match(code.rawCode, /^TIO-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.match(code.maskedCode, /^TIO-[A-Z2-9]{4}-\*\*\*\*-[A-Z2-9]{4}$/);

    const stored = await repository.findAccessCodeByHash(hashAccessCode(code.rawCode, pepper));
    assert.ok(stored);
    assert.equal(stored.id, code.accessCodeId);
    assert.equal(stored.status, "active");
    assert.equal(stored.creditAmount, 25);
    assert.equal(stored.codeHash.includes(code.rawCode), false);
    assert.equal((stored as { rawCode?: string }).rawCode, undefined);
  }
});

test("raw codes are returned only in creation response", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdmin(repository);
  const service = createService(repository);

  const created = await service.createAccessCode({
    adminUserId: "admin_1",
    creditAmount: 10,
    tier: "basic",
    features: [],
  });

  const stored = await repository.getAccessCode(created.accessCodeId);
  assert.ok(stored);
  assert.equal(created.rawCode.startsWith("TIO-"), true);
  assert.equal((stored as { rawCode?: string }).rawCode, undefined);
  assert.equal(stored.maskedCode, created.maskedCode);
});

test("disabling a code writes an audit log", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdmin(repository);
  const service = createService(repository);
  const created = await service.createAccessCode({
    adminUserId: "admin_1",
    creditAmount: 10,
    tier: "basic",
    features: [],
  });

  await service.disableAccessCode({
    adminUserId: "admin_1",
    accessCodeId: created.accessCodeId,
    reason: "test disable",
  });

  assert.equal((await repository.getAccessCode(created.accessCodeId))?.status, "disabled");
  const logs = await repository.listAdminAuditLogs();
  assert.equal(logs.at(-1)?.action, "access_code.disabled");
  assert.equal(logs.at(-1)?.targetId, created.accessCodeId);
  assert.deepEqual(logs.at(-1)?.metadata, { reason: "test disable" });
});

test("manual credit adjustment writes ledger and audit log", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdmin(repository);
  await seedUser(repository);
  const service = createService(repository);

  const result = await service.adjustUserCredits({
    adminUserId: "admin_1",
    userId: "user_1",
    amount: 7,
    reason: "beta grant",
  });

  assert.equal(result.balanceAfter, 9);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 9);
  assert.equal((await repository.listLedgerEntriesForUser("user_1")).at(-1)?.type, "adjustment");
  const logs = await repository.listAdminAuditLogs();
  assert.equal(logs.at(-1)?.action, "credits.adjusted");
  assert.deepEqual(logs.at(-1)?.metadata, {
    amount: 7,
    balanceAfter: 9,
    reason: "beta grant",
  });
});

test("disabling a user writes audit log", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdmin(repository);
  await seedUser(repository);
  const service = createService(repository);

  await service.disableUser({
    adminUserId: "admin_1",
    userId: "user_1",
    reason: "chargeback risk",
  });

  assert.equal((await repository.getUser("user_1"))?.disabledAt?.toISOString(), now.toISOString());
  const logs = await repository.listAdminAuditLogs();
  assert.equal(logs.at(-1)?.action, "user.disabled");
  assert.deepEqual(logs.at(-1)?.metadata, { reason: "chargeback risk" });
});

test("changing system setting writes audit log", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedAdmin(repository);
  const service = createService(repository);

  await service.updateSystemSetting({
    adminUserId: "admin_1",
    key: "commercial.maxWeightedConcurrency",
    value: { value: 8 },
  });

  assert.deepEqual((await repository.getSystemSetting("commercial.maxWeightedConcurrency"))?.value, {
    value: 8,
  });
  const logs = await repository.listAdminAuditLogs();
  assert.equal(logs.at(-1)?.action, "system_setting.updated");
  assert.equal(logs.at(-1)?.targetId, "commercial.maxWeightedConcurrency");
});
