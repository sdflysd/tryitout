import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMERCIAL_SESSION_COOKIE_NAME,
  extractCommercialSessionToken,
  isCommercialModeEnabled,
  resolveCommercialSimulationRoute,
} from "./commercial-mode-routing.js";

test("non-commercial mode keeps legacy simulation task routes file-backed", () => {
  assert.equal(
    resolveCommercialSimulationRoute({
      commercialModeEnabled: false,
      method: "POST",
      path: "/api/simulation-tasks",
      sessionToken: undefined,
    }).kind,
    "legacy",
  );
});

test("commercial mode rejects unauthenticated legacy simulation entry points", () => {
  for (const path of [
    "/api/simulation-tasks",
    "/api/simulations",
    "/api/simulations/stream",
  ]) {
    assert.deepEqual(
      resolveCommercialSimulationRoute({
        commercialModeEnabled: true,
        method: "POST",
        path,
        sessionToken: undefined,
      }),
      { kind: "reject", status: 401, error: "auth_required" },
    );
  }
});

test("commercial mode routes authenticated task creation through paid task handling", () => {
  assert.deepEqual(
    resolveCommercialSimulationRoute({
      commercialModeEnabled: true,
      method: "POST",
      path: "/api/simulation-tasks",
      sessionToken: "sess_123",
    }),
    {
      kind: "commercial_task",
      requiresCredits: true,
      sessionToken: "sess_123",
    },
  );
});

test("commercial mode disables direct synchronous and streaming simulations", () => {
  for (const path of ["/api/simulations", "/api/simulations/stream"]) {
    assert.deepEqual(
      resolveCommercialSimulationRoute({
        commercialModeEnabled: true,
        method: "POST",
        path,
        sessionToken: "sess_123",
      }),
      {
        kind: "reject",
        status: 410,
        error: "commercial_task_required",
      },
    );
  }
});

test("commercial mode helper reads env and session cookies conservatively", () => {
  assert.equal(isCommercialModeEnabled({ COMMERCIAL_MODE_ENABLED: "true" }), true);
  assert.equal(isCommercialModeEnabled({ COMMERCIAL_MODE_ENABLED: "1" }), true);
  assert.equal(isCommercialModeEnabled({ COMMERCIAL_MODE_ENABLED: "false" }), false);
  assert.equal(
    extractCommercialSessionToken(
      `theme=dark; ${COMMERCIAL_SESSION_COOKIE_NAME}=abc%20123; other=1`,
    ),
    "abc 123",
  );
});
