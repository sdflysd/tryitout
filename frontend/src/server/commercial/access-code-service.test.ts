import assert from "node:assert/strict";
import test from "node:test";

import {
  AccessCodeService,
  AccessCodeServiceError,
} from "./access-code-service.js";
import { hashAccessCode, maskAccessCode } from "./access-code-secrets.js";
import { InMemoryCommercialRepository } from "./repository.js";
import type { CommercialRepository } from "./repository.js";

const ACCESS_CODE_PEPPER = "test-pepper";
const CREATED_AT = "2026-07-07T00:00:00.000Z";
const REDEEMED_AT = "2026-07-07T00:10:00.000Z";
const EXPIRED_AT = "2026-07-06T23:59:59.000Z";
const RAW_CODES = [
  "TIO-ABCD-EFGH-JK23",
  "TIO-ABCD-EFGH-JK24",
  "TIO-ABCD-EFGH-JK25",
];

test("batch creation retries duplicate generated hashes and persists unique codes", async () => {
  const repo = new InMemoryCommercialRepository();
  const generatedCodes = [
    RAW_CODES[0],
    RAW_CODES[0],
    RAW_CODES[1],
    RAW_CODES[2],
  ];
  const service = createService(repo, { generatedCodes });

  const result = await service.createAccessCodeBatch({
    name: "Unique batch",
    codeCount: 3,
    credits: 10,
    features: [],
  });

  assert.deepEqual(
    result.codes.map((code) => code.rawCode),
    [RAW_CODES[0], RAW_CODES[1], RAW_CODES[2]],
  );
  assert.equal(new Set(result.codes.map((code) => code.record.codeHash)).size, 3);
  assert.equal((await repo.listAccessCodesByBatch(result.batch.id)).length, 3);
});

test("batch creation fails without partial writes when generator cannot produce unique codes", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo, {
    generatedCodes: Array.from({ length: 100 }, () => RAW_CODES[0]),
  });

  await assert.rejects(
    service.createAccessCodeBatch({
      name: "Duplicate batch",
      codeCount: 2,
      credits: 10,
      features: [],
    }),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );

  assert.equal(await repo.getAccessCodeBatch("batch_1"), undefined);
  assert.deepEqual(await repo.listAccessCodesByBatch("batch_1"), []);
});

test("admin can create a batch and receive raw codes without storing raw values", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);

  const result = await service.createAccessCodeBatch({
    createdByUserId: "admin_1",
    name: "Launch batch",
    source: "campaign",
    codeCount: 2,
    credits: 25,
    tier: "pro",
    features: ["deep_mode", "priority_queue"],
    expiresAt: "2026-08-01T00:00:00.000Z",
    notes: "VIP launch",
    metadata: { channel: "email" },
  });

  assert.equal(result.batch.id, "batch_1");
  assert.equal(result.batch.createdByUserId, "admin_1");
  assert.equal(result.batch.name, "Launch batch");
  assert.equal(result.batch.source, "campaign");
  assert.equal(result.batch.codeCount, 2);
  assert.equal(result.batch.credits, 25);
  assert.equal(result.batch.tier, "pro");
  assert.deepEqual(result.batch.features, ["deep_mode", "priority_queue"]);
  assert.equal(result.batch.expiresAt, "2026-08-01T00:00:00.000Z");
  assert.equal(result.batch.notes, "VIP launch");
  assert.deepEqual(result.batch.metadata, { channel: "email" });
  assert.equal(result.batch.createdAt, CREATED_AT);
  assert.deepEqual(
    result.codes.map((code) => code.rawCode),
    RAW_CODES.slice(0, 2),
  );

  const storedCode = await repo.getAccessCode("access_code_2");
  assert.equal(storedCode?.codeHash, hashAccessCode(RAW_CODES[1], ACCESS_CODE_PEPPER));
  assert.equal(storedCode?.codeMask, maskAccessCode(RAW_CODES[1]));
  assert.equal(JSON.stringify(storedCode).includes(RAW_CODES[1]), false);
  assert.equal(JSON.stringify(await repo.getAccessCodeBatch("batch_1")).includes(RAW_CODES[0]), false);
});

test("creating codes records batch source, grants, features, and expirations", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);

  const result = await service.createSingleAccessCode({
    createdByUserId: "admin_1",
    source: "support",
    credits: 7,
    tier: "business",
    features: ["custom_model_provider"],
    expiresAt: "2026-09-01T00:00:00.000Z",
    metadata: { ticketId: "T-123" },
  });

  const batch = await repo.getAccessCodeBatch(result.record.batchId);
  const record = await repo.getAccessCode(result.record.id);

  assert.equal(batch?.name, "Single access code");
  assert.equal(batch?.source, "support");
  assert.equal(batch?.codeCount, 1);
  assert.equal(batch?.credits, 7);
  assert.equal(batch?.tier, "business");
  assert.deepEqual(batch?.features, ["custom_model_provider"]);
  assert.equal(batch?.expiresAt, "2026-09-01T00:00:00.000Z");
  assert.deepEqual(batch?.metadata, { ticketId: "T-123" });
  assert.equal(record?.status, "active");
  assert.equal(record?.credits, 7);
  assert.equal(record?.tier, "business");
  assert.deepEqual(record?.features, ["custom_model_provider"]);
  assert.equal(record?.expiresAt, "2026-09-01T00:00:00.000Z");
});

