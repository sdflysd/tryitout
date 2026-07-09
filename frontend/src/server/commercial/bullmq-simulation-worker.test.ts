import assert from "node:assert/strict";
import test from "node:test";

import {
  BULLMQ_SIMULATION_JOB_NAME,
  createBullMqSimulationProcessor,
} from "./bullmq-simulation-worker.js";
import type { SimulationQueueClaim, SimulationQueueJob } from "./simulation-queue.js";

const CREATED_AT = "2026-07-07T00:00:00.000Z";

test("BullMQ processor converts a job into a simulation queue claim", async () => {
  const calls: SimulationQueueClaim[] = [];
  const processor = createBullMqSimulationProcessor({
    runClaim: async (claim) => {
      calls.push(claim);
    },
  });

  await processor(fakeJob({ id: "bull_job_1", data: job({ taskId: "task_1" }) }));

  assert.deepEqual(calls, [
    {
      claimId: "bullmq:bull_job_1",
      job: job({ taskId: "task_1" }),
    },
  ]);
});

test("BullMQ processor rejects unexpected job names", async () => {
  const processor = createBullMqSimulationProcessor({
    runClaim: async () => undefined,
  });

  await assert.rejects(
    processor(fakeJob({ name: "other-job", data: job({ taskId: "task_1" }) })),
    /Unexpected BullMQ simulation job name/,
  );
});

function fakeJob(input: {
  id?: string;
  name?: string;
  data: SimulationQueueJob;
}) {
  return {
    id: input.id,
    name: input.name ?? BULLMQ_SIMULATION_JOB_NAME,
    data: input.data,
  };
}

function job(overrides: Partial<SimulationQueueJob> = {}): SimulationQueueJob {
  return {
    taskId: "task_1",
    userId: "user_1",
    userInput: {
      type: "life_choice",
      decisionContext: "Should I quit my job?",
      optionA: "Stay",
      optionB: "Quit",
    },
    interactionMode: "enabled",
    providerMode: "platform",
    weight: 3,
    priority: 7,
    idempotencyKey: "idem_1",
    queuedAt: CREATED_AT,
    ...overrides,
  };
}
