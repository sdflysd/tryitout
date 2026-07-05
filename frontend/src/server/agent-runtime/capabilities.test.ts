import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveAgentRuntimeCapabilities,
} from "./capabilities.js";

test("resolveAgentRuntimeCapabilities enables deep mode only when provider and flag are ready", () => {
  const result = resolveAgentRuntimeCapabilities({
    env: {
      ENABLE_AGENT_INTERACTION_MODE: "true",
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "key",
    },
  });

  assert.equal(result.deepModeAvailable, true);
  assert.equal(result.defaultInteractionMode, "enabled");
  assert.equal(result.providerConfigured, true);
  assert.equal(result.reason, "");
});

test("resolveAgentRuntimeCapabilities explains missing feature flag without leaking secrets", () => {
  const result = resolveAgentRuntimeCapabilities({
    env: {
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "secret-value",
    },
  });

  assert.equal(result.deepModeAvailable, false);
  assert.equal(result.defaultInteractionMode, "legacy");
  assert.equal(result.providerConfigured, true);
  assert.match(result.reason, /not enabled/i);
  assert.doesNotMatch(JSON.stringify(result), /secret-value/);
});

test("resolveAgentRuntimeCapabilities explains missing provider config", () => {
  const result = resolveAgentRuntimeCapabilities({
    env: {
      ENABLE_AGENT_INTERACTION_MODE: "true",
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "",
    },
  });

  assert.equal(result.deepModeAvailable, false);
  assert.equal(result.defaultInteractionMode, "legacy");
  assert.equal(result.providerConfigured, false);
  assert.match(result.reason, /provider/i);
});

test("runtime capabilities response is safe to send to clients", () => {
  const result = resolveAgentRuntimeCapabilities({
    env: {
      ENABLE_AGENT_INTERACTION_MODE: "false",
      AI_PROVIDER: "openai_compatible",
      OPENAI_COMPATIBLE_API_KEY: "secret-key",
      OPENAI_COMPATIBLE_BASE_URL: "https://example.test/v1",
    },
  });

  const serialized = JSON.stringify(result);

  assert.match(serialized, /deepModeAvailable/);
  assert.doesNotMatch(serialized, /secret-key/);
  assert.doesNotMatch(serialized, /example\.test/);
});
