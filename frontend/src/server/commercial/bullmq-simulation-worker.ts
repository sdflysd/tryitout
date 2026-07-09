import type { Job } from "bullmq";
import { Worker } from "bullmq";

import {
  BULLMQ_SIMULATION_JOB_NAME,
  BULLMQ_SIMULATION_QUEUE_NAME,
} from "./bullmq-simulation-queue.js";
import type {
  SimulationQueueClaim,
  SimulationQueueJob,
} from "./simulation-queue.js";

export {
  BULLMQ_SIMULATION_JOB_NAME,
  BULLMQ_SIMULATION_QUEUE_NAME,
} from "./bullmq-simulation-queue.js";

export type BullMqSimulationProcessor = (
  job: Pick<Job<SimulationQueueJob, void, string>, "id" | "name" | "data">,
) => Promise<void>;

export interface CreateBullMqSimulationProcessorOptions {
  runClaim: (claim: SimulationQueueClaim) => Promise<void>;
}

export interface CreateBullMqSimulationWorkerOptions
  extends CreateBullMqSimulationProcessorOptions {
  redisUrl: string;
  workerId: string;
  concurrency?: number;
}

export function createBullMqSimulationProcessor(
  options: CreateBullMqSimulationProcessorOptions,
): BullMqSimulationProcessor {
  return async (job) => {
    if (job.name !== BULLMQ_SIMULATION_JOB_NAME) {
      throw new Error(`Unexpected BullMQ simulation job name: ${job.name}`);
    }

    await options.runClaim({
      claimId: `bullmq:${job.id ?? job.data.taskId}`,
      job: job.data,
    });
  };
}

export function createBullMqSimulationWorker(
  options: CreateBullMqSimulationWorkerOptions,
): Worker<SimulationQueueJob, void, typeof BULLMQ_SIMULATION_JOB_NAME> {
  return new Worker<SimulationQueueJob, void, typeof BULLMQ_SIMULATION_JOB_NAME>(
    BULLMQ_SIMULATION_QUEUE_NAME,
    createBullMqSimulationProcessor(options),
    {
      connection: { url: options.redisUrl },
      concurrency: options.concurrency ?? 1,
      name: options.workerId,
    },
  );
}