test("code lookup uses normalized hash and returns only redeemable active codes", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);
  const created = await service.createSingleAccessCode({
    createdByUserId: "admin_1",
    credits: 11,
    features: ["deep_mode"],
  });

  const found = await service.findRedeemableCode(" tio abcd efgh jk23 ");

  assert.equal(found?.id, created.record.id);
  assert.equal(found?.codeMask, "TIO-****-****-JK23");
  assert.equal(JSON.stringify(found).includes(created.rawCode), false);
});

test("disabled, expired, and redeemed codes cannot be redeemed", async () => {
  const disabled = await createLifecycleScenario();
  await disabled.service.disableAccessCode(
    disabled.records[0].id,
    "admin_1",
    { reason: "fraud" },
  );
  await assert.rejects(
    disabled.service.findRedeemableCode(disabled.rawCodes[0]),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );

  const expired = await createLifecycleScenario();
  await assert.rejects(
    expired.service.findRedeemableCode(expired.rawCodes[2]),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );

  const redeemed = await createLifecycleScenario();
  await redeemed.service.markRedeemed(redeemed.records[1].id, "user_1");
  await assert.rejects(
    redeemed.service.findRedeemableCode(redeemed.rawCodes[1]),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );
});

test("invalid stored expiration is not redeemable", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);
  const created = await service.createSingleAccessCode({
    credits: 10,
    features: [],
  });
  await repo.saveAccessCode({
    ...created.record,
    expiresAt: "not-a-date",
  });

  await assert.rejects(
    service.findRedeemableCode(created.rawCode),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );
  await assert.rejects(
    service.markRedeemed(created.record.id, "user_1"),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );
});

test("markRedeemed records redemption metadata without mutating credit balances", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo, {
    nowValues: [CREATED_AT, REDEEMED_AT],
  });
  const created = await service.createSingleAccessCode({
    credits: 13,
    tier: "pro",
    features: ["priority_queue"],
  });

  const redemption = await service.markRedeemed(
    created.record.id,
    "user_1",
    "ledger_1",
    { source: "checkout" },
  );
  const storedCode = await repo.getAccessCode(created.record.id);
  const storedRedemption = await repo.findAccessCodeRedemptionByCodeId(
    created.record.id,
  );

  assert.equal(storedCode?.status, "redeemed");
  assert.equal(storedCode?.redeemedByUserId, "user_1");
  assert.equal(storedCode?.redeemedAt, REDEEMED_AT);
  assert.deepEqual(redemption, {
    id: "access_code_redemption_1",
    accessCodeId: created.record.id,
    userId: "user_1",
    creditLedgerId: "ledger_1",
    credits: 13,
    tierGranted: "pro",
    featuresGranted: ["priority_queue"],
    redeemedAt: REDEEMED_AT,
    metadata: { source: "checkout" },
  });
  assert.deepEqual(storedRedemption, redemption);
  assert.equal(await repo.getCreditAccount("user_1"), undefined);
});

test("second redemption attempt is rejected without overwriting original redeemer", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo, {
    nowValues: [CREATED_AT, REDEEMED_AT, "2026-07-07T00:20:00.000Z"],
  });
  const created = await service.createSingleAccessCode({
    credits: 13,
    features: [],
  });

  await service.markRedeemed(created.record.id, "user_1");
  await assert.rejects(
    service.markRedeemed(created.record.id, "user_2"),
    (error) => hasServiceCode(error, "access_code_not_redeemable"),
  );

  const storedCode = await repo.getAccessCode(created.record.id);
  const redemption = await repo.findAccessCodeRedemptionByCodeId(
    created.record.id,
  );
  assert.equal(storedCode?.redeemedByUserId, "user_1");
  assert.equal(storedCode?.redeemedAt, REDEEMED_AT);
  assert.equal(redemption?.userId, "user_1");
});

