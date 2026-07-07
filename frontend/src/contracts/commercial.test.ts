import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_CODE_STATUSES,
  ADMIN_AUDIT_ACTIONS,
  COMMERCIAL_FEATURES,
  COMMERCIAL_TASK_STATUSES,
  CREDIT_LEDGER_ENTRY_TYPES,
  PROVIDER_MODES,
  SIMULATION_CREDIT_COSTS,
  USER_ROLES,
  USER_TIERS,
  getSimulationCreditCost,
  hasCommercialFeature,
  isAdminRole,
} from "./commercial.js";

test("commercial constants expose platform account, credit, task, and audit states", () => {
  assert.deepEqual(USER_ROLES, ["user", "admin", "owner"]);
  assert.deepEqual(USER_TIERS, ["basic", "pro", "business"]);
  assert.deepEqual(PROVIDER_MODES, ["platform", "byok"]);
  assert.deepEqual(ACCESS_CODE_STATUSES, ["active", "redeemed", "disabled", "expired"]);
  assert.deepEqual(CREDIT_LEDGER_ENTRY_TYPES, [
    "redeem",
    "hold",
    "capture",
    "release",
    "refund",
    "adjustment",
  ]);
  assert.deepEqual(COMMERCIAL_TASK_STATUSES, [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "refunded",
  ]);
  assert.deepEqual(ADMIN_AUDIT_ACTIONS, [
    "access_code_batch_created",
    "access_code_batch_disabled",
    "access_code_batch_exported",
    "access_code_disabled",
    "user_credit_adjusted",
    "credits_adjusted",
    "task_refunded",
    "task_retried",
    "task_cancelled",
    "user_disabled",
    "user_restored",
    "user_tier_changed",
    "sensitive_report_viewed",
    "system_setting_updated",
    "queue_paused",
    "queue_resumed",
  ]);
});

test("simulation credit costs distinguish platform and BYOK deep mode", () => {
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "platform" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "platform" }), 3);
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "byok" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "byok" }), 2);
  assert.deepEqual(SIMULATION_CREDIT_COSTS.platform, { legacy: 1, enabled: 3 });
});

test("feature and admin helpers read commercial entitlement state", () => {
  assert.equal(hasCommercialFeature({ tier: "basic", features: [] }, "custom_model_provider"), false);
  assert.equal(hasCommercialFeature({ tier: "pro", features: ["custom_model_provider"] }, "custom_model_provider"), true);
  assert.equal(isAdminRole("user"), false);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("owner"), true);
});

test("commercial features include platform operations flags", () => {
  assert.deepEqual(COMMERCIAL_FEATURES, [
    "deep_mode",
    "priority_queue",
    "custom_model_provider",
    "admin_ops",
  ]);
});
