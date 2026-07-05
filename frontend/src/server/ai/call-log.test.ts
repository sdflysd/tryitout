import assert from "node:assert/strict";
import test from "node:test";

import type { AiCallRequest, AiCallResult } from "./types.js";
import { createLogEntry, hashPrompt } from "./call-log.js";
import { getDefaultProfileForMode } from "./model-profiles.js";

function makeRequest(overrides: Partial<AiCallRequest> = {}): AiCallRequest {
  return {
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelProfile: getDefaultProfileForMode("fast"),
    generationConfig: {
      maxOutputTokens: 4_096,
      timeoutMs: 30_000,
      maxRetries: 3,
    },
    systemPrompt: "secret system prompt",
    userPrompt: "private user prompt",
    responseFormat: "json",
    metadata: {
      simulationId: "sim-1",
      userId: "user-1",
    },
    ...overrides,
  };
}

function makeResult(overrides: Partial<AiCallResult> = {}): AiCallResult {
  return {
    data: { ok: true },
    provider: "gemini",
    modelId: "gemini-3.5-flash",
    modelProfileId: "gemini_flash_fast",
    usage: {
      inputTokens: 11,
      outputTokens: 22,
    },
    latencyMs: 33,
    requestId: "request-1",
    ...overrides,
  };
}

test("hashPrompt is deterministic, bounded, and does not expose prompt text", () => {
  const prompt = "very private input";

  assert.equal(hashPrompt(prompt), hashPrompt(prompt));
  assert.match(hashPrompt(prompt), /^[a-f0-9]{16}$/);
  assert.notEqual(hashPrompt(prompt), prompt);
});

test("createLogEntry records safe success metadata without prompt contents", () => {
  const request = makeRequest();
  const result = makeResult();
  const entry = createLogEntry(
    request,
    result,
    undefined,
    `${request.systemPrompt}\n${request.userPrompt}`,
  );

  assert.equal(entry.provider, "gemini");
  assert.equal(entry.modelProfileId, "gemini_flash_fast");
  assert.equal(entry.modelId, "gemini-3.5-flash");
  assert.equal(entry.step, "parse_scenario");
  assert.equal(entry.scenarioType, "side_hustle");
  assert.equal(entry.inputTokens, 11);
  assert.equal(entry.outputTokens, 22);
  assert.equal(entry.latencyMs, 33);
  assert.equal(entry.success, true);
  assert.equal(entry.requestId, "request-1");
  assert.equal(entry.simulationId, hashPrompt("sim-1"));
  assert.equal(entry.userId, hashPrompt("user-1"));
  assert.notEqual(entry.simulationId, "sim-1");
  assert.notEqual(entry.userId, "user-1");
  assert.equal(entry.errorCode, undefined);
  assert.equal(entry.errorMessage, undefined);
  assert.equal(entry.promptHash, hashPrompt("secret system prompt\nprivate user prompt"));

  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /secret system prompt/);
  assert.doesNotMatch(serialized, /private user prompt/);
  assert.doesNotMatch(serialized, /sim-1/);
  assert.doesNotMatch(serialized, /user-1/);
  assert.doesNotMatch(serialized, /systemPrompt|userPrompt/);
});

test("createLogEntry includes numeric stage metadata for step-level diagnosis", () => {
  const request = makeRequest({
    step: "simulate_stage",
    metadata: {
      simulationId: "sim-1",
      stageIndex: 3,
    },
  });

  const entry = createLogEntry(request, makeResult(), undefined, "private prompt");

  assert.equal(entry.step, "simulate_stage");
  assert.equal(entry.stageIndex, 3);
});

test("createLogEntry records classified provider errors without raw messages or stack traces", () => {
  const request = makeRequest({
    systemPrompt: "sys",
    userPrompt: "short",
  });
  const error = new Error(
    "timeout for short prompt with key sk-test-1234567890abcdef",
  );
  Object.assign(error, { code: "ETIMEDOUT" });
  error.stack = "stack should not be logged";

  const entry = createLogEntry(request, undefined, error, "sys\nshort");

  assert.equal(entry.success, false);
  assert.equal(entry.provider, "gemini");
  assert.equal(entry.modelProfileId, "gemini_flash_fast");
  assert.equal(entry.modelId, "gemini-3.5-flash");
  assert.equal(entry.errorCode, "ETIMEDOUT");
  assert.equal(entry.errorMessage, "AI provider timeout");

  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /timeout for short prompt/);
  assert.doesNotMatch(serialized, /short/);
  assert.doesNotMatch(serialized, /sk-test-1234567890abcdef/);
  assert.doesNotMatch(serialized, /stack should not be logged/);
  assert.doesNotMatch(serialized, /systemPrompt|userPrompt/);
});

test("createLogEntry omits unsafe error codes", () => {
  const request = makeRequest();
  const error = new Error("provider error");
  Object.assign(error, { code: "sk-test-1234567890abcdef" });

  const entry = createLogEntry(request, undefined, error, "private prompt");

  assert.equal(entry.errorCode, undefined);
  assert.equal(entry.errorMessage, "AI provider error");

  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /sk-test-1234567890abcdef/);
});
