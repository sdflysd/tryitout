import { Queue } from "bullmq";

import type {
  SimulationQueue,
  SimulationQueueClaim,
  SimulationQueueJob,
} from "./simulation-queue.js";

export const BULLMQ_SIMULATION_QUEUE_NAME = "tryitout-simulation-tasks";
export const BULLMQ_SIMULATION_JOB_NAME = "run-simulation-task";

export interface BullMqSimulationJobOptions {
  jobId: string;
  attempts: number;
  backoff: {
    type: "exponential";
    delay: number;
  };
  priority: number;
  removeOnComplete: number;
  removeOnFail: number;
}

export interface BullMqQueueLike {
  add(
    name: typeof BULLMQ_SIMULATION_JOB_NAME,
    data: SimulationQueueJob,
    options: BullMqSimulationJobOptions,
  ): Promise<unknown>;
}

export interface BullMqSimulationQueueOptions {
  queue?: BullMqQueueLike;
  connection?: string;
}

export class BullMqSimulationQueue implements SimulationQueue {
  private readonly queue: BullMqQueueLike;

  constructor(options: BullMqSimulationQueueOptions = {}) {
    this.queue =
      options.queue ??
      new Queue<SimulationQueueJob, unknown, typeof BULLMQ_SIMULATION_JOB_NAME>(
        BULLMQ_SIMULATION_QUEUE_NAME,
        options.connection === undefined
          ? undefined
          : { connection: { url: options.connection } },
      );
  }

  async enqueue(job: SimulationQueueJob): Promise<void> {
    await this.queue.add(BULLMQ_SIMULATION_JOB_NAME, { ...job }, {
      jobId: job.taskId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1_000,
      },
      priority: job.priority,
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  async claimNext(): Promise<SimulationQueueClaim | undefined> {
    throw new Error(
      "BullMQ worker processor owns simulation queue claims; use a BullMQ Worker instead.",
    );
  }

  async release(_claimId: string): Promise<boolean> {
    throw new Error(
      "BullMQ worker processor owns simulation queue claims; use a BullMQ Worker instead.",
    );
  }
}
