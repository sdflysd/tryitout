import type {
  InteractionMode,
} from "../../types.js";
import type {
  ProviderMode,
} from "../../contracts/commercial.js";
import type { CommercialSimulationTaskRecord } from "./types.js";

export interface SimulationQueueJob {
  taskId: string;
  userId: string;
  interactionMode: InteractionMode;
  providerMode: ProviderMode;
  weight: number;
  priority: number;
  idempotencyKey: string;
  queuedAt: string;
}

export interface SimulationQueueClaim {
  claimId: string;
  job: SimulationQueueJob;
}

export interface SimulationQueue {
  enqueue(job: SimulationQueueJob): Promise<void>;
  claimNext(): Promise<SimulationQueueClaim | undefined>;
  release(claimId: string): Promise<boolean>;
}

export function getSimulationJobWeight(
  task: Pick<CommercialSimulationTaskRecord, "interactionMode" | "queueWeight">,
): number {
  if (task.queueWeight !== undefined) {
    return validateWeight(task.queueWeight);
  }
  return task.interactionMode === "enabled" ? 3 : 1;
}

export function toSimulationQueueJob(
  task: CommercialSimulationTaskRecord,
): SimulationQueueJob {
  return {
    taskId: task.id,
    userId: task.userId,
    interactionMode: task.interactionMode,
    providerMode: task.providerMode,
    weight: getSimulationJobWeight(task),
    priority: task.priority ?? 0,
    idempotencyKey: task.idempotencyKey ?? task.id,
    queuedAt: task.queuedAt ?? task.createdAt,
  };
}

export class WeightedConcurrencyLimiter {
  private readonly claims = new Map<string, SimulationQueueJob>();
  private sequence = 0;

  constructor(readonly maxActiveWeight: number) {
    validateWeight(maxActiveWeight);
  }

  get activeWeight(): number {
    return Array.from(this.claims.values()).reduce(
      (total, job) => total + job.weight,
      0,
    );
  }

  tryClaim(job: SimulationQueueJob): SimulationQueueClaim | undefined {
    validateWeight(job.weight);
    if (this.activeWeight + job.weight > this.maxActiveWeight) {
      return undefined;
    }
    const claimId = `queue_claim_${++this.sequence}`;
    this.claims.set(claimId, job);
    return { claimId, job };
  }

  release(claimId: string): boolean {
    return this.claims.delete(claimId);
  }
}

export interface InMemorySimulationQueueOptions {
  maxActiveWeight: number;
}

export class InMemorySimulationQueue implements SimulationQueue {
  private readonly queued: SimulationQueueJob[] = [];
  private readonly limiter: WeightedConcurrencyLimiter;

  constructor(options: InMemorySimulationQueueOptions) {
    this.limiter = new WeightedConcurrencyLimiter(options.maxActiveWeight);
  }

  get activeWeight(): number {
    return this.limiter.activeWeight;
  }

  async enqueue(job: SimulationQueueJob): Promise<void> {
    validateWeight(job.weight);
    this.queued.push({ ...job });
  }

  async claimNext(): Promise<SimulationQueueClaim | undefined> {
    const sorted = this.queued
      .map((job, index) => ({ job, index }))
      .sort((left, right) => {
        if (right.job.priority !== left.job.priority) {
          return right.job.priority - left.job.priority;
        }
        if (left.job.queuedAt !== right.job.queuedAt) {
          return left.job.queuedAt.localeCompare(right.job.queuedAt);
        }
        return left.index - right.index;
      });

    for (const candidate of sorted) {
      const claim = this.limiter.tryClaim(candidate.job);
      if (claim !== undefined) {
        this.queued.splice(candidate.index, 1);
        return claim;
      }
    }

    return undefined;
  }

  async release(claimId: string): Promise<boolean> {
    return this.limiter.release(claimId);
  }
}

function validateWeight(weight: number): number {
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("Simulation queue weight must be a positive integer");
  }
  return weight;
}
