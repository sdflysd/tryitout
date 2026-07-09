import assert from "node:assert/strict";
import test from "node:test";

import { createCommercialWorkerRunSimulation } from "./commercial-simulation-worker-runtime.js";
import { createRepositoryPlatformGateway } from "./platform-model-runtime.js";
import { encryptSecret } from "./secrets.js";
import { InMemoryCommercialRepository } from "./repository.js";
import type { SimulationQueueJob } from "./simulation-queue.js";
import type { AiProviderAdapter } from "../ai/adapters/provider-adapter.js";
import type { AiGateway } from "../ai/ai-gateway.js";
import type { AiCallRequest, AiCallResult } from "../ai/types.js";
import type { Report, UserInput } from "../../types.js";

const CREATED_AT = "2026-07-07T00:00:00.000Z";
const MODEL_PROVIDER_KEY = Buffer.alloc(32, 9);

test("commercial worker runtime runs simulation with queued user input", async () => {
  const userInput: UserInput = {
    type: "life_choice",
    decisionContext: "Should I quit my job?",
    optionA: "Stay",
    optionB: "Quit",
  };
  let observedInput: UserInput | undefined;
  let observedMode: string | undefined;

  const runSimulation = createCommercialWorkerRunSimulation({
    job: job({ userInput, interactionMode: "enabled" }),
    services: {
      modelProviderService: {
        resolveProviderForTask: async () => ({ mode: "platform" as const }),
      },
    },
    getPlatformGateway: () => ({ onLog: undefined }) as never,
    resolveCapabilities: () => ({
      providerConfigured: true,
      deepModeAvailable: true,
      defaultInteractionMode: "enabled",
      fallbackPolicy: "safe_stage_fallback",
      reason: "",
    }),
    runSimulation: async ({ userInput: receivedInput, interactionMode }) => {
      observedInput = receivedInput;
      observedMode = interactionMode;
      return {
        agents: [],
        stages: [],
        report: makeReport(),
      };
    },
  });

  const result = await runSimulation({
    recordStepRun: async () => undefined,
  });

  assert.equal(result.id, "task_1");
  assert.equal(result.status, "completed");
  assert.deepEqual(observedInput, userInput);
  assert.equal(observedMode, "enabled");
});

test("commercial worker runtime passes queued model selection into simulation", async () => {
  const modelSelection = {
    modelProfileId: "anthropic_sonnet_balanced",
  };
  let observedSelection: unknown;

  const runSimulation = createCommercialWorkerRunSimulation({
    job: job({ modelSelection }),
    services: {
      modelProviderService: {
        resolveProviderForTask: async () => ({ mode: "platform" as const }),
      },
    },
    getPlatformGateway: () => ({ onLog: undefined }) as never,
    resolveCapabilities: () => ({
      providerConfigured: true,
      deepModeAvailable: true,
      defaultInteractionMode: "enabled",
      fallbackPolicy: "safe_stage_fallback",
      reason: "",
    }),
    runSimulation: async ({ modelSelection: receivedSelection }) => {
      observedSelection = receivedSelection;
      return {
        agents: [],
        stages: [],
        report: makeReport(),
      };
    },
  });

  await runSimulation({
    recordStepRun: async () => undefined,
  });

  assert.deepEqual(observedSelection, modelSelection);
});

