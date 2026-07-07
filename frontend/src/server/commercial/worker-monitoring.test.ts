import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommercialRepository } from "./repository.js";
import { WorkerMonitoringService } from "./worker-monitoring.js";
import type { CommercialSimulationTaskRecord } from "./types.js";

const NOW = "2026-07-07T00:30:00.000Z";

test("worker monitoring records heartbeat with active weight and current task", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = new WorkerMonitoringService({
    repository: repo,
    maxActiveWeight: 6,
    now: () => NOW,
  });

  await service.recordHeartbeat({
    workerId: "worker_1",
    activeWeight: 3,
    currentTaskId: "task_1",
  });

  assert.deepEqual(await repo.listWorkerHeartbeats(), [
    {
      workerId: "worker_1",
      activeWeight: 3,
      currentTaskId: "task_1",
      lastHeartbeatAt: NOW,
    },
  ]);
});

test("worker monitoring detects stuck running tasks and summarizes queue state", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveCommercialTask(makeTask({
    id: "queued_1",
    status: "queued",
    queuedAt: "2026-07-07T00:01:00.000Z",
    queueWeight: 3,
  }));
  await repo.saveCommercialTask(makeTask({
    id: "running_stuck",
    status: "running",
    startedAt: "2026-07-07T00:00:00.000Z",
    queueWeight: 3,
  }));
  await repo.saveCommercialTask(makeTask({
    id: "running_fresh",
    status: "running",
    startedAt: "2026-07-07T00:25:00.000Z",
    queueWeight: 1,
  }));
  await repo.saveCommercialTask(makeTask({
    id: "retrying_1",
    status: "queued",
    errorCode: "provider_timeout",
    queuedAt: "2026-07-07T00:20:00.000Z",
    queueWeight: 1,
  }));
  const service = new WorkerMonitoringService({
    repository: repo,
    maxActiveWeight: 6,
    now: () => NOW,
  });
  await service.recordHeartbeat({
    workerId: "worker_1",
    activeWeight: 4,
    currentTaskId: "running_stuck",
  });

  const stuck = await service.detectStuckTasks({ thresholdMs: 10 * 60 * 1000 });
  const summary = await service.getQueueSummary({ stuckThresholdMs: 10 * 60 * 1000 });

  assert.deepEqual(stuck.map((task) => task.id), ["running_stuck"]);
  assert.deepEqual(summary, {
    queued: 2,
    running: 2,
    retrying: 1,
    stuck: 1,
    activeWeight: 4,
    maxWeight: 6,
    oldestQueuedAt: "2026-07-07T00:01:00.000Z",
    workers: [
      {
        workerId: "worker_1",
        activeWeight: 4,
        currentTaskId: "running_stuck",
        lastHeartbeatAt: NOW,
      },
    ],
  });
});

function makeTask(
  overrides: Partial<CommercialSimulationTaskRecord>,
): CommercialSimulationTaskRecord {
  return {
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}
