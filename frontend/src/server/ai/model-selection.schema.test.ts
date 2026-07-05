import assert from "node:assert/strict";
import test from "node:test";

import {
  getDefaultProfileForMode,
  getModelProfile,
  listVisibleModelProfiles,
} from "./model-profiles.js";
import { getPolicyForScenario } from "./model-policy.js";
import { validateModelSelection } from "./model-selection.schema.js";
import { setConfiguredProviderForTesting } from "./provider-config.js";

test.afterEach(() => {
  setConfiguredProviderForTesting(undefined);
});

test("validateModelSelection accepts empty and controlled selection keys", () => {
  assert.deepEqual(validateModelSelection(undefined), { ok: true, value: {} });
  assert.deepEqual(validateModelSelection(null), { ok: true, value: {} });

  const result = validateModelSelection({
    mode: "deep",
    modelProfileId: "gemini_flash_deep",
    userCredentialId: "cred_123",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      mode: "deep",
      modelProfileId: "gemini_flash_deep",
      userCredentialId: "cred_123",
      modelIdOverride: undefined,
    },
  });
});

test("validateModelSelection rejects frontend metadata and malformed overrides", () => {
  for (const key of [
    "baseUrl",
    "provider",
    "capabilities",
    "pricing",
    "metadata",
  ]) {
    const result = validateModelSelection({ mode: "fast", [key]: "x" });
    assert.equal(result.ok, false, key);
    if (!result.ok) {
      assert.match(result.error, /unknown/i);
    }
  }

  assert.equal(validateModelSelection({ mode: "turbo" }).ok, false);
  assert.equal(validateModelSelection({ userCredentialId: 42 }).ok, false);
  assert.equal(validateModelSelection({ modelProfileId: "" }).ok, false);
  assert.equal(validateModelSelection({ modelIdOverride: "gemini-3.5-flash" }).ok, false);
  assert.equal(validateModelSelection({ modelIdOverride: "bad model id" }).ok, false);
});

test("model profiles expose server-owned modes for all configured backend providers", () => {
  assert.equal(getModelProfile("gemini_flash_balanced")?.modelId, "gemini-3.5-flash");
  assert.equal(getDefaultProfileForMode("fast").id, "gemini_flash_fast");
  assert.equal(getDefaultProfileForMode("balanced").id, "gemini_flash_balanced");
  assert.equal(getDefaultProfileForMode("deep").id, "gemini_flash_deep");

  assert.deepEqual(
    listVisibleModelProfiles().map((profile) => profile.id).sort(),
    [
      "anthropic_haiku_fast",
      "anthropic_sonnet_balanced",
      "anthropic_sonnet_deep",
      "gemini_flash_balanced",
      "gemini_flash_deep",
      "gemini_flash_fast",
      "openai_compatible_balanced",
      "openai_compatible_deep",
      "openai_compatible_fast",
    ].sort(),
  );
});

test("default mode profiles follow the server configured provider", () => {
  setConfiguredProviderForTesting("anthropic");
  assert.equal(getDefaultProfileForMode("balanced").id, "anthropic_sonnet_balanced");

  setConfiguredProviderForTesting("openai_compatible");
  assert.equal(getDefaultProfileForMode("balanced").id, "openai_compatible_balanced");
  assert.equal(getDefaultProfileForMode("balanced").provider, "openai_compatible");
});

test("scenario policies share the planned step defaults", () => {
  for (const scenarioType of ["side_hustle", "dating", "life_choice"] as const) {
    const policy = getPolicyForScenario(scenarioType);

    assert.equal(policy.scenarioType, scenarioType);
    assert.equal(policy.steps.full_simulation.modelProfileId, "gemini_flash_deep");
    assert.equal(policy.steps.full_simulation.maxOutputTokens, 16_384);
    assert.equal(policy.steps.full_simulation.maxRetries, 1);
    assert.equal(policy.steps.generate_report.maxRetries, 1);
    assert.equal(policy.steps.generate_world_event.modelProfileId, "gemini_flash_fast");
    assert.equal(policy.steps.generate_world_event.maxOutputTokens, 2_048);
    assert.equal(policy.steps.generate_world_event.timeoutMs, 30_000);
    assert.equal(policy.steps.generate_agent_actions.modelProfileId, "gemini_flash_balanced");
    assert.equal(policy.steps.generate_agent_actions.maxOutputTokens, 8_192);
    assert.equal(policy.steps.generate_agent_actions.timeoutMs, 150_000);
    assert.equal(policy.steps.generate_agent_actions.maxRetries, 1);
    assert.equal(policy.steps.arbitrate_stage.modelProfileId, "gemini_flash_balanced");
    assert.equal(policy.steps.arbitrate_stage.maxOutputTokens, 4_096);
    assert.equal(policy.steps.arbitrate_stage.timeoutMs, 45_000);
    assert.equal(policy.steps.safety_check.modelProfileId, "gemini_flash_fast");
    assert.equal(policy.steps.safety_check.timeoutMs, 20_000);
  }
});

test("long-report policies select profiles that satisfy output ceilings for every provider", () => {
  for (const provider of ["gemini", "anthropic", "openai_compatible"] as const) {
    setConfiguredProviderForTesting(provider);

    for (const scenarioType of ["side_hustle", "dating", "life_choice"] as const) {
      const policy = getPolicyForScenario(scenarioType);

      for (const stepName of ["full_simulation", "generate_report"] as const) {
        const stepConfig = policy.steps[stepName];
        const profile = getModelProfile(stepConfig.modelProfileId);

        assert.ok(profile, `${provider}.${scenarioType}.${stepName} missing profile`);
        assert.ok(
          stepConfig.maxOutputTokens <= profile.capabilities.maxOutputTokens,
          `${provider}.${scenarioType}.${stepName} requests ${stepConfig.maxOutputTokens} beyond ${profile.id}`,
        );
      }
    }
  }
});

test("scenario policies reference profiles that can satisfy output ceilings", () => {
  for (const scenarioType of ["side_hustle", "dating", "life_choice"] as const) {
    const policy = getPolicyForScenario(scenarioType);

    for (const [stepName, stepConfig] of Object.entries(policy.steps)) {
      const profile = getModelProfile(stepConfig.modelProfileId);

      assert.ok(
        profile,
        `${scenarioType}.${stepName} references unknown profile ${stepConfig.modelProfileId}`,
      );
      assert.ok(
        stepConfig.maxOutputTokens <= profile.limits.maxOutputTokens,
        `${scenarioType}.${stepName} requests ${stepConfig.maxOutputTokens} tokens beyond ${profile.id} limit ${profile.limits.maxOutputTokens}`,
      );
      assert.ok(
        stepConfig.maxOutputTokens <= profile.capabilities.maxOutputTokens,
        `${scenarioType}.${stepName} requests ${stepConfig.maxOutputTokens} tokens beyond ${profile.id} capability ${profile.capabilities.maxOutputTokens}`,
      );
    }
  }
});
