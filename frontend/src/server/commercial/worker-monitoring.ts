import type { CommercialRepository } from "./repository.js";
import { getSimulationJobWeight } from "./simulation-queue.js";
import type {
  CommercialSimulationTaskRecord,
  WorkerHeartbeatRecord,
} from "./types.js";

export interface WorkerMonitoringServiceOptions {
  repository: CommercialRepository;
  maxActiveWeight: number;
  now?: () => Date | string;
}

export interface WorkerHeartbeatInput {
  workerId: string;
  activeWeight: number;
  currentTaskId?: string;
}

export interface QueueSummary {
  queued: number;
  running: number;
  retrying: number;
  stuck: number;
  activeWeight: number;
  maxWeight: number;
  oldestQueuedAt?: string;
  workers: WorkerHeartbeatRecord[];
}

const DEFAULT_STUCK_THRESHOLD_MS = 15 * 60 * 1000;

export class WorkerMonitoringService {
  private readonly repository: CommercialRepository;
  private readonly maxActiveWeight: number;
  private readonly now: () => Date | string;

  constructor(options: WorkerMonitoringServiceOptions) {
    this.repository = options.repository;
    this.maxActiveWeight = options.maxActiveWeight;
    this.now = options.now ?? (() => new Date());
  }

  async recordHeartbeat(input: WorkerHeartbeatInput): Promise<WorkerHeartbeatRecord> {
    const heartbeat: WorkerHeartbeatRecord = {
      workerId: requireString(input.workerId, "workerId"),
      activeWeight: requireNonNegativeInteger(input.activeWeight, "activeWeight"),
      lastHeartbeatAt: toIso(this.now()),
    };
    if (input.currentTaskId !== undefined) {
      heartbeat.currentTaskId = requireString(input.currentTaskId, "currentTaskId");
    }
    await this.repository.saveWorkerHeartbeat(heartbeat);
    return heartbeat;
  }

  async detectStuckTasks(input: {
    thresholdMs?: number;
  } = {}): Promise<CommercialSimulationTaskRecord[]> {
    const thresholdMs = input.thresholdMs ?? DEFAULT_STUCK_THRESHOLD_MS;
    const cutoff = new Date(toIso(this.now())).getTime() - thresholdMs;
    const tasks = await this.repository.listCommercialTasks();
    return tasks
      .filter((task) => task.status === "running")
      .filter((task) => {
        const startedAt = task.startedAt ?? task.updatedAt ?? task.createdAt;
        const startedTime = Date.parse(startedAt);
        return Number.isFinite(startedTime) && startedTime <= cutoff;
      })
      .sort((left, right) => {
        const leftStartedAt = left.startedAt ?? left.updatedAt ?? left.createdAt;
        const rightStartedAt = right.startedAt ?? right.updatedAt ?? right.createdAt;
        if (leftStartedAt !== rightStartedAt) {
          return leftStartedAt.localeCompare(rightStartedAt);
        }
        return left.id.localeCompare(right.id);
      });
  }

  async getQueueSummary(input: {
    stuckThresholdMs?: number;
  } = {}): Promise<QueueSummary> {
    const [tasks, workers, stuckTasks] = await Promise.all([
      this.repository.listCommercialTasks(),
      this.repository.listWorkerHeartbeats(),
      this.detectStuckTasks({ thresholdMs: input.stuckThresholdMs }),
    ]);
    const queuedTasks = tasks.filter((task) => task.status === "queued");
    const runningTasks = tasks.filter((task) => task.status === "running");
    const workerActiveWeight = workers.reduce(
      (total, heartbeat) => total + heartbeat.activeWeight,
      0,
    );
    const inferredActiveWeight = runningTasks.reduce(
      (total, task) => total + getSimulationJobWeight(task),
      0,
    );

    return {
      queued: queuedTasks.length,
      running: runningTasks.length,
      retrying: queuedTasks.filter((task) => task.errorCode !== undefined).length,
      stuck: stuckTasks.length,
      activeWeight: workerActiveWeight || inferredActiveWeight,
      maxWeight: this.maxActiveWeight,
      ...oldestQueuedAt(queuedTasks),
      workers,
    };
  }
}

function oldestQueuedAt(
  tasks: CommercialSimulationTaskRecord[],
): { oldestQueuedAt?: string } {
  const value = tasks
    .map((task) => task.queuedAt ?? task.createdAt)
    .sort()[0];
  return value === undefined ? {} : { oldestQueuedAt: value };
}

function requireString(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid worker monitoring clock value");
  }
  return date.toISOString();
}
