import assert from "node:assert/strict";
import test from "node:test";

import { AiGateway, createUserOpenAiCompatibleGateway } from "./ai-gateway.js";
import { hashPrompt } from "./call-log.js";
import type { AiCallRequest, AiCallResult } from "./types.js";
import { ModelResolutionError } from "./model-router.js";
import type { AiProviderAdapter } from "./adapters/provider-adapter.js";

class StubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  calls: AiCallRequest[] = [];

  constructor(private readonly outcome: AiCallResult | Error) {}

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (this.outcome instanceof Error) {
      throw this.outcome;
    }

    return this.outcome as AiCallResult<T>;
  }
}

class StubOpenAiCompatibleAdapter implements AiProviderAdapter {
  readonly provider = "openai_compatible" as const;
  calls: AiCallRequest[] = [];

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);
    return makeResult({
      data: { ok: true },
      provider: "openai_compatible",
      modelId: request.modelProfile.modelId,
      modelProfileId: request.modelProfile.id,
    }) as AiCallResult<T>;
  }
}

function makeResult(overrides: Partial<AiCallResult> = {}): AiCallResult {
  return {
    data: { ok: true },
    provider: "gemini",
    modelId: "gemini-3.5-flash",
    modelProfileId: "gemini_flash_fast",
    usage: {
      inputTokens: 10,
      outputTokens: 20,
    },
    latencyMs: 30,
    requestId: "request-1",
    ...overrides,
  };
}

test("createRequest resolves safe mode selections and defaults metadata", () => {
  const gateway = new AiGateway("test-key", { adapters: [] });

  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    userPrompt: "private prompt",
  });

  assert.equal(request.modelProfile.id, "gemini_flash_fast");
  assert.equal(request.modelProfile.defaults.quality, "fast");
  assert.equal(request.responseFormat, "json");
  assert.deepEqual(request.metadata, {});
});

test("createUserOpenAiCompatibleGateway resolves requests to user BYOK profile metadata", async () => {
  const adapter = new StubOpenAiCompatibleAdapter();
  const gateway = createUserOpenAiCompatibleGateway({
    apiKey: "sk-user-secret",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    adapter,
  });

  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "balanced" },
    userPrompt: "private prompt",
  });
  const result = await gateway.generateJson(request);

  assert.equal(request.modelProfile.id, "user_openai_compatible_balanced");
  assert.equal(request.modelProfile.provider, "openai_compatible");
  assert.equal(request.modelProfile.modelId, "gpt-4.1-mini");
  assert.equal(request.modelProfile.baseUrl, "https://api.openai.com/v1");
  assert.equal(result.provider, "openai_compatible");
  assert.equal(adapter.calls[0], request);
});

test("createUserOpenAiCompatibleGateway maps BYOK fast balanced and deep models from step policy", () => {
  const gateway = createUserOpenAiCompatibleGateway({
    apiKey: "sk-user-secret",
    baseUrl: "https://api.openai.com/v1",
    model: {
      fast: "grok-fast",
      balanced: "grok-balanced",
      deep: "grok-deep",
    },
    adapter: new StubOpenAiCompatibleAdapter(),
  });

  const safety = gateway.createRequest({
    step: "safety_check",
    scenarioType: "life_choice",
    userPrompt: "{}",
  });
  const agents = gateway.createRequest({
    step: "generate_agents",
    scenarioType: "life_choice",
    userPrompt: "{}",
  });
  const report = gateway.createRequest({
    step: "generate_report",
    scenarioType: "life_choice",
    userPrompt: "{}",
  });

  assert.equal(safety.modelProfile.modelId, "grok-fast");
  assert.equal(agents.modelProfile.modelId, "grok-balanced");
  assert.equal(report.modelProfile.modelId, "grok-deep");
});

test("createRequest uses json_schema response format when a schema is provided", () => {
  const gateway = new AiGateway("test-key", { adapters: [] });
  const schema = {
    type: "object",
    properties: {
      ok: { type: "boolean" },
    },
  };

  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    systemPrompt: "system",
    userPrompt: "user",
    jsonSchema: schema,
    metadata: {
      simulationId: "sim-1",
      userId: "user-1",
    },
  });

  assert.equal(request.responseFormat, "json_schema");
  assert.equal(request.systemPrompt, "system");
  assert.equal(request.jsonSchema, schema);
  assert.deepEqual(request.metadata, {
    simulationId: "sim-1",
    userId: "user-1",
  });
});