test("batch disabling disables active codes and writes audit metadata", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo, {
    nowValues: [CREATED_AT, REDEEMED_AT],
  });
  const created = await service.createAccessCodeBatch({
    createdByUserId: "admin_1",
    name: "Disable me",
    source: "launch",
    codeCount: 3,
    credits: 5,
    features: [],
  });
  await service.markRedeemed(created.codes[1].record.id, "user_1");

  const disabled = await service.disableAccessCodeBatch("batch_1", "admin_2", {
    reason: "campaign ended",
  });
  const codes = await repo.listAccessCodesByBatch("batch_1");
  const auditLogs = await repo.listAdminAuditLogs();

  assert.equal(disabled.batch.disabledAt, REDEEMED_AT);
  assert.equal(codes[0]?.status, "disabled");
  assert.equal(codes[0]?.disabledAt, REDEEMED_AT);
  assert.equal(codes[1]?.status, "redeemed");
  assert.equal(codes[2]?.status, "disabled");
  assert.equal(auditLogs.length, 1);
  assert.deepEqual(auditLogs[0], {
    id: "admin_audit_log_1",
    actorUserId: "admin_2",
    action: "access_code_batch_disabled",
    targetType: "access_code_batch",
    targetId: "batch_1",
    metadata: {
      reason: "campaign ended",
      disabledCodeCount: 2,
    },
    createdAt: REDEEMED_AT,
  });
});

test("blank disable actors are rejected before mutations", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);
  const created = await service.createAccessCodeBatch({
    name: "Actors",
    codeCount: 1,
    credits: 5,
    features: [],
  });

  await assert.rejects(
    service.disableAccessCode(created.codes[0]!.record.id, "   "),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );
  await assert.rejects(
    service.disableAccessCodeBatch(created.batch.id, ""),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );

  assert.equal(
    (await repo.getAccessCode(created.codes[0]!.record.id))?.status,
    "active",
  );
  assert.equal((await repo.getAccessCodeBatch(created.batch.id))?.disabledAt, undefined);
  assert.deepEqual(await repo.listAdminAuditLogs(), []);
});

test("service reports invalid input and missing records with domain errors", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);

  await assert.rejects(
    service.createAccessCodeBatch({
      name: "Bad",
      codeCount: 0,
      credits: 1,
      features: [],
    }),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );
  await assert.rejects(
    service.createAccessCodeBatch({
      name: "Bad expiration",
      codeCount: 1,
      credits: 1,
      features: [],
      expiresAt: "not-a-date",
    }),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );
  await assert.rejects(
    service.createSingleAccessCode({
      credits: 1,
      features: [],
      expiresAt: "not-a-date",
    }),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );
  await assert.rejects(
    service.createAccessCodeBatch({
      name: "Zero credits",
      codeCount: 1,
      credits: 0,
      features: [],
    }),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );
  await assert.rejects(
    service.createAccessCodeBatch({
      name: "Fractional credits",
      codeCount: 1,
      credits: 1.5,
      features: [],
    }),
    (error) => hasServiceCode(error, "invalid_access_code_input"),
  );
  await assert.rejects(
    service.markRedeemed("missing", "user_1"),
    (error) => hasServiceCode(error, "access_code_not_found"),
  );
  await assert.rejects(
    service.disableAccessCodeBatch("missing", "admin_1"),
    (error) => hasServiceCode(error, "access_code_batch_not_found"),
  );
});

function createService(
  repository: CommercialRepository,
  options: {
    nowValues?: string[];
    generatedCodes?: string[];
  } = {},
): AccessCodeService {
  const idCounters = new Map<string, number>();
  let codeIndex = 0;
  let nowIndex = 0;
  const nowValues = options.nowValues ?? [CREATED_AT];
  const generatedCodes = options.generatedCodes ?? RAW_CODES;
  return new AccessCodeService({
    repository,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId: (prefix = "id") => {
      const nextId = (idCounters.get(prefix) ?? 0) + 1;
      idCounters.set(prefix, nextId);
      return `${prefix}_${nextId}`;
    },
    generateAccessCode: () => {
      const code = generatedCodes[codeIndex];
      codeIndex += 1;
      return code;
    },
    now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? CREATED_AT,
  });
}

async function createLifecycleScenario(): Promise<{
  service: AccessCodeService;
  rawCodes: string[];
  records: Awaited<
    ReturnType<AccessCodeService["createAccessCodeBatch"]>
  >["codes"][number]["record"][];
}> {
  const repo = new InMemoryCommercialRepository();
  const service = createService(repo);
  const batch = await service.createAccessCodeBatch({
    name: "Lifecycle",
    codeCount: 3,
    credits: 1,
    features: [],
  });
  await repo.saveAccessCode({
    ...batch.codes[2].record,
    expiresAt: EXPIRED_AT,
  });
  return {
    service,
    rawCodes: batch.codes.map((code) => code.rawCode),
    records: batch.codes.map((code) => code.record),
  };
}

function hasServiceCode(error: unknown, code: AccessCodeServiceError["code"]): boolean {
  return error instanceof AccessCodeServiceError && error.code === code;
}
