import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { UserInput } from "../../types.js";
import { FileSimulationTaskRepository } from "./task-repository.js";
import { SimulationTaskService } from "./task-service.js";

const userInput: UserInput = {
  type: "side_hustle",
  projectIdea: "AI 简历优化服务",
};

test("createTask stores a queued durable task and initial checkpoint", async () => {
  const service = await makeService("sim_service");

  const created = await service.createTask({ userInput, interactionMode: "legacy" });
  const status = await service.getStatus("sim_service");
  const checkpoint = await service.getLatestCheckpoint("sim_service");

  assert.equal(created.simulationId, "sim_service");
  assert.equal(created.status, "queued");
  assert.equal(status?.status, "queued");
  assert.equal(status?.progressPercent, 0);
  assert.equal(checkpoint?.checkpoint.userInput.projectIdea, userInput.projectIdea);
});

test("markRecoverableFailure preserves checkpoint and exposes recoverable status", async () => {
  const service = await makeService("sim_recoverable");
  await service.createTask({ userInput, interactionMode: "legacy" });

  await service.markRecoverableFailure("sim_recoverable", {
    currentStageIndex: 4,
    currentStepName: "arbitrate_stage",
    progressPercent: 73,
    errorCode: "ETIMEDOUT",
  });

  const status = await service.getStatus("sim_recoverable");
  const checkpoint = await service.getLatestCheckpoint("sim_recoverable");

  assert.equal(status?.status, "recoverable_failed");
  assert.equal(status?.recoverable, true);
  assert.equal(status?.errorCode, "ETIMEDOUT");
  assert.equal(checkpoint?.stageIndex, 4);
  assert.equal(checkpoint?.stepName, "arbitrate_stage");
});

test("resumeRecoverableTask rejects non-recoverable task and resumes recoverable task", async () => {
  const service = await makeService("sim_resume");
  await service.createTask({ userInput, interactionMode: "legacy" });

  await assert.rejects(
    () => service.resumeRecoverableTask("sim_resume"),
    /not recoverable/i,
  );

  await service.markRecoverableFailure("sim_resume", {
    currentStageIndex: 2,
    currentStepName: "generate_agent_actions",
    progressPercent: 44,
    errorCode: "provider_429",
  });
  const resumed = await service.resumeRecoverableTask("sim_resume");

  assert.equal(resumed.status, "running");
  assert.equal(resumed.recoverable, false);
  assert.equal(resumed.currentStageIndex, 2);
});

test("recordModelCall appends cost ledger step run with token usage", async () => {
  const service = await makeService("sim_cost");
  await service.createTask({ userInput, interactionMode: "legacy" });

  await service.recordModelCall({
    simulationId: "sim_cost",
    stageIndex: 1,
    stepName: "generate_world_event",
    provider: "gemini",
    modelId: "gemini-3.5-flash",
    modelProfileId: "gemini_flash_fast",
    promptTokens: 1000,
    completionTokens: 500,
    latencyMs: 900,
    status: "completed",
    startedAt: "2026-07-02T00:00:00.000Z",
    completedAt: "2026-07-02T00:00:01.000Z",
  });

  const summary = await service.getCostSummary("sim_cost");
  assert.equal(summary.totalTokens, 1500);
  assert.equal(summary.totalLatencyMs, 900);
  assert.ok(summary.estimatedCost > 0);
});

async function makeService(simulationId: string): Promise<SimulationTaskService> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-task-service-"));
  return new SimulationTaskService({
    repo: new FileSimulationTaskRepository({ rootDir: dir }),
    createId: () => simulationId,
    now: () => "2026-07-02T00:00:00.000Z",
  });
}
