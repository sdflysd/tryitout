import { randomUUID } from "node:crypto";

import type { SimulationApiResponse } from "../../types.js";
import type { CommercialTaskService } from "./commercial-task-service.js";
import type { CommercialRepository } from "./repository.js";
import type {
  SimulationQueue,
  SimulationQueueClaim,
} from "./simulation-queue.js";
import type {
  SimulationStepRunCostRecord,
  SimulationTaskRunRecord,
} from "./types.js";

export type SimulationWorkerStepRunInput = Omit<
  SimulationStepRunCostRecord,
  "id" | "taskId" | "taskRunId" | "startedAt"
> & {
  startedAt?: string;
};

export type SimulationWorkerRunSimulation = (hooks: {
  recordStepRun: (run: SimulationWorkerStepRunInput) => Promise<void>;
}) => Promise<SimulationApiResponse>;

export interface RunSimulationQueueJobOptions {
  claim: SimulationQueueClaim;
  queue: Pick<SimulationQueue, "release">;
  repository: CommercialRepository;
  taskService: CommercialTaskService;
  workerId: string;
  runSimulation: SimulationWorkerRunSimulation;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
}

export interface RunSimulationQueueOnceOptions
  extends Omit<RunSimulationQueueJobOptions, "claim"> {
  queue: SimulationQueue;
}

export async function runSimulationQueueOnce(
  options: RunSimulationQueueOnceOptions,
): Promise<SimulationQueueClaim | undefined> {
  const claim = await options.queue.claimNext();
  if (claim === undefined) {
    return undefined;
  }
  await runSimulationQueueJob({ ...options, claim });
  return claim;
}

export async function runSimulationQueueJob(
  options: RunSimulationQueueJobOptions,
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const createId =
    options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
  const currentIso = () => toIso(now());
  const taskId = options.claim.job.taskId;
  let taskRun = buildTaskRun({
    createId,
    taskId,
    workerId: options.workerId,
    attempt: await nextAttempt(options.repository, taskId),
    startedAt: currentIso(),
  });
  await options.repository.saveSimulationTaskRun(taskRun);

  try {
    await options.taskService.markRunning({ taskId });
    const report = await options.runSimulation({
      recordStepRun: async (run) => {
        await options.repository.appendSimulationStepRunCost({
          id: createId("simulation_step_run"),
          taskRunId: taskRun.id,
          taskId,
          startedAt: run.startedAt ?? currentIso(),
          ...run,
        });
      },
    });
    const completedAt = currentIso();
    taskRun = { ...taskRun, status: "completed", completedAt };
    await options.repository.saveSimulationTaskRun(taskRun);
    await options.taskService.markCompleted({
      taskId,
      publicReport: report,
      deepReport: report.report,
    });
  } catch (error) {
    const failedAt = currentIso();
    const errorCode = normalizeErrorCode(error);
    taskRun = {
      ...taskRun,
      status: "failed",
      errorCode,
      completedAt: failedAt,
    };
    await options.repository.saveSimulationTaskRun(taskRun);
    await options.taskService.markFailed({ taskId, error });
    throw error;
  } finally {
    await options.queue.release(options.claim.claimId);
  }
}

async function nextAttempt(
  repository: CommercialRepository,
  taskId: string,
): Promise<number> {
  return (await repository.listSimulationTaskRuns(taskId)).length + 1;
}

function buildTaskRun(input: {
  createId: (prefix?: string) => string;
  taskId: string;
  workerId: string;
  attempt: number;
  startedAt: string;
}): SimulationTaskRunRecord {
  return {
    id: input.createId("simulation_task_run"),
    taskId: input.taskId,
    workerId: input.workerId,
    attempt: input.attempt,
    status: "running",
    startedAt: input.startedAt,
  };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid worker clock value");
  }
  return date.toISOString();
}

function normalizeErrorCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "unknown";
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || "unknown_error";
}
