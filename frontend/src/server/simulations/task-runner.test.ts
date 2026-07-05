import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SimulationApiResponse, UserInput } from "../../types.js";
import { FileSimulationTaskRepository } from "./task-repository.js";
import { runSimulationTaskOnce } from "./task-runner.js";
import { SimulationTaskService } from "./task-service.js";

const userInput: UserInput = {
  type: "side_hustle",
  projectIdea: "AI 简历优化服务",
};

test("runSimulationTaskOnce completes a queued task and stores report", async () => {
  const service = await makeService("sim_runner");
  await service.createTask({ userInput, interactionMode: "legacy" });

  await runSimulationTaskOnce("sim_runner", {
    service,
    runSimulation: async () => makeReport("sim_runner"),
  });

  const status = await service.getStatus("sim_runner");
  const report = await service.getReport("sim_runner");
  assert.equal(status?.status, "completed");
  assert.equal(report?.publicReport?.id, "sim_runner");
});

test("runSimulationTaskOnce marks timeout as recoverable failure", async () => {
  const service = await makeService("sim_timeout");
  await service.createTask({ userInput, interactionMode: "legacy" });

  await runSimulationTaskOnce("sim_timeout", {
    service,
    runSimulation: async () => {
      throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    },
  });

  const status = await service.getStatus("sim_timeout");
  assert.equal(status?.status, "recoverable_failed");
  assert.equal(status?.recoverable, true);
});

test("runSimulationTaskOnce marks validation errors as non-recoverable failed task", async () => {
  const service = await makeService("sim_invalid");
  await service.createTask({ userInput, interactionMode: "legacy" });

  await runSimulationTaskOnce("sim_invalid", {
    service,
    runSimulation: async () => {
      throw Object.assign(new Error("invalid input"), { status: 400 });
    },
  });

  const status = await service.getStatus("sim_invalid");
  assert.equal(status?.status, "failed");
  assert.equal(status?.recoverable, false);
});

test("runSimulationTaskOnce waits for model call ledger writes before completion", async () => {
  const service = await makeService("sim_ledger");
  await service.createTask({ userInput, interactionMode: "legacy" });
  const recordModelCall = service.recordModelCall.bind(service);
  let ledgerWriteCompleted = false;
  service.recordModelCall = async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const run = await recordModelCall(...args);
    ledgerWriteCompleted = true;
    return run;
  };

  await runSimulationTaskOnce("sim_ledger", {
    service,
    runSimulation: async ({ onAiCallLog }) => {
      onAiCallLog({
        timestamp: "2026-07-02T00:00:00.000Z",
        provider: "gemini",
        modelProfileId: "gemini_flash_fast",
        modelId: "gemini-3.5-flash",
        step: "generate_report",
        scenarioType: "side_hustle",
        promptHash: "abcd1234abcd1234",
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 30,
        success: true,
      });

      return makeReport("sim_ledger");
    },
  });

  assert.equal(ledgerWriteCompleted, true);
  assert.equal((await service.getCostSummary("sim_ledger")).totalTokens, 30);
});

test("runSimulationTaskOnce prints final token totals after completion", async () => {
  const service = await makeService("sim_token_log");
  await service.createTask({ userInput, interactionMode: "legacy" });
  const logs: unknown[] = [];

  await runSimulationTaskOnce("sim_token_log", {
    service,
    logger: {
      info: (...args: unknown[]) => logs.push(args),
    },
    runSimulation: async ({ onAiCallLog }) => {
      onAiCallLog({
        timestamp: "2026-07-02T00:00:00.000Z",
        provider: "gemini",
        modelProfileId: "gemini_flash_fast",
        modelId: "gemini-3.5-flash",
        step: "generate_agents",
        scenarioType: "side_hustle",
        promptHash: "abcd1234abcd1234",
        inputTokens: 100,
        outputTokens: 30,
        latencyMs: 30,
        success: true,
      });
      onAiCallLog({
        timestamp: "2026-07-02T00:00:01.000Z",
        provider: "gemini",
        modelProfileId: "gemini_flash_fast",
        modelId: "gemini-3.5-flash",
        step: "generate_report",
        scenarioType: "side_hustle",
        promptHash: "abcd1234abcd1235",
        inputTokens: 200,
        outputTokens: 70,
        latencyMs: 40,
        success: true,
      });

      return makeReport("sim_token_log");
    },
  });

  const serializedLogs = logs.map((entry) => JSON.stringify(entry)).join("\n");
  assert.match(serializedLogs, /sim_token_log/);
  assert.match(serializedLogs, /totalTokens/);
  assert.match(serializedLogs, /400/);
  assert.match(serializedLogs, /promptTokens/);
  assert.match(serializedLogs, /300/);
  assert.match(serializedLogs, /completionTokens/);
  assert.match(serializedLogs, /100/);
});

async function makeService(simulationId: string): Promise<SimulationTaskService> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-task-runner-"));
  return new SimulationTaskService({
    repo: new FileSimulationTaskRepository({ rootDir: dir }),
    createId: () => simulationId,
    now: () => "2026-07-02T00:00:00.000Z",
  });
}

function makeReport(simulationId: string): SimulationApiResponse {
  return {
    id: simulationId,
    status: "completed",
    createdAt: "2026-07-02T00:00:00.000Z",
    interactionModeUsed: "legacy",
    agents: [],
    stages: [],
    report: {
      projectName: "AI 简历优化",
      successProbability: 50,
      expectedRevenue: "待验证",
      riskLevel: "medium",
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
      shouldDo: "test_small",
    },
  };
}
