import { randomUUID } from "node:crypto";

import { getSimulationCreditCost, type CommercialProviderMode } from "../../contracts/commercial.js";
import type { InteractionMode, Report, SimulationType } from "../../types.js";
import type { CreditService } from "./credit-service.js";
import type { CommercialRepository } from "./repository.js";
import type { SimulationQueue } from "./simulation-queue.js";
import type { CommercialSimulationTaskRecord } from "./types.js";

export interface CommercialTaskServiceOptions {
  now?: () => Date;
}

export interface CommercialTaskStatusDto {
  taskId: string;
  status: CommercialSimulationTaskRecord["status"];
  scenario: SimulationType;
  interactionMode: InteractionMode;
  providerMode: CommercialProviderMode;
  creditCost: number;
  reportId?: string;
  errorCode?: string;
}

export class CommercialSimulationTaskServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommercialSimulationTaskServiceError";
  }
}

export class CommercialSimulationTaskService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: CommercialRepository,
    private readonly creditService: CreditService,
    private readonly queue: SimulationQueue,
    options: CommercialTaskServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async createTask(input: {
    userId: string;
    scenario: SimulationType;
    userInput: string;
    interactionMode: InteractionMode;
    providerMode: CommercialProviderMode;
  }): Promise<CommercialTaskStatusDto> {
    const user = await this.repository.getUser(input.userId);
    if (!user || user.disabledAt) {
      throw new CommercialSimulationTaskServiceError("user_not_active", "User is not active.");
    }

    const activeTasks = await this.repository.listActiveCommercialTasksForUser(input.userId);
    if (activeTasks.length > 0) {
      throw new CommercialSimulationTaskServiceError("active_task_exists", "User already has an active task.");
    }

    const taskId = createId("task");
    const timestamp = this.now();
    const creditCost = getSimulationCreditCost({
      interactionMode: input.interactionMode,
      providerMode: input.providerMode,
    });
    const hold = await this.creditService.holdCredits({
      userId: input.userId,
      amount: creditCost,
      taskId,
      idempotencyKey: `${taskId}:hold`,
    });

    let task: CommercialSimulationTaskRecord = {
      id: taskId,
      userId: input.userId,
      status: "queued",
      scenario: input.scenario,
      userInput: input.userInput,
      interactionMode: input.interactionMode,
      providerMode: input.providerMode,
      creditCost,
      creditHoldLedgerEntryId: hold.id,
      creditCapturedLedgerEntryId: undefined,
      creditReleasedLedgerEntryId: undefined,
      queueJobId: undefined,
      reportId: undefined,
      errorCode: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.saveCommercialTask(task);

    try {
      const job = await this.queue.enqueue({
        taskId,
        userId: input.userId,
        interactionMode: input.interactionMode,
        idempotencyKey: `${taskId}:enqueue`,
      });
      task = { ...task, queueJobId: job.id, updatedAt: this.now() };
      await this.repository.saveCommercialTask(task);
      return toStatusDto(task);
    } catch {
      const release = await this.creditService.releaseHeldCredits({
        userId: input.userId,
        holdLedgerEntryId: hold.id,
        taskId,
        idempotencyKey: `${taskId}:release:queue_unavailable`,
      });
      await this.repository.saveCommercialTask({
        ...task,
        status: "failed",
        errorCode: "queue_unavailable",
        creditReleasedLedgerEntryId: release.id,
        updatedAt: this.now(),
      });
      throw new CommercialSimulationTaskServiceError(
        "queue_unavailable",
        "Unable to enqueue simulation task.",
      );
    }
  }

  async markRunning(taskId: string): Promise<CommercialTaskStatusDto> {
    const task = await this.requireTask(taskId);
    if (task.status !== "queued") {
      return toStatusDto(task);
    }
    const updated = { ...task, status: "running" as const, updatedAt: this.now() };
    await this.repository.saveCommercialTask(updated);
    return toStatusDto(updated);
  }

  async markCompleted(input: { taskId: string; report: Report }): Promise<CommercialTaskStatusDto> {
    const task = await this.requireTask(input.taskId);
    if (task.status === "completed") {
      return toStatusDto(task);
    }
    if (!task.creditHoldLedgerEntryId) {
      throw new CommercialSimulationTaskServiceError("missing_credit_hold", "Task has no credit hold.");
    }

    const capture = await this.creditService.captureHeldCredits({
      userId: task.userId,
      holdLedgerEntryId: task.creditHoldLedgerEntryId,
      taskId: task.id,
      idempotencyKey: `${task.id}:capture`,
    });
    const reportId = task.reportId ?? createId("report");
    await this.repository.saveSimulationReport({
      id: reportId,
      taskId: task.id,
      userId: task.userId,
      report: input.report,
      createdAt: this.now(),
    });

    const updated: CommercialSimulationTaskRecord = {
      ...task,
      status: "completed",
      creditCapturedLedgerEntryId: capture.id,
      reportId,
      errorCode: undefined,
      updatedAt: this.now(),
    };
    await this.repository.saveCommercialTask(updated);
    return toStatusDto(updated);
  }

  async markFailed(input: { taskId: string; errorCode: string }): Promise<CommercialTaskStatusDto> {
    const task = await this.requireTask(input.taskId);
    if (task.status === "failed" || task.status === "cancelled" || task.status === "refunded") {
      return toStatusDto(task);
    }
    if (!task.creditHoldLedgerEntryId) {
      throw new CommercialSimulationTaskServiceError("missing_credit_hold", "Task has no credit hold.");
    }

    const release = await this.creditService.releaseHeldCredits({
      userId: task.userId,
      holdLedgerEntryId: task.creditHoldLedgerEntryId,
      taskId: task.id,
      idempotencyKey: `${task.id}:release:failed`,
    });
    const updated: CommercialSimulationTaskRecord = {
      ...task,
      status: "failed",
      creditReleasedLedgerEntryId: release.id,
      errorCode: normalizeErrorCode(input.errorCode),
      updatedAt: this.now(),
    };
    await this.repository.saveCommercialTask(updated);
    return toStatusDto(updated);
  }

  async cancelTask(taskId: string, userId: string): Promise<CommercialTaskStatusDto> {
    const task = await this.requireTaskForUser(taskId, userId);
    if (!["queued", "running"].includes(task.status)) {
      return toStatusDto(task);
    }
    if (!task.creditHoldLedgerEntryId) {
      throw new CommercialSimulationTaskServiceError("missing_credit_hold", "Task has no credit hold.");
    }
    const release = await this.creditService.releaseHeldCredits({
      userId: task.userId,
      holdLedgerEntryId: task.creditHoldLedgerEntryId,
      taskId: task.id,
      idempotencyKey: `${task.id}:release:cancelled`,
    });
    const updated: CommercialSimulationTaskRecord = {
      ...task,
      status: "cancelled",
      creditReleasedLedgerEntryId: release.id,
      updatedAt: this.now(),
    };
    await this.repository.saveCommercialTask(updated);
    return toStatusDto(updated);
  }

  async retryTask(taskId: string, userId: string): Promise<CommercialTaskStatusDto> {
    const task = await this.requireTaskForUser(taskId, userId);
    if (!["failed", "refunded", "cancelled", "completed"].includes(task.status)) {
      throw new CommercialSimulationTaskServiceError("task_not_retryable", "Task cannot be retried.");
    }
    return this.createTask({
      userId: task.userId,
      scenario: task.scenario,
      userInput: task.userInput,
      interactionMode: task.interactionMode,
      providerMode: task.providerMode,
    });
  }

  async getStatus(taskId: string, userId: string): Promise<CommercialTaskStatusDto> {
    return toStatusDto(await this.requireTaskForUser(taskId, userId));
  }

  async getReport(taskId: string, userId: string): Promise<Report | undefined> {
    await this.requireTaskForUser(taskId, userId);
    return (await this.repository.getSimulationReportForTask(taskId))?.report;
  }

  private async requireTask(taskId: string): Promise<CommercialSimulationTaskRecord> {
    const task = await this.repository.getCommercialTask(taskId);
    if (!task) {
      throw new CommercialSimulationTaskServiceError("task_not_found", "Task was not found.");
    }
    return task;
  }

  private async requireTaskForUser(
    taskId: string,
    userId: string,
  ): Promise<CommercialSimulationTaskRecord> {
    const task = await this.requireTask(taskId);
    if (task.userId !== userId) {
      throw new CommercialSimulationTaskServiceError("task_not_found", "Task was not found.");
    }
    return task;
  }
}

function toStatusDto(task: CommercialSimulationTaskRecord): CommercialTaskStatusDto {
  return {
    taskId: task.id,
    status: task.status,
    scenario: task.scenario,
    interactionMode: task.interactionMode,
    providerMode: task.providerMode,
    creditCost: task.creditCost,
    reportId: task.reportId,
    errorCode: task.errorCode,
  };
}

function normalizeErrorCode(errorCode: string): string {
  return errorCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
