import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_CODE_STATUSES,
  COMMERCIAL_TASK_STATUSES,
  CREDIT_LEDGER_ENTRY_TYPES,
  SIMULATION_CREDIT_COSTS,
  USER_TIERS,
  getSimulationCreditCost,
  hasCommercialFeature,
} from "./commercial.js";

test("commercial constants expose MVP account and credit states", () => {
  assert.deepEqual(USER_TIERS, ["basic", "pro", "business"]);
  assert.deepEqual(ACCESS_CODE_STATUSES, ["active", "redeemed", "disabled", "expired"]);
  assert.deepEqual(COMMERCIAL_TASK_STATUSES, [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "refunded",
  ]);
  assert.deepEqual(CREDIT_LEDGER_ENTRY_TYPES, [
    "redeem",
    "hold",
    "capture",
    "release",
    "adjustment",
  ]);
});

test("simulation credit costs distinguish platform and BYOK deep mode", () => {
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "platform" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "platform" }), 3);
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "byok" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "byok" }), 2);
  assert.deepEqual(SIMULATION_CREDIT_COSTS.platform, { legacy: 1, enabled: 3 });
});

test("hasCommercialFeature reads tier feature flags", () => {
  assert.equal(hasCommercialFeature({ tier: "basic", features: [] }, "custom_model_provider"), false);
  assert.equal(
    hasCommercialFeature({ tier: "pro", features: ["custom_model_provider"] }, "custom_model_provider"),
    true,
  );
});
