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
  private readonly claims = new Map<
    string,
    { job: SimulationQueueJob; claimedWeight: number }
  >();
  private sequence = 0;

  constructor(readonly maxActiveWeight: number) {
    validateWeight(maxActiveWeight);
  }

  get activeWeight(): number {
    return Array.from(this.claims.values()).reduce(
      (total, claim) => total + claim.claimedWeight,
      0,
    );
  }

  tryClaim(job: SimulationQueueJob): SimulationQueueClaim | undefined {
    const claimJob = freezeSimulationQueueJob(validateSimulationQueueJob(job));
    if (this.activeWeight + claimJob.weight > this.maxActiveWeight) {
      return undefined;
    }
    const claimId = `queue_claim_${++this.sequence}`;
    this.claims.set(claimId, {
      job: claimJob,
      claimedWeight: claimJob.weight,
    });
    return { claimId, job: claimJob };
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
  private readonly activeIdempotencyKeysByClaimId = new Map<string, string>();
  private readonly limiter: WeightedConcurrencyLimiter;

  constructor(options: InMemorySimulationQueueOptions) {
    this.limiter = new WeightedConcurrencyLimiter(options.maxActiveWeight);
  }

  get activeWeight(): number {
    return this.limiter.activeWeight;
  }

  async enqueue(job: SimulationQueueJob): Promise<void> {
    const queueJob = freezeSimulationQueueJob(validateSimulationQueueJob(job));
    if (queueJob.weight > this.limiter.maxActiveWeight) {
      throw new Error(
        "Simulation queue job weight cannot exceed maximum active weight",
      );
    }
    if (this.hasIdempotencyKey(queueJob.idempotencyKey)) {
      return;
    }
    this.queued.push(queueJob);
  }

  async claimNext(): Promise<SimulationQueueClaim | undefined> {
    const candidate = this.nextQueuedCandidate();
    if (candidate === undefined) {
      return undefined;
    }

    const claim = this.limiter.tryClaim(candidate.job);
    if (claim === undefined) {
      return undefined;
    }

    this.queued.splice(candidate.index, 1);
    this.activeIdempotencyKeysByClaimId.set(
      claim.claimId,
      claim.job.idempotencyKey,
    );
    return claim;
  }

  async release(claimId: string): Promise<boolean> {
    const released = this.limiter.release(claimId);
    if (released) {
      this.activeIdempotencyKeysByClaimId.delete(claimId);
    }
    return released;
  }

  private hasIdempotencyKey(idempotencyKey: string): boolean {
    if (
      Array.from(this.activeIdempotencyKeysByClaimId.values()).includes(
        idempotencyKey,
      )
    ) {
      return true;
    }
    return this.queued.some((job) => job.idempotencyKey === idempotencyKey);
  }

  private nextQueuedCandidate():
    | { job: SimulationQueueJob; index: number }
    | undefined {
    return this.queued
      .map((job, index) => ({ job, index }))
      .sort((left, right) => {
        if (right.job.priority !== left.job.priority) {
          return right.job.priority - left.job.priority;
        }
        if (left.job.queuedAt !== right.job.queuedAt) {
          return left.job.queuedAt.localeCompare(right.job.queuedAt);
        }
        return left.index - right.index;
      })[0];
  }
}

function validateSimulationQueueJob(job: SimulationQueueJob): SimulationQueueJob {
  const idempotencyKey = validateRequiredString(
    job.idempotencyKey,
    "idempotencyKey",
  );
  return {
    ...job,
    taskId: validateRequiredString(job.taskId, "taskId"),
    userId: validateRequiredString(job.userId, "userId"),
    weight: validateWeight(job.weight),
    priority: validatePriority(job.priority),
    idempotencyKey,
    queuedAt: validateQueuedAt(job.queuedAt),
  };
}

function validateWeight(weight: number): number {
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("Simulation queue weight must be a positive integer");
  }
  return weight;
}

function validatePriority(priority: number): number {
  if (!Number.isInteger(priority)) {
    throw new Error("Simulation queue priority must be an integer");
  }
  return priority;
}

function validateQueuedAt(queuedAt: string): string {
  if (typeof queuedAt !== "string" || Number.isNaN(Date.parse(queuedAt))) {
    throw new Error("Simulation queue queuedAt must be a valid timestamp");
  }
  return queuedAt;
}

function validateRequiredString(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Simulation queue ${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function freezeSimulationQueueJob(job: SimulationQueueJob): SimulationQueueJob {
  return Object.freeze({ ...job }) as SimulationQueueJob;
}
