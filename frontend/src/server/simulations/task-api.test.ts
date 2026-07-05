import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileSimulationTaskRepository } from "./task-repository.js";
import { SimulationTaskService } from "./task-service.js";
import {
  handleCancelSimulationTaskRequest,
  handleCreateSimulationTaskRequest,
  handleGetSimulationCostSummaryRequest,
  handleGetSimulationReportRequest,
  handleGetSimulationTaskStatusRequest,
  handleResumeSimulationTaskRequest,
} from "./task-api.js";

test("handleCreateSimulationTaskRequest creates durable task response", async () => {
  const { service } = await makeDeps("sim_task_api");
  const result = await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化服务",
      },
      interactionMode: "legacy",
    },
    { service },
  );

  assert.equal(result.status, 200);
  assert.equal("simulationId" in result.body, true);
  if (!("simulationId" in result.body)) return;
  assert.equal(result.body.simulationId, "sim_task_api");
  assert.equal(result.body.status, "queued");
});

test("handleCreateSimulationTaskRequest rejects deprecated execution modes", async () => {
  const { service } = await makeDeps("sim_task_deprecated_mode");

  const result = await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化服务",
      },
      interactionMode: "deep_world",
    },
    { service },
  );

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "invalid interactionMode" });
});

test("handleGetSimulationTaskStatusRequest returns public status DTO", async () => {
  const { service } = await makeDeps("sim_status");
  await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "dating",
        chatLogOrIssue: "对方三小时没回，但发了朋友圈。",
      },
    },
    { service },
  );
  await service.markRunning("sim_status", {
    currentStageIndex: 1,
    currentStepName: "generate_world_event",
    progressPercent: 12,
  });

  const result = await handleGetSimulationTaskStatusRequest("sim_status", {
    service,
  });

  assert.equal(result.status, 200);
  assert.equal("simulationId" in result.body, true);
  if (!("simulationId" in result.body)) return;
  assert.equal(result.body.status, "running");
  assert.equal(result.body.currentStepName, "generate_world_event");
  assert.equal("userInput" in result.body, false);
});

test("handleResumeSimulationTaskRequest rejects non-recoverable task", async () => {
  const { service } = await makeDeps("sim_resume_api");
  await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化服务",
      },
    },
    { service },
  );

  const result = await handleResumeSimulationTaskRequest("sim_resume_api", {
    service,
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.ok, false);
});

test("handleResumeSimulationTaskRequest resumes recoverable task", async () => {
  const { service } = await makeDeps("sim_resume_ok");
  await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化服务",
      },
    },
    { service },
  );
  await service.markRecoverableFailure("sim_resume_ok", {
    currentStageIndex: 3,
    currentStepName: "arbitrate_stage",
    progressPercent: 66,
    errorCode: "provider_500",
  });

  const result = await handleResumeSimulationTaskRequest("sim_resume_ok", {
    service,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal((await service.getStatus("sim_resume_ok"))?.status, "running");
});

test("handleCancelSimulationTaskRequest cancels active task", async () => {
  const { service } = await makeDeps("sim_cancel");
  await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化服务",
      },
    },
    { service },
  );

  const result = await handleCancelSimulationTaskRequest("sim_cancel", {
    service,
  });

  assert.equal(result.status, 200);
  assert.equal("simulationId" in result.body, true);
  if (!("simulationId" in result.body)) return;
  assert.equal(result.body.status, "cancelled");
});

test("handleGetSimulationReportRequest returns 404 until report exists", async () => {
  const { service } = await makeDeps("sim_report");
  await handleCreateSimulationTaskRequest(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化服务",
      },
    },
    { service },
  );

  const result = await handleGetSimulationReportRequest("sim_report", {
    service,
  });

  assert.equal(result.status, 404);
});

test("handleGetSimulationCostSummaryRequest summarizes stored step runs", async () => {
  const { service } = await makeDeps("sim_cost_api");
  await service.recordModelCall({
    simulationId: "sim_cost_api",
    stepName: "generate_report",
    provider: "gemini",
    modelId: "gemini-3.5-flash",
    promptTokens: 100,
    completionTokens: 50,
    latencyMs: 500,
    estimatedCost: 0.001,
    status: "completed",
    startedAt: "2026-07-02T00:00:00.000Z",
  });

  const result = await handleGetSimulationCostSummaryRequest("sim_cost_api", {
    service,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.totalTokens, 150);
});

async function makeDeps(simulationId: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-task-api-"));
  const repo = new FileSimulationTaskRepository({ rootDir: dir });
  const service = new SimulationTaskService({
    repo,
    createId: () => simulationId,
    now: () => "2026-07-02T00:00:00.000Z",
  });

  return { repo, service };
}
