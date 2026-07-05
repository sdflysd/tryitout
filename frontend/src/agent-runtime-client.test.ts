import test from "node:test";
import assert from "node:assert/strict";

import { fetchAgentRuntimeCapabilities } from "./agent-runtime-client.js";

test("fetchAgentRuntimeCapabilities reads capability endpoint", async () => {
  const calls: string[] = [];
  const result = await fetchAgentRuntimeCapabilities(async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      deepModeAvailable: true,
      defaultInteractionMode: "enabled",
      fallbackPolicy: "safe_stage_fallback",
      providerConfigured: true,
      reason: "",
    }));
  });

  assert.deepEqual(calls, ["/api/agent-runtime/capabilities"]);
  assert.equal(result.deepModeAvailable, true);
});

test("fetchAgentRuntimeCapabilities falls back to safe legacy capabilities", async () => {
  const result = await fetchAgentRuntimeCapabilities(async () => {
    throw new Error("offline");
  });

  assert.equal(result.deepModeAvailable, false);
  assert.equal(result.defaultInteractionMode, "legacy");
});