test("commercial worker runtime builds a platform gateway from repository-backed model config", async () => {
  const repository = new InMemoryCommercialRepository();
  await repository.savePlatformModelProvider({
    id: "platform_provider_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.example/api/v1",
    encryptedApiKey: encryptSecret("sk-platform-secret1234", MODEL_PROVIDER_KEY),
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repository.savePlatformModelProfile({
    id: "openrouter_balanced",
    providerConfigId: "platform_provider_1",
    label: "OpenRouter Balanced",
    modelId: "vendor/balanced",
    quality: "balanced",
    visibleToUser: true,
    status: "active",
    capabilities: {
      maxOutputTokens: 8192,
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  let observedGateway: AiGateway | undefined;

  const runSimulation = createCommercialWorkerRunSimulation({
    job: job({ modelSelection: { modelProfileId: "openrouter_balanced" } }),
    services: {
      modelProviderService: {
        resolveProviderForTask: async () => ({ mode: "platform" as const }),
      },
      repository,
    },
    platformSecretEncryptionKey: MODEL_PROVIDER_KEY,
    resolveCapabilities: () => ({
      providerConfigured: true,
      deepModeAvailable: true,
      defaultInteractionMode: "enabled",
      fallbackPolicy: "safe_stage_fallback",
      reason: "",
    }),
    runSimulation: async ({ gateway }) => {
      observedGateway = gateway;
      return {
        agents: [],
        stages: [],
        report: makeReport(),
      };
    },
  });

  await runSimulation({
    recordStepRun: async () => undefined,
  });
  assert.ok(observedGateway);
  const request = observedGateway.createRequest({
    step: "generate_agents",
    scenarioType: "life_choice",
    modelSelection: { modelProfileId: "openrouter_balanced" },
    userPrompt: "{}",
  });

  assert.equal(request.modelProfile.id, "openrouter_balanced");
  assert.equal(request.modelProfile.modelId, "vendor/balanced");
  assert.equal(request.modelProfile.baseUrl, "https://openrouter.example/api/v1");
});

test("repository platform gateway routes same-provider profiles to their configured provider", async () => {
  const repository = new InMemoryCommercialRepository();
  await repository.savePlatformModelProvider({
    id: "platform_provider_a",
    provider: "openai_compatible",
    displayName: "Provider A",
    baseUrl: "https://provider-a.example/api/v1",
    encryptedApiKey: encryptSecret("sk-provider-a", MODEL_PROVIDER_KEY),
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repository.savePlatformModelProvider({
    id: "platform_provider_b",
    provider: "openai_compatible",
    displayName: "Provider B",
    baseUrl: "https://provider-b.example/api/v1",
    encryptedApiKey: encryptSecret("sk-provider-b", MODEL_PROVIDER_KEY),
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repository.savePlatformModelProfile({
    id: "provider_a_balanced",
    providerConfigId: "platform_provider_a",
    label: "Provider A Balanced",
    modelId: "provider-a/model",
    quality: "balanced",
    visibleToUser: true,
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repository.savePlatformModelProfile({
    id: "provider_b_balanced",
    providerConfigId: "platform_provider_b",
    label: "Provider B Balanced",
    modelId: "provider-b/model",
    quality: "balanced",
    visibleToUser: true,
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  const calls: string[] = [];
  const gateway = await createRepositoryPlatformGateway({
    repository,
    secretEncryptionKey: MODEL_PROVIDER_KEY,
    createAdapter: (provider) => ({
      provider: provider.provider,
      generateJson: async <T>(request: AiCallRequest): Promise<AiCallResult<T>> => {
        calls.push(`${provider.id}:${request.modelProfile.id}:${request.modelProfile.modelId}`);
        return {
          data: {} as T,
          provider: provider.provider,
          modelId: request.modelProfile.modelId,
          modelProfileId: request.modelProfile.id,
          latencyMs: 1,
        };
      },
    }) satisfies AiProviderAdapter,
  });
  assert.ok(gateway);

  await gateway.generateJson(gateway.createRequest({
    step: "generate_agents",
    scenarioType: "life_choice",
    modelSelection: { modelProfileId: "provider_a_balanced" },
    userPrompt: "{}",
  }));
  await gateway.generateJson(gateway.createRequest({
    step: "generate_agents",
    scenarioType: "life_choice",
    modelSelection: { modelProfileId: "provider_b_balanced" },
    userPrompt: "{}",
  }));

  assert.deepEqual(calls, [
    "platform_provider_a:provider_a_balanced:provider-a/model",
    "platform_provider_b:provider_b_balanced:provider-b/model",
  ]);
});

test("commercial worker runtime records every simulation progress event", async () => {
  const stepRuns: Array<{
    stepName: string;
    stageIndex?: number;
    status: string;
    metadata?: Record<string, unknown>;
  }> = [];

  const runSimulation = createCommercialWorkerRunSimulation({
    job: job(),
    services: {
      modelProviderService: {
        resolveProviderForTask: async () => ({ mode: "platform" as const }),
      },
    },
    getPlatformGateway: () => ({ onLog: undefined }) as never,
    resolveCapabilities: () => ({
      providerConfigured: true,
      deepModeAvailable: true,
      defaultInteractionMode: "enabled",
      fallbackPolicy: "safe_stage_fallback",
      reason: "",
    }),
    runSimulation: async ({ onProgress }) => {
      await onProgress?.({
        simulationId: "task_1",
        step: "generate_agents",
        status: "started",
        percent: 10,
        message: "多智能体角色生成开始。",
        createdAt: "2026-07-07T00:00:01.000Z",
      });
      await onProgress?.({
        simulationId: "task_1",
        step: "generate_agent_actions",
        stageIndex: 2,
        status: "completed",
        percent: 47,
        message: "第 2 阶段 Agent 互动生成完成。",
        createdAt: "2026-07-07T00:00:02.000Z",
      });
      return {
        agents: [],
        stages: [],
        report: makeReport(),
      };
    },
  });

  await runSimulation({
    recordStepRun: async (run) => {
      stepRuns.push(run);
    },
  });

  assert.deepEqual(
    stepRuns.map((run) => ({
      stepName: run.stepName,
      stageIndex: run.stageIndex,
      status: run.status,
      metadata: run.metadata,
    })),
    [
      {
        stepName: "generate_agents",
        stageIndex: undefined,
        status: "started",
        metadata: {
          progressPercent: 10,
          progressMessage: "多智能体角色生成开始。",
        },
      },
      {
        stepName: "generate_agent_actions",
        stageIndex: 2,
        status: "completed",
        metadata: {
          progressPercent: 47,
          progressMessage: "第 2 阶段 Agent 互动生成完成。",
        },
      },
    ],
  );
});

function job(overrides: Partial<SimulationQueueJob> = {}): SimulationQueueJob {
  return {
    taskId: "task_1",
    userId: "user_1",
    userInput: {
      type: "life_choice",
      decisionContext: "Should I quit my job?",
      optionA: "Stay",
      optionB: "Quit",
    },
    interactionMode: "legacy",
    providerMode: "platform",
    weight: 1,
    priority: 0,
    idempotencyKey: "idem_1",
    queuedAt: CREATED_AT,
    ...overrides,
  };
}

function makeReport(): Report {
  return {
    projectName: "Decision report",
    successProbability: 62,
    expectedRevenue: "n/a",
    riskLevel: "medium",
    finalRecommendation: "Test small",
    scores: {
      demandStrength: 60,
      willingnessToPay: 50,
      acquisitionDifficulty: 40,
      competitionPressure: 30,
      executionFit: 70,
      monetizationClarity: 55,
    },
    finalOutcome: "A cautious path",
    opportunities: [],
    risks: [],
    pivotSuggestions: [],
    actionPlan7Days: [],
    shouldDo: "test_small",
  };
}
