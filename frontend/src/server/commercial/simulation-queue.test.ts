import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemorySimulationQueue,
  WeightedConcurrencyLimiter,
  getSimulationJobWeight,
} from "./simulation-queue.js";

test("ordinary tasks have weight 1 and deep tasks have weight 3", () => {
  assert.equal(getSimulationJobWeight("legacy"), 1);
  assert.equal(getSimulationJobWeight("enabled"), 3);
});

test("queue job contains task id, user id, mode, weight, and idempotency key", async () => {
  const queue = new InMemorySimulationQueue();

  const job = await queue.enqueue({
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    idempotencyKey: "task_1:enqueue",
  });

  assert.equal(job.id, "task_1");
  assert.deepEqual(job.data, {
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    weight: 3,
    idempotencyKey: "task_1:enqueue",
  });
  assert.deepEqual(await queue.next(), job);
});

test("weighted limiter allows jobs only while active weight stays within budget", () => {
  const limiter = new WeightedConcurrencyLimiter(4);

  assert.equal(limiter.tryAcquire({ id: "task_1", weight: 3 }), true);
  assert.equal(limiter.activeWeight, 3);
  assert.equal(limiter.tryAcquire({ id: "task_2", weight: 1 }), true);
  assert.equal(limiter.activeWeight, 4);
  assert.equal(limiter.tryAcquire({ id: "task_3", weight: 1 }), false);
  assert.equal(limiter.activeWeight, 4);
});

test("releasing a job lowers active weight", () => {
  const limiter = new WeightedConcurrencyLimiter(3);

  assert.equal(limiter.tryAcquire({ id: "task_1", weight: 3 }), true);
  limiter.release("task_1");

  assert.equal(limiter.activeWeight, 0);
  assert.equal(limiter.tryAcquire({ id: "task_2", weight: 3 }), true);
});
