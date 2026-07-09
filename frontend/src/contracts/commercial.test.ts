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
  resolveCommercialEntitlements,
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
    "access_code_restored",
    "access_code_deleted",
    "access_codes_bulk_disabled",
    "access_codes_bulk_restored",
    "access_codes_bulk_deleted",
    "user_credit_adjusted",
    "credits_adjusted",
    "user_created",
    "task_refunded",
    "task_retried",
    "task_cancelled",
    "user_updated",
    "user_disabled",
    "user_restored",
    "user_deleted",
    "user_tier_changed",
    "sensitive_report_viewed",
    "platform_model_provider_saved",
    "platform_model_provider_tested",
    "platform_model_provider_models_listed",
    "platform_model_profiles_updated",
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

test("commercial entitlements resolve highest active tier and active feature union", () => {
  const entitlements = resolveCommercialEntitlements(
    { tier: "basic", features: ["priority_queue"] },
    [
      {
        tier: "business",
        features: ["custom_model_provider"],
        startsAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-10T00:00:00.000Z",
      },
      {
        tier: "pro",
        features: ["deep_mode"],
        startsAt: "2026-07-05T00:00:00.000Z",
        expiresAt: "2026-08-05T00:00:00.000Z",
      },
      {
        tier: "business",
        features: ["admin_ops"],
        startsAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    "2026-07-09T00:00:00.000Z",
  );

  assert.equal(entitlements.tier, "business");
  assert.deepEqual(entitlements.features, [
    "priority_queue",
    "custom_model_provider",
    "deep_mode",
  ]);
});

test("commercial entitlements fall back after higher grant expires", () => {
  const entitlements = resolveCommercialEntitlements(
    { tier: "basic", features: [] },
    [
      {
        tier: "business",
        features: ["custom_model_provider"],
        startsAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-10T00:00:00.000Z",
      },
      {
        tier: "pro",
        features: ["deep_mode"],
        startsAt: "2026-07-05T00:00:00.000Z",
        expiresAt: "2026-08-05T00:00:00.000Z",
      },
    ],
    "2026-07-11T00:00:00.000Z",
  );

  assert.equal(entitlements.tier, "pro");
  assert.deepEqual(entitlements.features, ["deep_mode"]);
});

test("commercial features include platform operations flags", () => {
  assert.deepEqual(COMMERCIAL_FEATURES, [
    "deep_mode",
    "priority_queue",
    "custom_model_provider",
    "admin_ops",
  ]);
});