test("createRequest applies step-level generation budget to the request", () => {
  const gateway = new AiGateway("test-key", { adapters: [] });

  const request = gateway.createRequest({
    step: "full_simulation",
    scenarioType: "dating",
    userPrompt: "private prompt",
  });

  assert.equal(request.generationConfig.maxOutputTokens, 16_384);
  assert.equal(request.generationConfig.timeoutMs, 120_000);
});

test("createRequest rejects unsafe model selection keys through model resolution", () => {
  const gateway = new AiGateway("test-key", { adapters: [] });

  assert.throws(
    () =>
      gateway.createRequest({
        step: "parse_scenario",
        scenarioType: "side_hustle",
        modelSelection: {
          mode: "fast",
          provider: "client-controlled",
        } as any,
        userPrompt: "private prompt",
      }),
    (error) =>
      error instanceof ModelResolutionError &&
      /unknown modelSelection key: provider/i.test(error.message),
  );
});

test("createRequest accepts visible platform model profile overrides", () => {
  const gateway = new AiGateway("test-key", { adapters: [] });

  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { modelProfileId: "gemini_flash_deep" },
    userPrompt: "private prompt",
  });

  assert.equal(request.modelProfile.id, "gemini_flash_deep");
  assert.equal(request.modelProfile.visibleToUser, true);
});

test("generateJson dispatches to the registered provider adapter and logs a prompt hash", async () => {
  const adapter = new StubAdapter(makeResult());
  const logs: unknown[] = [];
  const gateway = new AiGateway("test-key", {
    adapters: [adapter],
    onLog: (entry) => logs.push(entry),
  });
  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    systemPrompt: "secret system prompt",
    userPrompt: "private user prompt",
    metadata: {
      simulationId: "sim-1",
      userId: "user-1",
    },
  });

  const result = await gateway.generateJson<{ ok: boolean }>(request);

  assert.deepEqual(result.data, { ok: true });
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0], request);
  assert.equal(logs.length, 1);

  const entry = logs[0] as {
    promptHash?: string;
    simulationId?: string;
    userId?: string;
  };
  assert.equal(entry.simulationId, hashPrompt("sim-1"));
  assert.equal(entry.userId, hashPrompt("user-1"));

  const serialized = JSON.stringify(entry);
  assert.match(serialized, /"promptHash":"[a-f0-9]{16}"/);
  assert.doesNotMatch(serialized, /secret system prompt/);
  assert.doesNotMatch(serialized, /private user prompt/);
  assert.doesNotMatch(serialized, /sim-1/);
  assert.doesNotMatch(serialized, /user-1/);
  assert.doesNotMatch(serialized, /systemPrompt|userPrompt/);
});

test("generateJson supports assigning onLog after construction", async () => {
  const adapter = new StubAdapter(makeResult());
  const logs: unknown[] = [];
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  gateway.onLog = (entry) => logs.push(entry);
  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    userPrompt: "private user prompt",
  });

  await gateway.generateJson(request);

  assert.equal(logs.length, 1);
});

