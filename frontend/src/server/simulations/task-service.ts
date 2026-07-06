import type {
  CreateSimulationTaskRequest,
  CreateSimulationTaskResponse,
  SimulationTaskStatusResponse,
} from "../../contracts/simulation-task.js";
import type { SimulationApiResponse } from "../../types.js";
import { estimateCostForModel, summarizeStepRuns } from "./cost-ledger.js";
import type { CostSummary } from "./cost-ledger.js";
import type { SimulationTaskRepository } from "./task-repository.js";
import {
  createInitialSimulationTask,
  createStepRunId,
  type SimulationCheckpointPayload,
  type SimulationCheckpointRecord,
  type SimulationReportRecord,
  type SimulationStepRunRecord,
  type SimulationTaskRecord,
} from "./task-types.js";

interface TaskServiceOptions {
  repo: SimulationTaskRepository;
  createId?: () => string;
  now?: () => string;
}

interface TaskProgressUpdate {
  currentStageIndex?: number;
  currentStepName?: string;
  progressPercent?: number;
}

interface TaskFailureUpdate extends TaskProgressUpdate {
  errorCode?: string;
}

export class SimulationTaskService {
  private readonly repo: SimulationTaskRepository;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(options: TaskServiceOptions) {
    this.repo = options.repo;
    this.createId =
      options.createId ??
      (() => `sim_${Math.random().toString(36).substring(2, 11)}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createTask(
    request: CreateSimulationTaskRequest,
  ): Promise<CreateSimulationTaskResponse> {
    const simulationId = this.createId();
    const now = this.now();
    const task = createInitialSimulationTask({
      simulationId,
      userInput: request.userInput,
      mode: request.interactionMode ?? "legacy",
      now,
    });

    await this.repo.saveTask(task);
    await this.saveCheckpoint(task, {
      stepName: "task_created",
      checkpoint: {
        userInput: request.userInput,
        mode: task.mode,
        nextStep: "generate_agents",
        publicEvents: [],
      },
    });

    return {
      simulationId,
      status: task.status,
    };
  }

  async getTask(
    simulationId: string,
  ): Promise<SimulationTaskRecord | undefined> {
    return this.repo.getTask(simulationId);
  }

  async getStatus(
    simulationId: string,
  ): Promise<SimulationTaskStatusResponse | undefined> {
    const task = await this.repo.getTask(simulationId);
    return task ? toPublicStatus(task) : undefined;
  }

  async getLatestCheckpoint(
    simulationId: string,
  ): Promise<SimulationCheckpointRecord | undefined> {
    return this.repo.getLatestCheckpoint(simulationId);
  }

  async markRunning(
    simulationId: string,
    update: TaskProgressUpdate = {},
  ): Promise<SimulationTaskRecord> {
    const task = await this.requireTask(simulationId);
    const updated = this.mergeTask(task, {
      ...update,
      status: "running",
      recoverable: false,
      errorCode: undefined,
    });

    await this.repo.saveTask(updated);
    const latestCheckpoint = await this.repo.getLatestCheckpoint(simulationId);
    await this.saveCheckpoint(updated, {
      stageIndex: update.currentStageIndex,
      stepName: update.currentStepName ?? "running",
      checkpoint: {
        ...latestCheckpoint?.checkpoint,
        userInput: updated.userInput,
        mode: updated.mode,
        nextStep: update.currentStepName,
      },
    });

    return updated;
  }

  async markCompleted(
    simulationId: string,
    publicReport: SimulationApiResponse,
  ): Promise<SimulationTaskRecord> {
    const task = await this.requireTask(simulationId);
    const now = this.now();
    const updated = this.mergeTask(task, {
      status: "completed",
      progressPercent: 100,
      recoverable: false,
      errorCode: undefined,
    });
    const report: SimulationReportRecord = {
      simulationId,
      publicReport,
      unlocked: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.saveReport(report);
    await this.repo.saveTask(updated);
    await this.saveCheckpoint(updated, {
      stepName: "completed",
      checkpoint: {
        userInput: updated.userInput,
        mode: updated.mode,
        completedReport: publicReport,
        completedStages: publicReport.stages,
        nextStep: undefined,
      },
    });

    return updated;
  }

  async markRecoverableFailure(
    simulationId: string,
    update: TaskFailureUpdate,
  ): Promise<SimulationTaskRecord> {
    const task = await this.requireTask(simulationId);
    const updated = this.mergeTask(task, {
      ...update,
      status: "recoverable_failed",
      recoverable: true,
    });

    await this.repo.saveTask(updated);
    const latestCheckpoint = await this.repo.getLatestCheckpoint(simulationId);
    await this.saveCheckpoint(updated, {
      stageIndex: update.currentStageIndex,
      stepName: update.currentStepName ?? "recoverable_failed",
      checkpoint: {
        ...latestCheckpoint?.checkpoint,
        userInput: updated.userInput,
        mode: updated.mode,
        nextStep: update.currentStepName,
      },
    });

    return updated;
  }

  async markFailed(
    simulationId: string,
    update: TaskFailureUpdate,
  ): Promise<SimulationTaskRecord> {
    const task = await this.requireTask(simulationId);
    const updated = this.mergeTask(task, {
      ...update,
      status: "failed",
      recoverable: false,
    });

    await this.repo.saveTask(updated);
    await this.saveCheckpoint(updated, {
      stageIndex: update.currentStageIndex,
      stepName: update.currentStepName ?? "failed",
      checkpoint: {
        userInput: updated.userInput,
        mode: updated.mode,
        nextStep: undefined,
      },
    });

    return updated;
  }

  async cancelTask(simulationId: string): Promise<SimulationTaskRecord> {
    const task = await this.requireTask(simulationId);
    if (task.status === "completed") {
      throw new Error("completed simulation task cannot be cancelled");
    }

    const updated = this.mergeTask(task, {
      status: "cancelled",
      recoverable: false,
      errorCode: undefined,
    });

    await this.repo.saveTask(updated);
    await this.saveCheckpoint(updated, {
      stageIndex: task.currentStageIndex,
      stepName: task.currentStepName ?? "cancelled",
      checkpoint: {
        userInput: updated.userInput,
        mode: updated.mode,
        nextStep: undefined,
      },
    });

    return updated;
  }

  async resumeRecoverableTask(
    simulationId: string,
  ): Promise<SimulationTaskRecord> {
    const task = await this.requireTask(simulationId);
    if (!task.recoverable || task.status !== "recoverable_failed") {
      throw new Error("simulation task is not recoverable");
    }

    const updated = this.mergeTask(task, {
      status: "running",
      recoverable: false,
      errorCode: undefined,
    });

    await this.repo.saveTask(updated);
    const latestCheckpoint = await this.repo.getLatestCheckpoint(simulationId);
    await this.saveCheckpoint(updated, {
      stageIndex: updated.currentStageIndex,
      stepName: updated.currentStepName ?? "resume",
      checkpoint: {
        ...latestCheckpoint?.checkpoint,
        userInput: updated.userInput,
        mode: updated.mode,
        nextStep: updated.currentStepName ?? "resume",
      },
    });

    return updated;
  }

  async recordModelCall(
    input: Omit<SimulationStepRunRecord, "id" | "totalTokens"> & {
      id?: string;
      totalTokens?: number;
    },
  ): Promise<SimulationStepRunRecord> {
    const totalTokens =
      input.totalTokens ?? (input.promptTokens ?? 0) + (input.completionTokens ?? 0);
    const estimatedCost =
      input.estimatedCost ??
      estimateCostForModel({
        provider: input.provider,
        modelId: input.modelId,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      });
    const run: SimulationStepRunRecord = {
      ...input,
      id:
        input.id ??
        createStepRunId({
          simulationId: input.simulationId,
          stageIndex: input.stageIndex,
          stepName: input.stepName,
          roundIndex: input.roundIndex,
          agentId: input.agentId,
        }),
      totalTokens,
      estimatedCost,
    };

    await this.repo.appendStepRun(run);
    return run;
  }

  async recordCheckpoint(
    simulationId: string,
    input: Omit<
      SimulationCheckpointRecord,
      "id" | "simulationId" | "createdAt"
    >,
  ): Promise<SimulationCheckpointRecord> {
    const task = await this.requireTask(simulationId);
    const now = this.now();
    const checkpoint: SimulationCheckpointRecord = {
      id: `cp_${task.id}_${Date.parse(now)}_${sanitizeId(input.stepName)}`,
      simulationId,
      stageIndex: input.stageIndex,
      stepName: input.stepName,
      checkpoint: {
        ...input.checkpoint,
        userInput: task.userInput,
        mode: task.mode,
      },
      createdAt: now,
    };

    await this.repo.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  async listStepRuns(simulationId: string): Promise<SimulationStepRunRecord[]> {
    return this.repo.listStepRuns(simulationId);
  }

  async getCostSummary(simulationId: string): Promise<CostSummary> {
    return summarizeStepRuns(await this.repo.listStepRuns(simulationId));
  }

  async getReport(
    simulationId: string,
  ): Promise<SimulationReportRecord | undefined> {
    return this.repo.getReport(simulationId);
  }

  private async requireTask(simulationId: string): Promise<SimulationTaskRecord> {
    const task = await this.repo.getTask(simulationId);
    if (!task) {
      throw new Error("simulation task not found");
    }

    return task;
  }

  private mergeTask(
    task: SimulationTaskRecord,
    update: Partial<SimulationTaskRecord>,
  ): SimulationTaskRecord {
    return {
      ...task,
      ...update,
      progressPercent:
        typeof update.progressPercent === "number"
          ? clampProgress(update.progressPercent)
          : task.progressPercent,
      updatedAt: this.now(),
    };
  }

  private async saveCheckpoint(
    task: SimulationTaskRecord,
    {
      stageIndex,
      stepName,
      checkpoint,
    }: {
      stageIndex?: number;
      stepName: string;
      checkpoint: SimulationCheckpointPayload;
    },
  ): Promise<void> {
    await this.repo.saveCheckpoint({
      id: `cp_${task.id}_${Date.parse(this.now())}_${sanitizeId(stepName)}`,
      simulationId: task.id,
      stageIndex,
      stepName,
      checkpoint,
      createdAt: this.now(),
    });
  }
}

export function toPublicStatus(
  task: SimulationTaskRecord,
): SimulationTaskStatusResponse {
  return {
    simulationId: task.id,
    scenarioType: task.scenarioType,
    mode: task.mode,
    status: task.status,
    currentStageIndex: task.currentStageIndex,
    currentStepName: task.currentStepName,
    progressPercent: task.progressPercent,
    recoverable: task.recoverable,
    errorCode: task.errorCode,
    updatedAt: task.updatedAt,
  };
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}
