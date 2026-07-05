import assert from "node:assert/strict";
import test from "node:test";

import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";

import { GeminiAdapter } from "./gemini.adapter.js";
import type { AiCallRequest, ModelProfile } from "../types.js";

const modelProfile: ModelProfile = {
  id: "gemini_test_profile",
  name: "Gemini Test",
  provider: "gemini",
  displayName: "Test",
  modelId: "gemini-test-model",
  visibleToUser: false,
  allowUserModelOverride: false,
  allowUserApiKey: false,
  allowCustomBaseUrl: false,
  capabilities: {
    supportsJsonMode: true,
    supportsStructuredOutput: true,
    supportsStreaming: false,
    supportsVision: false,
    supportsToolUse: false,
    supportsSystemPrompt: true,
    supportsReasoningEffort: false,
    supportsThinking: false,
    maxInputTokens: 1_000,
    maxOutputTokens: 400,
    recommendedForLongReport: false,
    recommendedForFastTasks: true,
    recommendedForDeepSimulation: false,
  },
  defaults: {
    maxOutputTokens: 800,
    quality: "fast",
    responseFormat: "json",
    stream: false,
    timeoutMs: 5_000,
    maxRetries: 1,
  },
  limits: {
    maxInputChars: 10_000,
    maxOutputTokens: 600,
  },
  status: "active",
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

function makeRequest(overrides: Partial<AiCallRequest> = {}): AiCallRequest {
  return {
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelProfile,
    generationConfig: {
      maxOutputTokens: 400,
      timeoutMs: 5_000,
      maxRetries: 1,
    },
    systemPrompt: "system",
    userPrompt: "user",
    responseFormat: "json",
    metadata: {},
    ...overrides,
  };
}

function makeClient(responseText: string, calls: GenerateContentParameters[]) {
  return {
    models: {
      async generateContent(
        params: GenerateContentParameters,
      ): Promise<GenerateContentResponse> {
        calls.push(params);

        return {
          text: responseText,
          responseId: "response-1",
          candidates: [{ finishReason: "STOP" }],
          usageMetadata: {
            promptTokenCount: 11,
            candidatesTokenCount: 22,
            totalTokenCount: 33,
            cachedContentTokenCount: 4,
          },
        } as GenerateContentResponse;
      },
    },
  };
}

test("GeminiAdapter parses plain JSON responses and maps request and usage metadata", async () => {
  const calls: GenerateContentParameters[] = [];
  const adapter = new GeminiAdapter("test-key", {
    client: makeClient('{"ok":true}', calls),
  });

  const result = await adapter.generateJson<{ ok: boolean }>(makeRequest());

  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.rawText, '{"ok":true}');
  assert.equal(result.provider, "gemini");
  assert.equal(result.modelId, "gemini-test-model");
  assert.equal(result.modelProfileId, "gemini_test_profile");
  assert.equal(result.requestId, "response-1");
  assert.equal(result.stopReason, "STOP");
  assert.deepEqual(result.usage, {
    inputTokens: 11,
    outputTokens: 22,
    totalTokens: 33,
    cacheReadTokens: 4,
  });
  assert.equal(calls[0]?.model, "gemini-test-model");
  assert.equal(calls[0]?.contents, "user");
  assert.equal(calls[0]?.config?.systemInstruction, "system");
  assert.equal(calls[0]?.config?.responseMimeType, "application/json");
});

test("GeminiAdapter cleans fenced JSON before parsing", async () => {
  const calls: GenerateContentParameters[] = [];
  const adapter = new GeminiAdapter("test-key", {
    client: makeClient('```json\n{"ok":true}\n```', calls),
  });

  const result = await adapter.generateJson<{ ok: boolean }>(makeRequest());

  assert.deepEqual(result.data, { ok: true });
});

test("GeminiAdapter caps maxOutputTokens and sends a timeout abort signal", async () => {
  const calls: GenerateContentParameters[] = [];
  const adapter = new GeminiAdapter("test-key", {
    client: makeClient('{"ok":true}', calls),
  });

  await adapter.generateJson<{ ok: boolean }>(makeRequest());

  assert.equal(calls[0]?.config?.maxOutputTokens, 400);
  assert.ok(calls[0]?.config?.abortSignal instanceof AbortSignal);
});

test("GeminiAdapter uses request generationConfig before profile defaults", async () => {
  const calls: GenerateContentParameters[] = [];
  const adapter = new GeminiAdapter("test-key", {
    client: makeClient('{"ok":true}', calls),
  });

  await adapter.generateJson<{ ok: boolean }>(
    makeRequest({
      modelProfile: {
        ...modelProfile,
        capabilities: {
          ...modelProfile.capabilities,
          maxOutputTokens: 700,
        },
        limits: {
          ...modelProfile.limits,
          maxOutputTokens: 700,
        },
      },
      generationConfig: {
        maxOutputTokens: 550,
        timeoutMs: 7_000,
        maxRetries: 1,
      },
    }),
  );

  assert.equal(calls[0]?.config?.maxOutputTokens, 550);
  assert.ok(calls[0]?.config?.abortSignal instanceof AbortSignal);
});
