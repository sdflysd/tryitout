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
import { getSimulationJobWeight } from "./simulation-queue.js";
import type { SimulationCheckpointSnapshot } from "../simulations/multi-agent-runner.js";

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
  await options.repository.saveWorkerHeartbeat({
    workerId: options.workerId,
    activeWeight: getSimulationJobWeight(options.claim.job),
    currentTaskId: taskId,
    lastHeartbeatAt: taskRun.startedAt,
  });

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
    const checkpoint = await options.repository.getLatestCommercialCheckpoint(taskId);
    const recoverableCheckpoint = checkpoint?.checkpoint ??
      (isRecoverableWorkerError(error) ? buildInitialRecoverableCheckpoint() : undefined);
    if (recoverableCheckpoint !== undefined) {
      await options.taskService.markRecoverableFailed({
        taskId,
        error,
        checkpoint: recoverableCheckpoint,
      });
    } else {
      await options.taskService.markFailed({ taskId, error });
    }
    throw error;
  } finally {
    await options.queue.release(options.claim.claimId);
    await options.repository.saveWorkerHeartbeat({
      workerId: options.workerId,
      activeWeight: 0,
      lastHeartbeatAt: taskRun.completedAt ?? currentIso(),
    });
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

function buildInitialRecoverableCheckpoint(): SimulationCheckpointSnapshot {
  return {
    nextStep: "safety_check",
  };
}

function isRecoverableWorkerError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }

  const code = getErrorCode(error);
  if (
    code !== undefined &&
    [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "EAI_AGAIN",
      "ENOTFOUND",
      "ABORT_ERR",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_SOCKET",
      "AI_JSON_PARSE_ERROR",
    ].includes(code)
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /timeout|timed out|deadline|network|fetch failed|rate limit|too many requests|temporar|unavailable|service unavailable|malformed json|unterminated string/i
    .test(error.message);
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  if (typeof status === "number") {
    return Number.isInteger(status) ? status : undefined;
  }
  if (typeof status === "string") {
    const parsed = Number(status);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}
