import type { InteractionMode } from "../../types.js";

export interface SimulationQueueJobData {
  taskId: string;
  userId: string;
  interactionMode: InteractionMode;
  weight: number;
  idempotencyKey: string;
}

export interface SimulationQueueJob {
  id: string;
  data: SimulationQueueJobData;
}

export interface EnqueueSimulationJobInput {
  taskId: string;
  userId: string;
  interactionMode: InteractionMode;
  idempotencyKey: string;
}

export interface SimulationQueue {
  enqueue(input: EnqueueSimulationJobInput): Promise<SimulationQueueJob>;
}

export function getSimulationJobWeight(interactionMode: InteractionMode): number {
  return interactionMode === "enabled" ? 3 : 1;
}

export class WeightedConcurrencyLimiter {
  private readonly activeJobs = new Map<string, number>();

  constructor(private readonly maxWeight: number) {}

  get activeWeight(): number {
    return [...this.activeJobs.values()].reduce((total, weight) => total + weight, 0);
  }

  tryAcquire(job: { id: string; weight: number }): boolean {
    if (this.activeJobs.has(job.id)) {
      return true;
    }
    if (this.activeWeight + job.weight > this.maxWeight) {
      return false;
    }
    this.activeJobs.set(job.id, job.weight);
    return true;
  }

  release(jobId: string): void {
    this.activeJobs.delete(jobId);
  }
}

export class InMemorySimulationQueue implements SimulationQueue {
  private readonly jobs: SimulationQueueJob[] = [];

  async enqueue(input: EnqueueSimulationJobInput): Promise<SimulationQueueJob> {
    const job: SimulationQueueJob = {
      id: input.taskId,
      data: {
        taskId: input.taskId,
        userId: input.userId,
        interactionMode: input.interactionMode,
        weight: getSimulationJobWeight(input.interactionMode),
        idempotencyKey: input.idempotencyKey,
      },
    };
    this.jobs.push(job);
    return job;
  }

  async next(): Promise<SimulationQueueJob | undefined> {
    return this.jobs.shift();
  }
}
