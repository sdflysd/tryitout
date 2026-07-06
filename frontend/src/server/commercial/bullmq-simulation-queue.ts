import { Queue } from "bullmq";

import {
  getSimulationJobWeight,
  type EnqueueSimulationJobInput,
  type SimulationQueue,
  type SimulationQueueJob,
  type SimulationQueueJobData,
} from "./simulation-queue.js";

export const SIMULATION_QUEUE_NAME = "commercial-simulation-tasks";

export interface BullMqQueueLike {
  add(
    name: string,
    data: SimulationQueueJobData,
    options: BullMqJobOptions,
  ): Promise<{ id: string | undefined }>;
}

export interface BullMqJobOptions {
  jobId: string;
  attempts: number;
  backoff: {
    type: "exponential";
    delay: number;
  };
  removeOnComplete: number;
  removeOnFail: number;
}

export type BullMqQueueConstructor<TQueue extends BullMqQueueLike = BullMqQueueLike> = new (
  name: string,
  options: { connection: unknown },
) => TQueue;

export interface BullMqSimulationQueueOptions<TQueue extends BullMqQueueLike = BullMqQueueLike> {
  connection: unknown;
  QueueCtor?: BullMqQueueConstructor<TQueue>;
}

export class BullMqSimulationQueue<TQueue extends BullMqQueueLike = BullMqQueueLike>
  implements SimulationQueue
{
  readonly queue: TQueue;

  constructor(options: BullMqSimulationQueueOptions<TQueue>) {
    const QueueCtor = (options.QueueCtor ?? Queue) as BullMqQueueConstructor<TQueue>;
    this.queue = new QueueCtor(SIMULATION_QUEUE_NAME, { connection: options.connection });
  }

  async enqueue(input: EnqueueSimulationJobInput): Promise<SimulationQueueJob> {
    const data: SimulationQueueJobData = {
      taskId: input.taskId,
      userId: input.userId,
      interactionMode: input.interactionMode,
      weight: getSimulationJobWeight(input.interactionMode),
      idempotencyKey: input.idempotencyKey,
    };
    const options: BullMqJobOptions = {
      jobId: input.taskId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    };

    const job = await this.queue.add("run-simulation", data, options);
    return {
      id: job.id ?? input.taskId,
      data,
    };
  }
}
