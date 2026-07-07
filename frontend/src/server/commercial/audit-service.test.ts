import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminAuditService,
  AdminAuditServiceError,
  type AppendAdminAuditInput,
  assertAuditAction,
} from "./audit-service.js";
import { InMemoryCommercialRepository } from "./repository.js";

const CREATED_AT = "2026-07-07T00:00:00.000Z";

test("appends audit log for access-code batch creation", async () => {
  const { repo, service } = createScenario();

  const log = await service.append({
    actorUserId: "admin_1",
    action: "access_code_batch_created",
    targetType: "access_code_batch",
    targetId: "batch_1",
    metadata: {
      name: "Founding members",
      source: "launch_campaign",
      codeCount: 100,
      credits: 25,
      tier: "pro",
      features: ["priority_queue"],
      expiresAt: "2026-08-01T00:00:00.000Z",
    },
    ipHash: "ip_hash_1",
    userAgent: "Mozilla/5.0",
  });

  assert.deepEqual(log, {
    id: "admin_audit_log_1",
    actorUserId: "admin_1",
    action: "access_code_batch_created",
    targetType: "access_code_batch",
    targetId: "batch_1",
    metadata: {
      name: "Founding members",
      source: "launch_campaign",
      codeCount: 100,
      credits: 25,
      tier: "pro",
      features: ["priority_queue"],
      expiresAt: "2026-08-01T00:00:00.000Z",
    },
    ipHash: "ip_hash_1",
    userAgent: "Mozilla/5.0",
    createdAt: CREATED_AT,
  });
  assert.deepEqual(await repo.listAdminAuditLogs(), [log]);
});

test("appends audit log for credit adjustment", async () => {
  const { repo, service } = createScenario();

  const log = await service.append({
    actorUserId: "admin_1",
    action: "credits_adjusted",
    targetType: "user",
    targetId: "user_1",
    metadata: {
      amount: -3,
      reason: "manual_correction",
      creditLedgerId: "credit_ledger_1",
      previousBalance: 10,
      nextBalance: 7,
    },
    ipHash: "ip_hash_2",
    userAgent: "AdminConsole/1.0",
  });

  assert.equal(log.action, "credits_adjusted");
  assert.equal(log.targetType, "user");
  assert.equal(log.targetId, "user_1");
  assert.deepEqual(log.metadata, {
    amount: -3,
    reason: "manual_correction",
    creditLedgerId: "credit_ledger_1",
    previousBalance: 10,
    nextBalance: 7,
  });
  assert.deepEqual(await repo.listAdminAuditLogs(), [log]);
});

test("captures actor, target, request context, and copies metadata", async () => {
  const { repo, service } = createScenario();
  const metadata = {
    reason: "support_refund",
    amount: 4,
    steps: ["capture", "refund"],
    nested: { source: "support" },
  };

  const log = await service.append({
    actorUserId: " owner_1 ",
    action: "task_refunded",
    targetType: " task ",
    targetId: " task_1 ",
    metadata,
    ipHash: " ip_hash_3 ",
    userAgent: " SupportDesk/2.0 ",
  });
  metadata.reason = "mutated_after_append";
  metadata.steps.push("mutated");
  metadata.nested.source = "mutated";

  assert.deepEqual(log, {
    id: "admin_audit_log_1",
    actorUserId: "owner_1",
    action: "task_refunded",
    targetType: "task",
    targetId: "task_1",
    metadata: {
      reason: "support_refund",
      amount: 4,
      steps: ["capture", "refund"],
      nested: { source: "support" },
    },
    ipHash: "ip_hash_3",
    userAgent: "SupportDesk/2.0",
    createdAt: CREATED_AT,
  });
  assert.deepEqual((await repo.listAdminAuditLogs())[0], log);
});

test("supports all database-backed audit actions", async () => {
  const { service } = createScenario();

  const log = await service.append({
    actorUserId: "owner_1",
    action: "system_setting_updated",
    targetType: "system_setting",
    targetId: "commercial.queue.paused",
    metadata: { previousValue: false, nextValue: true },
  });

  assert.equal(log.action, "system_setting_updated");
  assert.equal(assertAuditAction("access_code_batch_exported"), "access_code_batch_exported");
  assert.equal(assertAuditAction("queue_paused"), "queue_paused");
});

test("rejects unknown audit actions", () => {
  assert.throws(
    () => assertAuditAction("billing_plan_deleted"),
    (error) => hasAuditCode(error, "invalid_audit_action"),
  );
});

test("rejects target types that do not match the action contract", async () => {
  const { service } = createScenario();

  await assert.rejects(
    service.append({
      actorUserId: "admin_1",
      action: "credits_adjusted",
      targetType: "access_code_batch",
      targetId: "batch_1",
      metadata: {},
    }),
    (error) => hasAuditCode(error, "invalid_audit_target"),
  );
});

test("rejects missing audit target ids", async () => {
  const { service } = createScenario();

  await assert.rejects(
    service.append({
      actorUserId: "admin_1",
      action: "credits_adjusted",
      targetType: "user",
      metadata: {},
    } as unknown as AppendAdminAuditInput),
    (error) => hasAuditCode(error, "invalid_audit_input"),
  );
});

function createScenario(): {
  repo: InMemoryCommercialRepository;
  service: AdminAuditService;
} {
  const repo = new InMemoryCommercialRepository();
  const ids = new TestIds();
  const service = new AdminAuditService({
    repository: repo,
    now: () => CREATED_AT,
    createId: (prefix = "id") => ids.create(prefix),
  });
  return { repo, service };
}

function hasAuditCode(
  error: unknown,
  code: AdminAuditServiceError["code"],
): boolean {
  return error instanceof AdminAuditServiceError && error.code === code;
}

class TestIds {
  private readonly counters = new Map<string, number>();

  create(prefix = "id"): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next}`;
  }
}
