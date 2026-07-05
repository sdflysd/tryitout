import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDebugTraceEntry,
  createAgentDebugTraceWriter,
  isAgentDebugLoggingEnabled,
  type AiDebugTraceEntry,
} from "./debug-trace.js";
import type { AiCallRequest } from "./types.js";

test("isAgentDebugLoggingEnabled only enables raw trace logging with explicit true", () => {
  assert.equal(isAgentDebugLoggingEnabled({ ENABLE_AGENT_DEBUG_LOGS: "true" }), true);
  assert.equal(isAgentDebugLoggingEnabled({ ENABLE_AGENT_DEBUG_LOGS: "TRUE" }), true);
  assert.equal(isAgentDebugLoggingEnabled({ ENABLE_AGENT_DEBUG_LOGS: "1" }), false);
  assert.equal(isAgentDebugLoggingEnabled({ ENABLE_AGENT_DEBUG_LOGS: undefined }), false);
});

test("createAgentDebugTraceWriter appends detailed traces as jsonl under simulation folders", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "tryitout-agent-debug-"));
  const writer = createAgentDebugTraceWriter({ rootDir });
  const entry: AiDebugTraceEntry = {
    timestamp: "2026-07-04T12:00:00.000Z",
    provider: "gemini",
    modelProfileId: "gemini_flash_fast",
    modelId: "gemini-3.5-flash",
    step: "generate_agent_actions",
    scenarioType: "side_hustle",
    simulationId: "sim/debug 1",
    stageIndex: 3,
    success: true,
    latencyMs: 123,
    systemPrompt: "system prompt",
    userPrompt: "user prompt",
    responseData: {
      actions: [{ id: "agent-a", content: "agent said this" }],
    },
    rawText: "{\"actions\":[]}",
  };

  await writer(entry);
  await writer({ ...entry, step: "arbitrate_stage" });

  const logPath = path.join(rootDir, "sim_debug_1", "agent-debug.jsonl");
  const lines = (await readFile(logPath, "utf8")).trim().split("\n");

  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]!), entry);
  assert.equal(JSON.parse(lines[1]!).step, "arbitrate_stage");
});

test("createDebugTraceEntry records prompt scale, generation config, and interaction metadata", () => {
  const request: AiCallRequest = {
    step: "generate_agent_actions",
    scenarioType: "life_choice",
    modelProfile: {
      id: "gemini_flash_fast",
      name: "Fast",
      provider: "gemini",
      displayName: "Gemini Fast",
      modelId: "gemini-3.5-flash",
      visibleToUser: true,
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
        maxInputTokens: 100_000,
        maxOutputTokens: 8_192,
        recommendedForLongReport: false,
        recommendedForFastTasks: true,
        recommendedForDeepSimulation: false,
      },
      defaults: {
        maxOutputTokens: 4_096,
        quality: "fast",
        responseFormat: "json",
        stream: false,
        timeoutMs: 90_000,
        maxRetries: 1,
      },
      limits: {
        maxInputChars: 200_000,
        maxOutputTokens: 8_192,
      },
      status: "active",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    },
    generationConfig: {
      maxOutputTokens: 4_096,
      timeoutMs: 90_000,
      maxRetries: 1,
    },
    systemPrompt: "system prompt",
    userPrompt: "user prompt",
    responseFormat: "json",
    metadata: {
      simulationId: "sim_1",
      stageIndex: 2,
      activatedAgentCount: 5,
      requiredActionCount: 7,
      previousActionCount: 12,
    },
  };

  const entry = createDebugTraceEntry(
    request,
    {
      data: { actions: [] },
      rawText: "{\"actions\":[]}",
      provider: "gemini",
      modelId: "gemini-3.5-flash",
      modelProfileId: "gemini_flash_fast",
      latencyMs: 1234,
    },
    undefined,
  );

  assert.equal(entry.promptChars, "system prompt\nuser prompt".length);
  assert.equal(entry.responseChars, "{\"actions\":[]}".length);
  assert.deepEqual(entry.generationConfig, {
    maxOutputTokens: 4_096,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
  assert.deepEqual(entry.interactionMetadata, {
    activatedAgentCount: 5,
    requiredActionCount: 7,
    previousActionCount: 12,
  });
});
