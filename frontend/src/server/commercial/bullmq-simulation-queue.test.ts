import assert from "node:assert/strict";
import test from "node:test";

import {
  type BullMqSimulationJobOptions,
  BULLMQ_SIMULATION_JOB_NAME,
  BULLMQ_SIMULATION_QUEUE_NAME,
  BullMqSimulationQueue,
} from "./bullmq-simulation-queue.js";
import type { SimulationQueueJob } from "./simulation-queue.js";

const CREATED_AT = "2026-07-07T00:00:00.000Z";

test("BullMQ simulation queue name is stable", () => {
  assert.equal(BULLMQ_SIMULATION_QUEUE_NAME, "tryitout:simulation-tasks");
  assert.equal(BULLMQ_SIMULATION_JOB_NAME, "run-simulation-task");
});

test("BullMQ job id equals task id", async () => {
  const fakeQueue = new FakeBullQueue();
  const queue = new BullMqSimulationQueue({ queue: fakeQueue });

  await queue.enqueue(job({ taskId: "task_1" }));

  assert.equal(fakeQueue.addCalls[0]?.options.jobId, "task_1");
});

test("BullMQ job data includes weight and idempotency key", async () => {
  const fakeQueue = new FakeBullQueue();
  const queue = new BullMqSimulationQueue({ queue: fakeQueue });

  await queue.enqueue(job({
    taskId: "task_1",
    weight: 3,
    idempotencyKey: "idem_1",
  }));

  assert.deepEqual(fakeQueue.addCalls[0]?.data, {
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    providerMode: "platform",
    weight: 3,
    priority: 7,
    idempotencyKey: "idem_1",
    queuedAt: CREATED_AT,
  });
});

test("BullMQ retry and backoff options are set", async () => {
  const fakeQueue = new FakeBullQueue();
  const queue = new BullMqSimulationQueue({ queue: fakeQueue });

  await queue.enqueue(job({ taskId: "task_1" }));

  assert.deepEqual(fakeQueue.addCalls[0]?.options, {
    jobId: "task_1",
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000,
    },
    priority: 7,
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
});

test("BullMQ adapter does not expose unsafe manual claim semantics", async () => {
  const queue = new BullMqSimulationQueue({ queue: new FakeBullQueue() });

  await assert.rejects(queue.claimNext(), /BullMQ worker processor/);
  await assert.rejects(queue.release("claim_1"), /BullMQ worker processor/);
});

function job(overrides: Partial<SimulationQueueJob> = {}): SimulationQueueJob {
  return {
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    providerMode: "platform",
    weight: 3,
    priority: 7,
    idempotencyKey: "idem_1",
    queuedAt: CREATED_AT,
    ...overrides,
  };
}

class FakeBullQueue {
  readonly name = BULLMQ_SIMULATION_QUEUE_NAME;
  readonly addCalls: Array<{
    name: string;
    data: SimulationQueueJob;
    options: BullMqSimulationJobOptions;
  }> = [];

  async add(
    name: string,
    data: SimulationQueueJob,
    options: BullMqSimulationJobOptions,
  ): Promise<void> {
    this.addCalls.push({ name, data, options });
  }
}
