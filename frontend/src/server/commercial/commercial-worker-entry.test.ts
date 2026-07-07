import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunCommercialSimulation,
  parseCommercialTaskUserInput,
} from "./commercial-worker-entry.js";
import type { CommercialTaskProviderRuntime } from "./commercial-task-service.js";
import type { SimulationQueueJob } from "./simulation-queue.js";
import type { Report, UserInput } from "../../types.js";

const sampleJob: SimulationQueueJob = {
  id: "task_1",
  data: {
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "legacy",
    weight: 1,
    idempotencyKey: "task_1:enqueue",
  },
};

const sampleReport: Report = {
  projectName: "Launch",
  successProbability: 72,
  expectedRevenue: "$1000",
  riskLevel: "medium",
  finalRecommendation: "test small",
  scores: {
    demandStrength: 70,
    willingnessToPay: 60,
    acquisitionDifficulty: 40,
    competitionPressure: 30,
    executionFit: 80,
    monetizationClarity: 65,
  },
  finalOutcome: "validated",
  opportunities: ["niche"],
  risks: ["time"],
  pivotSuggestions: [],
  actionPlan7Days: [{ day: 1, title: "Interview", action: "Talk to users" }],
  shouldDo: "test_small",
};

test("parseCommercialTaskUserInput reads structured task JSON", () => {
  assert.deepEqual(
    parseCommercialTaskUserInput(
      JSON.stringify({
        type: "side_hustle",
        projectIdea: "AI resume optimizer",
        targetUser: "job seekers",
      }),
    ),
    {
      type: "side_hustle",
      projectIdea: "AI resume optimizer",
      targetUser: "job seekers",
    },
  );
});

test("parseCommercialTaskUserInput rejects malformed task input", () => {
  assert.throws(() => parseCommercialTaskUserInput("[object Object]"), /valid JSON/);
  assert.throws(() => parseCommercialTaskUserInput(JSON.stringify({ type: "unknown" })), /valid type/);
});

test("commercial worker runSimulation uses provider gateway and stored task input", async () => {
  const seen: Array<{
    input: UserInput;
    provider: CommercialTaskProviderRuntime;
    simulationId: string;
  }> = [];
  const runSimulation = buildRunCommercialSimulation({
    getTask: async () => ({
      id: "task_1",
      userInput: JSON.stringify({
        type: "side_hustle",
        projectIdea: "AI resume optimizer",
      }),
      interactionMode: "enabled",
    }),
    createGateway: (providerRuntime) => ({
      providerRuntime,
    }),
    runMultiAgentSimulation: async ({ gateway, simulationId, userInput }) => {
      seen.push({
        input: userInput,
        provider: gateway.providerRuntime,
        simulationId,
      });
      return {
        agents: [],
        stages: [],
        report: sampleReport,
      };
    },
  });

  const providerRuntime: CommercialTaskProviderRuntime = { providerMode: "platform" };
  const report = await runSimulation(sampleJob, providerRuntime);

  assert.equal(report.id, "task_1");
  assert.equal(report.status, "completed");
  assert.equal(report.interactionModeUsed, "enabled");
  assert.equal(report.report.projectName, "Launch");
  assert.deepEqual(seen, [
    {
      input: {
        type: "side_hustle",
        projectIdea: "AI resume optimizer",
      },
      provider: providerRuntime,
      simulationId: "task_1",
    },
  ]);
});
