import assert from "node:assert/strict";
import test from "node:test";

import { OpenAiCompatibleAdapter } from "./openai-compatible.adapter.js";
import type { AiCallRequest, ModelProfile } from "../types.js";

const modelProfile: ModelProfile = {
  id: "openai_compatible_test_profile",
  name: "OpenAI Compatible Test",
  provider: "openai_compatible",
  displayName: "Test",
  modelId: "openai-compatible-test-model",
  visibleToUser: false,
  allowUserModelOverride: false,
  allowUserApiKey: false,
  allowCustomBaseUrl: false,
  baseUrl: "https://server-configured.example/v1",
  allowedBaseUrls: ["https://server-configured.example/v1"],
  capabilities: {
    supportsJsonMode: true,
    supportsStructuredOutput: true,
    supportsStreaming: false,
    supportsVision: false,
    supportsToolUse: false,
    supportsSystemPrompt: true,
    supportsReasoningEffort: false,
    supportsThinking: false,
    maxInputTokens: 128_000,
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

test("OpenAiCompatibleAdapter posts chat completions to the server configured base URL", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new OpenAiCompatibleAdapter({
    apiKey: "test-openai-compatible-key",
    baseUrl: "https://server-configured.example/v1",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(JSON.stringify({
        id: "chatcmpl_1",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: '{"ok":true}',
            },
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 22,
          total_tokens: 33,
        },
      }));
    },
  });

  const result = await adapter.generateJson<{ ok: boolean }>(makeRequest());

  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.rawText, '{"ok":true}');
  assert.equal(result.provider, "openai_compatible");
  assert.equal(result.modelId, "openai-compatible-test-model");
  assert.equal(result.modelProfileId, "openai_compatible_test_profile");
  assert.equal(result.requestId, "chatcmpl_1");
  assert.equal(result.stopReason, "stop");
  assert.deepEqual(result.usage, {
    inputTokens: 11,
    outputTokens: 22,
    totalTokens: 33,
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    "https://server-configured.example/v1/chat/completions",
  );
  assert.equal(calls[0]?.init.method, "POST");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-openai-compatible-key");
  assert.equal(headers["content-type"], "application/json");

  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.model, "openai-compatible-test-model");
  assert.equal(body.max_tokens, 400);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.messages, [
    {
      role: "system",
      content: "system",
    },
    {
      role: "user",
      content: "user",
    },
  ]);
});

test("OpenAiCompatibleAdapter enforces profile base URL against server configuration", async () => {
  const adapter = new OpenAiCompatibleAdapter({
    apiKey: "test-openai-compatible-key",
    baseUrl: "https://server-configured.example/v1",
    fetch: async () => new Response("{}"),
  });

  await assert.rejects(
    () =>
      adapter.generateJson(
        makeRequest({
          modelProfile: {
            ...modelProfile,
            baseUrl: "https://attacker.example/v1",
          },
        }),
      ),
    /does not match configured OpenAI-compatible base URL/i,
  );
});

test("OpenAiCompatibleAdapter uses request generationConfig before profile defaults", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new OpenAiCompatibleAdapter({
    apiKey: "test-openai-compatible-key",
    baseUrl: "https://server-configured.example/v1",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(JSON.stringify({
        id: "chatcmpl_1",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: '{"ok":true}',
            },
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 22,
          total_tokens: 33,
        },
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

test("OpenAiCompatibleAdapter honors request maxRetries for long simulation calls", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new OpenAiCompatibleAdapter({
    apiKey: "test-openai-compatible-key",
    baseUrl: "https://server-configured.example/v1",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response("temporary outage", {
        status: 503,
        statusText: "Service Unavailable",
      });
    },
  });

  await assert.rejects(
    () =>
      adapter.generateJson(
        makeRequest({
          step: "full_simulation",
          generationConfig: {
            maxOutputTokens: 16_384,
            timeoutMs: 120_000,
            maxRetries: 1,
          },
        }),
      ),
    /OpenAI-compatible request failed with status 503/i,
  );

  assert.equal(calls.length, 1);
});
