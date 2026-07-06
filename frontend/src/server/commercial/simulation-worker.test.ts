import assert from "node:assert/strict";
import test from "node:test";

import { runCommercialSimulationQueueJob } from "./simulation-worker.js";
import { WeightedConcurrencyLimiter, type SimulationQueueJob } from "./simulation-queue.js";
import type { CommercialTaskStatusDto } from "./commercial-task-service.js";
import type { Report } from "../../types.js";

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

class FakeTaskService {
  calls: string[] = [];
  completedCount = 0;

  async markRunning(taskId: string): Promise<CommercialTaskStatusDto> {
    this.calls.push(`running:${taskId}`);
    return status(taskId, "running");
  }

  async markCompleted(input: { taskId: string; report: Report }): Promise<CommercialTaskStatusDto> {
    this.calls.push(`completed:${input.taskId}:${input.report.projectName}`);
    this.completedCount += 1;
    return status(input.taskId, "completed");
  }

  async markFailed(input: { taskId: string; errorCode: string }): Promise<CommercialTaskStatusDto> {
    this.calls.push(`failed:${input.taskId}:${input.errorCode}`);
    return status(input.taskId, "failed");
  }
}

function job(weight = 1): SimulationQueueJob {
  return {
    id: "task_1",
    data: {
      taskId: "task_1",
      userId: "user_1",
      interactionMode: weight === 3 ? "enabled" : "legacy",
      weight,
      idempotencyKey: "task_1:enqueue",
    },
  };
}

function status(taskId: string, taskStatus: CommercialTaskStatusDto["status"]): CommercialTaskStatusDto {
  return {
    taskId,
    status: taskStatus,
    scenario: "side_hustle",
    interactionMode: "legacy",
    providerMode: "platform",
    creditCost: 1,
  };
}

test("worker claims a job only when weighted limiter has capacity", async () => {
  const limiter = new WeightedConcurrencyLimiter(2);
  assert.equal(limiter.tryAcquire({ id: "already_running", weight: 2 }), true);
  const taskService = new FakeTaskService();

  const result = await runCommercialSimulationQueueJob({
    job: job(1),
    taskService,
    limiter,
    runSimulation: async () => sampleReport,
  });

  assert.equal(result.status, "deferred");
  assert.deepEqual(taskService.calls, []);
});

test("worker marks task running before calling simulation and completes on success", async () => {
  const limiter = new WeightedConcurrencyLimiter(3);
  const taskService = new FakeTaskService();
  const calls: string[] = [];

  const result = await runCommercialSimulationQueueJob({
    job: job(3),
    taskService,
    limiter,
    runSimulation: async () => {
      calls.push("simulation");
      return sampleReport;
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(taskService.calls, ["running:task_1", "completed:task_1:Launch"]);
  assert.deepEqual(calls, ["simulation"]);
});

test("worker calls markFailed on provider errors", async () => {
  const limiter = new WeightedConcurrencyLimiter(3);
  const taskService = new FakeTaskService();

  const result = await runCommercialSimulationQueueJob({
    job: job(1),
    taskService,
    limiter,
    runSimulation: async () => {
      throw new Error("Provider timed out");
    },
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(taskService.calls, ["running:task_1", "failed:task_1:provider_error"]);
});

test("worker releases limiter capacity in finally", async () => {
  const limiter = new WeightedConcurrencyLimiter(1);
  const taskService = new FakeTaskService();

  await runCommercialSimulationQueueJob({
    job: job(1),
    taskService,
    limiter,
    runSimulation: async () => {
      throw new Error("boom");
    },
  });

  assert.equal(limiter.activeWeight, 0);
  assert.equal(limiter.tryAcquire({ id: "next", weight: 1 }), true);
});

test("worker retry of same completed task does not double-capture credits", async () => {
  const limiter = new WeightedConcurrencyLimiter(3);
  const taskService = new FakeTaskService();

  await runCommercialSimulationQueueJob({
    job: job(1),
    taskService,
    limiter,
    runSimulation: async () => sampleReport,
  });
  await runCommercialSimulationQueueJob({
    job: job(1),
    taskService,
    limiter,
    runSimulation: async () => sampleReport,
  });

  assert.equal(taskService.completedCount, 2);
  assert.equal(limiter.activeWeight, 0);
});
