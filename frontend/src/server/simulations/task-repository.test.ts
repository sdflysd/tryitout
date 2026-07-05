import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { UserInput } from "../../types.js";
import { FileSimulationTaskRepository } from "./task-repository.js";
import { createInitialSimulationTask } from "./task-types.js";

const userInput: UserInput = {
  type: "dating",
  chatLogOrIssue: "对方突然冷淡，我不知道怎么回复。",
};

test("file repository saves and loads task records", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-task-repo-"));
  const repo = new FileSimulationTaskRepository({ rootDir: dir });
  const task = createInitialSimulationTask({
    simulationId: "sim_repo",
    userInput,
    mode: "legacy",
    now: "2026-07-02T00:00:00.000Z",
  });

  await repo.saveTask(task);
  const loaded = await repo.getTask("sim_repo");

  assert.deepEqual(loaded, task);
});

test("file repository returns latest checkpoint", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-task-repo-"));
  const repo = new FileSimulationTaskRepository({ rootDir: dir });

  await repo.saveCheckpoint({
    id: "cp_1",
    simulationId: "sim_cp",
    stageIndex: 1,
    stepName: "stage_1",
    createdAt: "2026-07-02T00:00:00.000Z",
    checkpoint: {
      userInput,
      mode: "legacy",
      nextStep: "stage_2",
    },
  });
  await repo.saveCheckpoint({
    id: "cp_2",
    simulationId: "sim_cp",
    stageIndex: 2,
    stepName: "stage_2",
    createdAt: "2026-07-02T00:01:00.000Z",
    checkpoint: {
      userInput,
      mode: "legacy",
      nextStep: "stage_3",
    },
  });

  const latest = await repo.getLatestCheckpoint("sim_cp");
  assert.equal(latest?.id, "cp_2");
  assert.equal(latest?.checkpoint.nextStep, "stage_3");
});

test("file repository saves step runs and public report", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-task-repo-"));
  const repo = new FileSimulationTaskRepository({ rootDir: dir });

  await repo.appendStepRun({
    id: "run_1",
    simulationId: "sim_trace",
    stageIndex: 1,
    stepName: "generate_report",
    provider: "gemini",
    modelId: "gemini-3.5-flash",
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    latencyMs: 40,
    estimatedCost: 0.0001,
    status: "completed",
    startedAt: "2026-07-02T00:00:00.000Z",
    completedAt: "2026-07-02T00:00:01.000Z",
  });
  await repo.saveReport({
    simulationId: "sim_trace",
    publicReport: makeReport("sim_trace"),
    unlocked: false,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  });

  assert.equal((await repo.listStepRuns("sim_trace")).length, 1);
  assert.equal((await repo.getReport("sim_trace"))?.publicReport?.id, "sim_trace");
});

function makeReport(simulationId: string) {
  return {
    id: simulationId,
    status: "completed" as const,
    createdAt: "2026-07-02T00:00:00.000Z",
    interactionModeUsed: "legacy" as const,
    agents: [],
    stages: [],
    report: {
      projectName: "测试报告",
      successProbability: 50,
      expectedRevenue: "待验证",
      riskLevel: "medium" as const,
      finalRecommendation: "小规模测试",
      scores: {
        demandStrength: 50,
        willingnessToPay: 40,
        acquisitionDifficulty: 50,
        competitionPressure: 50,
        executionFit: 60,
        monetizationClarity: 45,
      },
      finalOutcome: "需要验证",
      opportunities: [],
      risks: [],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small" as const,
    },
  };
}
