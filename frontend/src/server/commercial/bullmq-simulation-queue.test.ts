import assert from "node:assert/strict";
import test from "node:test";

import { BullMqSimulationQueue, SIMULATION_QUEUE_NAME } from "./bullmq-simulation-queue.js";

class FakeBullQueue {
  calls: Array<{ name: string; data: unknown; options: unknown }> = [];

  constructor(
    public readonly queueName: string,
    public readonly options: unknown,
  ) {}

  async add(name: string, data: unknown, options: unknown): Promise<{ id: string | undefined }> {
    this.calls.push({ name, data, options });
    return { id: (options as { jobId?: string }).jobId };
  }
}

test("BullMQ adapter uses stable queue name", () => {
  const adapter = new BullMqSimulationQueue({
    connection: { url: "redis://localhost:6379" },
    QueueCtor: FakeBullQueue,
  });

  assert.equal(SIMULATION_QUEUE_NAME, "commercial-simulation-tasks");
  assert.equal(adapter.queue.queueName, "commercial-simulation-tasks");
});

test("BullMQ adapter enqueues task id as job id with weight and idempotency key", async () => {
  const adapter = new BullMqSimulationQueue({
    connection: { url: "redis://localhost:6379" },
    QueueCtor: FakeBullQueue,
  });

  const job = await adapter.enqueue({
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    idempotencyKey: "task_1:enqueue",
  });

  assert.equal(job.id, "task_1");
  assert.deepEqual(adapter.queue.calls[0].data, {
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    weight: 3,
    idempotencyKey: "task_1:enqueue",
  });
  assert.deepEqual(adapter.queue.calls[0].options, {
    jobId: "task_1",
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
});
