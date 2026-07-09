import assert from "node:assert/strict";
import test from "node:test";

import { createCommercialWorkerRunSimulation } from "./commercial-simulation-worker-runtime.js";
import type { SimulationQueueJob } from "./simulation-queue.js";
import type { Report, UserInput } from "../../types.js";

const CREATED_AT = "2026-07-07T00:00:00.000Z";

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
