import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCapabilities,
  ModelResolutionError,
  resolveModel,
} from "./model-router.js";
import { setConfiguredProviderForTesting } from "./provider-config.js";

test.afterEach(() => {
  setConfiguredProviderForTesting(undefined);
});

test("resolveModel returns the policy default when no selection is provided", () => {
  const profile = resolveModel(undefined, "side_hustle", "full_simulation");

  assert.equal(profile.id, "gemini_flash_deep");
  assert.equal(profile.defaults.quality, "deep");
});

test("resolveModel maps safe Phase 1 mode selections to server-owned defaults", () => {
  // Phase 1 mode selection chooses server-owned defaults instead of trusting caller-supplied profile metadata.
  assert.equal(
    resolveModel({ mode: "fast" }, "side_hustle", "full_simulation").id,
    "gemini_flash_fast",
  );
  assert.equal(
    resolveModel({ mode: "deep" }, "side_hustle", "full_simulation").id,
    "gemini_flash_deep",
  );
});

test("resolveModel maps mode selections to the configured backend provider", () => {
  setConfiguredProviderForTesting("anthropic");
  assert.equal(
    resolveModel({ mode: "balanced" }, "side_hustle", "full_simulation").id,
    "anthropic_sonnet_balanced",
  );

  setConfiguredProviderForTesting("openai_compatible");
  assert.equal(
    resolveModel({ mode: "balanced" }, "side_hustle", "full_simulation").id,
    "openai_compatible_balanced",
  );
});

test("resolveModel accepts visible platform profile selections", () => {
  const profile = resolveModel(
    { modelProfileId: "anthropic_sonnet_balanced" },
    "side_hustle",
    "full_simulation",
  );

  assert.equal(profile.id, "anthropic_sonnet_balanced");
  assert.equal(profile.visibleToUser, true);
});

test("resolveModel validates untrusted selections before resolving", () => {
  assert.throws(
    () =>
      resolveModel(
        { modelIdOverride: "gemini-3.5-flash" } as any,
        "side_hustle",
        "full_simulation",
      ),
    (error) =>
      error instanceof ModelResolutionError &&
      /modelIdOverride is not accepted/i.test(error.message),
  );
});

test("resolveModel rejects frontend metadata keys at the router boundary", () => {
  for (const key of ["baseUrl", "provider", "capabilities", "pricing"] as const) {
    assert.throws(
      () =>
        resolveModel(
          { mode: "fast", [key]: "client-value" } as any,
          "side_hustle",
          "full_simulation",
        ),
      (error) =>
        error instanceof ModelResolutionError &&
        new RegExp(`Unknown modelSelection key: ${key}`, "i").test(error.message),
      key,
    );
  }
});

test("resolveModel rejects an empty modelProfileId as a present malformed override", () => {
  assert.throws(
    () =>
      resolveModel(
        { modelProfileId: "" },
        "side_hustle",
        "full_simulation",
      ),
    (error) =>
      error instanceof ModelResolutionError &&
      /modelProfileId/i.test(error.message),
  );
});

test("resolveModel rejects invalid runtime step values with ModelResolutionError", () => {
  assert.throws(
    () => resolveModel(undefined, "side_hustle", "not_a_step" as any),
    (error) =>
      error instanceof ModelResolutionError &&
      /step/i.test(error.message),
  );
});

test("assertCapabilities passes matching requirements and rejects mismatches", () => {
  const profile = resolveModel({ mode: "balanced" }, "side_hustle", "full_simulation");

  assert.doesNotThrow(() =>
    assertCapabilities(profile, {
      supportsJsonMode: true,
      maxOutputTokens: 8_192,
    }),
  );

  assert.throws(
    () => assertCapabilities(profile, { supportsVision: true }),
    (error) =>
      error instanceof ModelResolutionError &&
      /supportsVision/i.test(error.message),
  );

  assert.throws(
    () => assertCapabilities(profile, { maxOutputTokens: 99_999 }),
    (error) =>
      error instanceof ModelResolutionError &&
      /maxOutputTokens/i.test(error.message),
  );
});

test("assertCapabilities fails closed for missing or non-numeric numeric capabilities", () => {
  const profile = resolveModel({ mode: "balanced" }, "side_hustle", "full_simulation");

  assert.throws(
    () =>
      assertCapabilities(
        {
          ...profile,
          capabilities: {
            ...profile.capabilities,
            maxOutputTokens: undefined,
          },
        } as any,
        { maxOutputTokens: 1 },
      ),
    (error) =>
      error instanceof ModelResolutionError &&
      /maxOutputTokens/i.test(error.message),
  );

  assert.throws(
    () =>
      assertCapabilities(
        {
          ...profile,
          capabilities: {
            ...profile.capabilities,
            maxInputTokens: "many",
          },
        } as any,
        { maxInputTokens: 1 },
      ),
    (error) =>
      error instanceof ModelResolutionError &&
      /maxInputTokens/i.test(error.message),
  );
});
