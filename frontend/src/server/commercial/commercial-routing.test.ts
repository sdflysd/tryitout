import assert from "node:assert/strict";
import test from "node:test";

import {
  isCommercialModeEnabled,
  resolveSimulationTaskRouteMode,
  shouldBlockLegacySimulationRoute,
} from "./commercial-routing.js";

test("demo mode allows existing file-backed simulation routes", () => {
  const env = { COMMERCIAL_MODE_ENABLED: "false" };

  assert.equal(isCommercialModeEnabled(env), false);
  assert.equal(shouldBlockLegacySimulationRoute("/api/simulations", env), false);
  assert.equal(
    shouldBlockLegacySimulationRoute("/api/simulations/stream", env),
    false,
  );
  assert.equal(resolveSimulationTaskRouteMode(env), "demo_file_task");
});

test("commercial mode rejects unauthenticated legacy simulation routes", () => {
  const env = { COMMERCIAL_MODE_ENABLED: "true" };

  assert.equal(isCommercialModeEnabled(env), true);
  assert.equal(shouldBlockLegacySimulationRoute("/api/simulations", env), true);
  assert.equal(
    shouldBlockLegacySimulationRoute("/api/simulations/stream", env),
    true,
  );
});

test("commercial mode does not block unrelated API routes", () => {
  const env = { COMMERCIAL_MODE_ENABLED: "true" };

  assert.equal(shouldBlockLegacySimulationRoute("/api/health", env), false);
  assert.equal(shouldBlockLegacySimulationRoute("/api/simulation-tasks", env), false);
});

test("commercial mode routes simulation tasks through commercial task creation", () => {
  assert.equal(
    resolveSimulationTaskRouteMode({ COMMERCIAL_MODE_ENABLED: "true" }),
    "commercial_task",
  );
});