test("generateJson emits detailed debug traces with raw prompts and responses", async () => {
  const adapter = new StubAdapter(makeResult({
    data: { actions: [{ id: "agent-action-1", content: "agent response" }] },
    modelProfileId: "gemini_flash_balanced",
    rawText: "{\"actions\":[{\"id\":\"agent-action-1\"}]}",
  }));
  const traces: unknown[] = [];
  const gateway = new AiGateway("test-key", {
    adapters: [adapter],
    onDebugTrace: (entry) => {
      traces.push(entry);
    },
  });
  const request = gateway.createRequest({
    step: "generate_agent_actions",
    scenarioType: "side_hustle",
    systemPrompt: "debug system prompt",
    userPrompt: "debug user prompt",
    metadata: {
      simulationId: "sim-debug-1",
      stageIndex: 2,
    },
  });

  await gateway.generateJson(request);

  assert.equal(traces.length, 1);
  const trace = traces[0] as {
    timestamp?: string;
    step?: string;
    scenarioType?: string;
    simulationId?: string;
    stageIndex?: number;
    provider?: string;
    modelId?: string;
    modelProfileId?: string;
    success?: boolean;
    systemPrompt?: string;
    userPrompt?: string;
    responseData?: unknown;
    rawText?: string;
    latencyMs?: number;
  };

  assert.match(trace.timestamp ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(trace.step, "generate_agent_actions");
  assert.equal(trace.scenarioType, "side_hustle");
  assert.equal(trace.simulationId, "sim-debug-1");
  assert.equal(trace.stageIndex, 2);
  assert.equal(trace.provider, "gemini");
  assert.equal(trace.modelId, "gemini-3.5-flash");
  assert.equal(trace.modelProfileId, "gemini_flash_balanced");
  assert.equal(trace.success, true);
  assert.equal(trace.systemPrompt, "debug system prompt");
  assert.equal(trace.userPrompt, "debug user prompt");
  assert.deepEqual(trace.responseData, {
    actions: [{ id: "agent-action-1", content: "agent response" }],
  });
  assert.equal(trace.rawText, "{\"actions\":[{\"id\":\"agent-action-1\"}]}");
  assert.equal(trace.latencyMs, 30);
});

test("generateJson ignores logger failures after successful adapter calls", async () => {
  const adapter = new StubAdapter(makeResult());
  const gateway = new AiGateway("test-key", {
    adapters: [adapter],
    onLog: () => {
      throw new Error("logger failed");
    },
  });
  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    userPrompt: "private user prompt",
  });

  const result = await gateway.generateJson<{ ok: boolean }>(request);

  assert.deepEqual(result.data, { ok: true });
});

test("generateJson preserves adapter failures when logger also fails", async () => {
  const adapterError = new Error("adapter failed");
  const adapter = new StubAdapter(adapterError);
  const gateway = new AiGateway("test-key", {
    adapters: [adapter],
    onLog: () => {
      throw new Error("logger failed");
    },
  });
  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    userPrompt: "private user prompt",
  });

  await assert.rejects(
    () => gateway.generateJson(request),
    (error) => error === adapterError,
  );
});

test("generateJson logs bounded errors and rethrows adapter failures", async () => {
  const error = new Error(`adapter failed ${"private user prompt ".repeat(20)}`);
  Object.assign(error, { code: "UPSTREAM_FAILURE" });
  const adapter = new StubAdapter(error);
  const logs: any[] = [];
  const gateway = new AiGateway("test-key", {
    adapters: [adapter],
    onLog: (entry) => logs.push(entry),
  });
  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "fast" },
    userPrompt: "private user prompt",
  });

  await assert.rejects(
    () => gateway.generateJson(request),
    /adapter failed/,
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0].success, false);
  assert.equal(logs[0].errorCode, "UPSTREAM_FAILURE");
  assert.equal(logs[0].errorMessage, "AI provider error");
  const serialized = JSON.stringify(logs[0]);
  assert.doesNotMatch(serialized, /adapter failed/);
  assert.doesNotMatch(serialized, /private user prompt/);
  assert.doesNotMatch(serialized, /systemPrompt|userPrompt/);
});

test("generateJson emits debug traces for failed provider calls", async () => {
  const error = new Error("provider returned malformed JSON");
  Object.assign(error, { code: "BAD_JSON" });
  const adapter = new StubAdapter(error);
  const traces: any[] = [];
  const gateway = new AiGateway("test-key", {
    adapters: [adapter],
    onDebugTrace: (entry) => {
      traces.push(entry);
    },
  });
  const request = gateway.createRequest({
    step: "generate_agent_actions",
    scenarioType: "dating",
    userPrompt: "raw prompt that helps reproduce the failure",
    metadata: {
      simulationId: "sim-failed-debug",
      stageIndex: 4,
    },
  });

  await assert.rejects(() => gateway.generateJson(request), /malformed JSON/);

  assert.equal(traces.length, 1);
  assert.equal(traces[0].success, false);
  assert.equal(traces[0].errorCode, "BAD_JSON");
  assert.equal(traces[0].errorName, "Error");
  assert.equal(traces[0].errorMessage, "provider returned malformed JSON");
  assert.equal(traces[0].userPrompt, "raw prompt that helps reproduce the failure");
  assert.equal(traces[0].responseData, undefined);
});
