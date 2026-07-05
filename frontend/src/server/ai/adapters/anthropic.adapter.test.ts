import assert from "node:assert/strict";
import test from "node:test";

import { AnthropicAdapter } from "./anthropic.adapter.js";
import type { AiCallRequest, ModelProfile } from "../types.js";

const modelProfile: ModelProfile = {
  id: "anthropic_test_profile",
  name: "Anthropic Test",
  provider: "anthropic",
  displayName: "Test",
  modelId: "claude-test-model",
  visibleToUser: false,
  allowUserModelOverride: false,
  allowUserApiKey: false,
  allowCustomBaseUrl: false,
  capabilities: {
    supportsJsonMode: true,
    supportsStructuredOutput: false,
    supportsStreaming: false,
    supportsVision: false,
    supportsToolUse: false,
    supportsSystemPrompt: true,
    supportsReasoningEffort: false,
    supportsThinking: false,
    maxInputTokens: 200_000,
    maxOutputTokens: 400,
    recommendedForLongReport: true,
    recommendedForFastTasks: true,
    recommendedForDeepSimulation: false,
  },
  defaults: {
    maxOutputTokens: 800,
    quality: "balanced",
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

test("AnthropicAdapter posts messages with server key and parses JSON text blocks", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new AnthropicAdapter("test-anthropic-key", {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(JSON.stringify({
        id: "msg_1",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 11,
          output_tokens: 22,
        },
        content: [
          {
            type: "text",
            text: '{"ok":true}',
          },
        ],
      }));
    },
  });

  const result = await adapter.generateJson<{ ok: boolean }>(makeRequest());

  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.rawText, '{"ok":true}');
  assert.equal(result.provider, "anthropic");
  assert.equal(result.modelId, "claude-test-model");
  assert.equal(result.modelProfileId, "anthropic_test_profile");
  assert.equal(result.requestId, "msg_1");
  assert.equal(result.stopReason, "end_turn");
  assert.deepEqual(result.usage, {
    inputTokens: 11,
    outputTokens: 22,
    totalTokens: 33,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0]?.init.method, "POST");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "test-anthropic-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers["content-type"], "application/json");

  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.model, "claude-test-model");
  assert.equal(body.system, "system");
  assert.equal(body.max_tokens, 400);
  assert.deepEqual(body.messages, [
    {
      role: "user",
      content: "user",
    },
  ]);
});

test("AnthropicAdapter rejects non-OK provider responses without exposing request body", async () => {
  const adapter = new AnthropicAdapter("test-anthropic-key", {
    fetch: async () =>
      new Response("provider says private prompt leaked", {
        status: 429,
        statusText: "Too Many Requests",
      }),
  });

  await assert.rejects(
    () => adapter.generateJson(makeRequest({ userPrompt: "private prompt" })),
    (error) =>
      error instanceof Error &&
      /Anthropic request failed with status 429/i.test(error.message) &&
      !/private prompt/.test(error.message),
  );
});

test("AnthropicAdapter uses request generationConfig before profile defaults", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new AnthropicAdapter("test-anthropic-key", {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(JSON.stringify({
        id: "msg_1",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 11,
          output_tokens: 22,
        },
        content: [
          {
            type: "text",
            text: '{"ok":true}',
          },
        ],
      }));
    },
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

  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.max_tokens, 550);
});
