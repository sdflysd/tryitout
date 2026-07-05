import assert from "node:assert/strict";
import test from "node:test";

import {
  createProviderAdapters,
  getConfiguredProvider,
  getProviderProfileIdForMode,
  readOpenAiCompatibleConfig,
} from "./provider-config.js";

test("getConfiguredProvider defaults to gemini and accepts known providers", () => {
  assert.equal(getConfiguredProvider({}), "gemini");
  assert.equal(getConfiguredProvider({ AI_PROVIDER: "anthropic" }), "anthropic");
  assert.equal(
    getConfiguredProvider({ AI_PROVIDER: "openai_compatible" }),
    "openai_compatible",
  );
});

test("getConfiguredProvider rejects unknown providers", () => {
  assert.throws(
    () => getConfiguredProvider({ AI_PROVIDER: "client-provider" }),
    /AI_PROVIDER must be gemini, anthropic, or openai_compatible/i,
  );
});

test("getProviderProfileIdForMode maps configured provider to server-owned profiles", () => {
  assert.equal(
    getProviderProfileIdForMode("gemini", "balanced"),
    "gemini_flash_balanced",
  );
  assert.equal(
    getProviderProfileIdForMode("anthropic", "fast"),
    "anthropic_haiku_fast",
  );
  assert.equal(
    getProviderProfileIdForMode("openai_compatible", "deep"),
    "openai_compatible_deep",
  );
});

test("readOpenAiCompatibleConfig trims base URL and keeps it server-side", () => {
  const config = readOpenAiCompatibleConfig({
    OPENAI_COMPATIBLE_API_KEY: "test-key",
    OPENAI_COMPATIBLE_BASE_URL: " https://llm.example/v1/ ",
    OPENAI_COMPATIBLE_MODEL_FAST: "fast-model",
    OPENAI_COMPATIBLE_MODEL_BALANCED: "balanced-model",
    OPENAI_COMPATIBLE_MODEL_DEEP: "deep-model",
  });

  assert.deepEqual(config, {
    apiKey: "test-key",
    baseUrl: "https://llm.example/v1",
    models: {
      fast: "fast-model",
      balanced: "balanced-model",
      deep: "deep-model",
    },
  });
});

test("createProviderAdapters registers configured provider adapters only when keys are present", () => {
  const adapters = createProviderAdapters({
    GEMINI_API_KEY: "gemini-key",
    ANTHROPIC_API_KEY: "anthropic-key",
    OPENAI_COMPATIBLE_API_KEY: "openai-key",
    OPENAI_COMPATIBLE_BASE_URL: "https://llm.example/v1",
  });

  assert.deepEqual(
    adapters.map((adapter) => adapter.provider).sort(),
    ["anthropic", "gemini", "openai_compatible"],
  );
});
