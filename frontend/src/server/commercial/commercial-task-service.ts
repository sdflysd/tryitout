import { randomUUID } from "node:crypto";

import {
  getSimulationCreditCost,
  hasCommercialFeature,
  type ProviderMode,
} from "../../contracts/commercial.js";
import {
  PLATFORM_MODEL_SETTING_KEY,
  normalizePlatformModelProfileIds,
} from "../../model-options.js";
import { loadRepositoryPlatformModelCatalog } from "./platform-model-runtime.js";
import type {
  InteractionMode,
  ModelSelection,
  Report,
  SimulationApiResponse,
  SimulationType,
  UserInput,
} from "../../types.js";
import {
  CreditService,
  CreditServiceError,
  type CreditTransitionResult,
} from "./credit-service.js";
import type { SimulationCheckpointSnapshot } from "../simulations/multi-agent-runner.js";
import type { CommercialRepository } from "./repository.js";
import {
  toSimulationQueueJob,
  type SimulationQueue,
} from "./simulation-queue.js";
import type {
  CommercialSimulationReportRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  JsonObject,
} from "./types.js";

export type CommercialTaskServiceErrorCode =
  | "invalid_task_input"
  | "user_not_active"
  | "active_task_exists"
  | "insufficient_credits"
  | "provider_not_allowed"
  | "task_not_found"
  | "task_not_chargeable"
  | "queue_enqueue_failed"
  | "invalid_task_transition";

export class CommercialTaskServiceError extends Error {
  readonly code: CommercialTaskServiceErrorCode;

  constructor(code: CommercialTaskServiceErrorCode, message: string) {
    super(message);
    this.name = "CommercialTaskServiceError";
    this.code = code;
  }
}

export interface CommercialTaskServiceOptions {
  repository: CommercialRepository;
  creditService: CreditService;
  queue: SimulationQueue;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
}

export interface CreateCommercialTaskInput {
  userId: string;
  userInput: UserInput;
  interactionMode?: InteractionMode;
  providerMode?: ProviderMode;
  modelSelection?: ModelSelection;
  priority?: number;
  queueWeight?: number;
  idempotencyKey: string;
  inputSummary?: JsonObject;
}

export interface CreateCommercialTaskResult {
  task: CommercialSimulationTaskRecord;
  hold: CreditTransitionResult;
}

export interface MarkTaskRunningInput {
  taskId: string;
}

export interface CompleteCommercialTaskInput {
  taskId: string;
  publicReport?: SimulationApiResponse;
  deepReport?: Report | JsonObject;
  shareCard?: JsonObject;
}

export interface CompleteCommercialTaskResult {
  task: CommercialSimulationTaskRecord;
  capture?: CreditTransitionResult;
  report: CommercialSimulationReportRecord;
}

export interface FailCommercialTaskInput {
  taskId: string;
  error: unknown;
}

export interface RecoverableFailCommercialTaskInput extends FailCommercialTaskInput {
  checkpoint?: SimulationCheckpointSnapshot;
}

export interface FailCommercialTaskResult {
  task: CommercialSimulationTaskRecord;
  release?: CreditTransitionResult;
}

export interface ResumeCommercialTaskResult {
  task: CommercialSimulationTaskRecord;
}

export interface RetryCommercialTaskInput {
  taskId: string;
  idempotencyKey: string;
  priority?: number;
}

export class CommercialTaskService {
  private readonly repository: CommercialRepository;
  private readonly creditService: CreditService;
  private readonly queue: SimulationQueue;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;

  constructor(options: CommercialTaskServiceOptions) {
    this.repository = options.repository;
    this.creditService = options.creditService;
    this.queue = options.queue;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
  }

  async createTask(
    input: CreateCommercialTaskInput,
  ): Promise<CreateCommercialTaskResult> {
    validateRequired(input.userId, "User id");
    validateRequired(input.idempotencyKey, "Idempotency key");
    const scenarioType = input.userInput.type;
    if (scenarioType === undefined) {
      throw new CommercialTaskServiceError(
        "invalid_task_input",
        "Simulation type is required",
      );
    }

    const user = await this.repository.getEffectiveUser(input.userId, this.currentIso());
    if (!user || user.status !== "active") {
      throw new CommercialTaskServiceError("user_not_active", "User is not active");
    }
    await this.assertProviderSelectionAllowed({
      user,
      providerMode: input.providerMode ?? "platform",
      modelSelection: input.modelSelection,
    });
    const existing = await this.repository.findCommercialTaskByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existing !== undefined) {
      return this.returnExistingCreateResult(existing, input.userInput);
    }
    if ((await this.repository.findActiveCommercialTaskByUserId(input.userId)) !== undefined) {
      throw new CommercialTaskServiceError(
        "active_task_exists",
        "User already has an active simulation task",
      );
    }

    const task = this.buildQueuedTask({
      userId: input.userId,
      scenarioType,
      interactionMode: input.interactionMode ?? "legacy",
      providerMode: input.providerMode ?? "platform",
      modelSelection: input.modelSelection,
      userInput: input.userInput,
      priority: input.priority,
      queueWeight: input.queueWeight,
      idempotencyKey: input.idempotencyKey,
      inputSummary: input.inputSummary,
    });

    await this.assertSufficientCredits(task.userId, task.creditCost);
    await this.repository.saveCommercialTask(task);

    let hold: CreditTransitionResult;
    try {
      hold = await this.creditService.holdCreditsForTask({
        userId: task.userId,
        taskId: task.id,
        amount: task.creditCost,
        idempotencyKey: `${task.idempotencyKey}:hold`,
        reason: "simulation_task",
        metadata: { taskId: task.id },
      });
    } catch (error) {
      throw mapCreditError(error);
    }

    const heldTask = await this.requireTask(task.id);
    try {
      await this.queue.enqueue(toSimulationQueueJob(heldTask, {
        userInput: input.userInput,
      }));
    } catch (error) {
      await this.releaseHoldForFailedEnqueue(heldTask);
      throw new CommercialTaskServiceError(
        "queue_enqueue_failed",
        error instanceof Error ? error.message : "Queue enqueue failed",
      );
    }

    return { task: await this.requireTask(task.id), hold };
  }

  private async returnExistingCreateResult(
    task: CommercialSimulationTaskRecord,
    userInput: UserInput,
  ): Promise<CreateCommercialTaskResult> {
    const hold = await this.creditService.holdCreditsForTask({
      userId: task.userId,
      taskId: task.id,
      amount: task.creditCost,
      idempotencyKey: `${task.idempotencyKey ?? task.id}:hold`,
      reason: "simulation_task",
      metadata: { taskId: task.id },
    });
    if (task.status === "queued" || task.status === "running") {
      await this.queue.enqueue(toSimulationQueueJob(task, {
        userInput: task.userInput ?? userInput,
      }));
    }
    return { task, hold };
  }

  async markRunning(
    input: MarkTaskRunningInput,
  ): Promise<CommercialSimulationTaskRecord> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.status === "running") {
      return task;
    }
    if (task.status !== "queued") {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only queued tasks can be marked running",
      );
    }

    const nowIso = this.currentIso();
    const runningTask: CommercialSimulationTaskRecord = {
      ...task,
      status: "running",
      startedAt: task.startedAt ?? nowIso,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(runningTask);
    return runningTask;
  }

  async markCompleted(
    input: CompleteCommercialTaskInput,
  ): Promise<CompleteCommercialTaskResult> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.status === "completed") {
      const report = await this.requireReport(task.id);
      return { task, report };
    }
    if (task.status !== "running") {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only running tasks can be marked completed",
      );
    }
    const holdLedgerId = requireHoldLedgerId(task);
    const capture = await this.creditService.captureHeldCredits({
      userId: task.userId,
      taskId: task.id,
      holdLedgerId,
      idempotencyKey: `${task.idempotencyKey ?? task.id}:capture`,
      reason: "simulation_completed",
      metadata: { taskId: task.id },
    });

    const nowIso = this.currentIso();
    const completedTask: CommercialSimulationTaskRecord = {
      ...task,
      status: "completed",
      completedAt: task.completedAt ?? nowIso,
      updatedAt: nowIso,
    };
    const existingReport = await this.repository.getCommercialReportByTaskId(task.id);
    const report =
      existingReport ??
      {
        id: this.createId("simulation_report"),
        taskId: task.id,
        userId: task.userId,
        publicReport: input.publicReport,
        deepReport: input.deepReport,
        shareCard: input.shareCard,
        unlocked: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

    if (existingReport === undefined) {
      await this.repository.saveCommercialReport(report);
    }
    await this.repository.saveCommercialTask(completedTask);
    return { task: completedTask, capture, report };
  }

  async markFailed(
    input: FailCommercialTaskInput,
  ): Promise<FailCommercialTaskResult> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.status === "failed") {
      return { task };
    }
    if (task.status !== "queued" && task.status !== "running") {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only active tasks can be marked failed",
      );
    }

    const errorCode = normalizeErrorCode(input.error);
    const release = await this.releaseOpenHold(task, errorCode);
    const nowIso = this.currentIso();
    const failedTask: CommercialSimulationTaskRecord = {
      ...task,
      status: "failed",
      errorCode,
      completedAt: task.completedAt ?? nowIso,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(failedTask);
    return { task: failedTask, release };
  }

  async markRecoverableFailed(
    input: RecoverableFailCommercialTaskInput,
  ): Promise<FailCommercialTaskResult> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.status === "recoverable_failed") {
      return { task };
    }
    if (task.status !== "queued" && task.status !== "running") {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only active tasks can be marked recoverable failed",
      );
    }

    const errorCode = normalizeErrorCode(input.error);
    const nowIso = this.currentIso();
    if (input.checkpoint !== undefined) {
      await this.repository.saveCommercialCheckpoint({
        id: this.createId("simulation_checkpoint"),
        taskId: task.id,
        stageIndex: input.checkpoint.completedStages?.at(-1)?.stageIndex,
        stepName: input.checkpoint.nextStep ?? "recoverable_failed",
        checkpoint: input.checkpoint,
        createdAt: nowIso,
      });
    }
    const failedTask: CommercialSimulationTaskRecord = {
      ...task,
      status: "recoverable_failed",
      errorCode,
      completedAt: undefined,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(failedTask);
    return { task: failedTask };
  }

  async cancelTask(input: { taskId: string }): Promise<FailCommercialTaskResult> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.status === "cancelled") {
      return { task };
    }
    if (
      task.status !== "queued" &&
      task.status !== "running" &&
      task.status !== "recoverable_failed"
    ) {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only active tasks can be cancelled",
      );
    }
    const release = await this.releaseOpenHold(task, "task_cancelled");
    const nowIso = this.currentIso();
    const cancelledTask: CommercialSimulationTaskRecord = {
      ...task,
      status: "cancelled",
      errorCode: "task_cancelled",
      completedAt: task.completedAt ?? nowIso,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(cancelledTask);
    return { task: cancelledTask, release };
  }

  async resumeTask(input: { taskId: string }): Promise<ResumeCommercialTaskResult> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.status === "queued") {
      const userInput = task.userInput;
      if (userInput === undefined) {
        throw new CommercialTaskServiceError(
          "invalid_task_input",
          "Queued task is missing original user input",
        );
      }
      await this.queue.enqueue(toSimulationQueueJob(task, { userInput }));
      return { task };
    }
    if (task.status === "cancelled") {
      return this.resumeCancelledTask(task);
    }
    if (task.status !== "recoverable_failed") {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only queued, recoverable failed, or cancelled tasks can be resumed",
      );
    }
    const userInput = task.userInput;
    if (userInput === undefined) {
      throw new CommercialTaskServiceError(
        "invalid_task_input",
        "Recoverable task is missing original user input",
      );
    }

    const nowIso = this.currentIso();
    const queuedTask: CommercialSimulationTaskRecord = {
      ...task,
      status: "queued",
      errorCode: undefined,
      completedAt: undefined,
      queuedAt: nowIso,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(queuedTask);
    await this.queue.enqueue(toSimulationQueueJob(queuedTask, {
      userInput,
      idempotencyKey: buildQueueSafeIdempotencyKey(
        queuedTask.idempotencyKey ?? queuedTask.id,
        "resume",
        nowIso,
      ),
    }));
    return { task: queuedTask };
  }

  async deleteTaskForUser(input: { taskId: string }): Promise<CommercialSimulationTaskRecord> {
    validateRequired(input.taskId, "Task id");
    const task = await this.requireTask(input.taskId);
    if (task.userDeletedAt !== undefined) {
      return task;
    }
    if (
      task.status !== "completed" &&
      task.status !== "failed" &&
      task.status !== "cancelled" &&
      task.status !== "refunded"
    ) {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only finished tasks can be deleted from the user task list",
      );
    }

    const nowIso = this.currentIso();
    const hiddenTask: CommercialSimulationTaskRecord = {
      ...task,
      userDeletedAt: nowIso,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(hiddenTask);
    return hiddenTask;
  }

  async retryTask(input: RetryCommercialTaskInput): Promise<CreateCommercialTaskResult> {
    validateRequired(input.taskId, "Task id");
    validateRequired(input.idempotencyKey, "Idempotency key");
    const task = await this.requireTask(input.taskId);
    if (task.status !== "failed" && task.status !== "refunded") {
      throw new CommercialTaskServiceError(
        "invalid_task_transition",
        "Only failed or refunded tasks can be retried",
      );
    }
    return this.createTask({
      userId: task.userId,
      userInput: { type: task.scenarioType },
      interactionMode: task.interactionMode,
      providerMode: task.providerMode,
      modelSelection: task.modelSelection,
      priority: input.priority ?? task.priority,
      queueWeight: task.queueWeight,
      idempotencyKey: input.idempotencyKey,
      inputSummary: task.inputSummary,
    });
  }

  async getStatus(taskId: string): Promise<CommercialSimulationTaskRecord> {
    validateRequired(taskId, "Task id");
    return this.requireTask(taskId);
  }

  async getActiveTaskForUser(
    userId: string,
  ): Promise<CommercialSimulationTaskRecord | undefined> {
    validateRequired(userId, "User id");
    return this.repository.findActiveCommercialTaskByUserId(userId);
  }

  async getReport(taskId: string): Promise<CommercialSimulationReportRecord> {
    validateRequired(taskId, "Task id");
    return this.requireReport(taskId);
  }

  private buildQueuedTask(input: {
    userId: string;
    scenarioType: SimulationType;
    interactionMode: InteractionMode;
    providerMode: ProviderMode;
    modelSelection?: ModelSelection;
    userInput: UserInput;
    priority?: number;
    queueWeight?: number;
    idempotencyKey: string;
    inputSummary?: JsonObject;
  }): CommercialSimulationTaskRecord {
    const nowIso = this.currentIso();
    const creditCost = getSimulationCreditCost({
      interactionMode: input.interactionMode,
      providerMode: input.providerMode,
    });
    return {
      id: this.createId("simulation_task"),
      userId: input.userId,
      scenarioType: input.scenarioType,
      interactionMode: input.interactionMode,
      providerMode: input.providerMode,
      modelSelection: input.modelSelection,
      userInput: input.userInput,
      status: "queued",
      creditCost,
      priority: input.priority,
      queueWeight: input.queueWeight,
      idempotencyKey: input.idempotencyKey,
      inputSummary: input.inputSummary,
      queuedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  private async assertSufficientCredits(
    userId: string,
    creditCost: number,
  ): Promise<void> {
    const account = await this.repository.getCreditAccount(userId);
    if (!account || account.balance < creditCost) {
      throw new CommercialTaskServiceError(
        "insufficient_credits",
        "Available credit balance is insufficient",
      );
    }
  }

  private async assertProviderSelectionAllowed(input: {
    user: CommercialUserRecord;
    providerMode: ProviderMode;
    modelSelection?: ModelSelection;
  }): Promise<void> {
    if (input.providerMode === "byok") {
      if (!hasCommercialFeature(input.user, "custom_model_provider")) {
        throw new CommercialTaskServiceError(
          "provider_not_allowed",
          "BYOK provider mode requires access-code entitlement",
        );
      }
      return;
    }

    const requestedProfileId = input.modelSelection?.modelProfileId;
    const catalog = await loadRepositoryPlatformModelCatalog(this.repository);
    if (catalog !== undefined) {
      if (catalog.options.length === 0) {
        throw new CommercialTaskServiceError(
          "provider_not_allowed",
          "No platform models are enabled by admin",
        );
      }
      if (requestedProfileId === undefined) {
        return;
      }
      if (catalog.options.some((model) => model.id === requestedProfileId)) {
        return;
      }
      throw new CommercialTaskServiceError(
        "provider_not_allowed",
        "Platform model is not enabled by admin",
      );
    }

    const setting = await this.repository.getSystemSetting(PLATFORM_MODEL_SETTING_KEY);
    const enabledModelProfileIds = normalizePlatformModelProfileIds(setting?.value);
    if (enabledModelProfileIds.length === 0) {
      throw new CommercialTaskServiceError(
        "provider_not_allowed",
        "No platform models are enabled by admin",
      );
    }
    if (requestedProfileId === undefined) {
      return;
    }
    if (!enabledModelProfileIds.includes(requestedProfileId)) {
      throw new CommercialTaskServiceError(
        "provider_not_allowed",
        "Platform model is not enabled by admin",
      );
    }
  }

  private async releaseHoldForFailedEnqueue(
    task: CommercialSimulationTaskRecord,
  ): Promise<void> {
    await this.releaseOpenHold(task, "queue_enqueue_failed");
    const failedAt = this.currentIso();
    await this.repository.saveCommercialTask({
      ...task,
      status: "failed",
      errorCode: "queue_enqueue_failed",
      completedAt: failedAt,
      updatedAt: failedAt,
    });
  }

  private async resumeCancelledTask(
    task: CommercialSimulationTaskRecord,
  ): Promise<ResumeCommercialTaskResult> {
    const userInput = task.userInput;
    if (userInput === undefined) {
      throw new CommercialTaskServiceError(
        "invalid_task_input",
        "Cancelled task is missing original user input",
      );
    }

    const nowIso = this.currentIso();
    const user = await this.repository.getEffectiveUser(task.userId, nowIso);
    if (!user || user.status !== "active") {
      throw new CommercialTaskServiceError("user_not_active", "User is not active");
    }
    await this.assertProviderSelectionAllowed({
      user,
      providerMode: task.providerMode,
      modelSelection: task.modelSelection,
    });
    const activeTask = await this.repository.findActiveCommercialTaskByUserId(task.userId);
    if (activeTask !== undefined && activeTask.id !== task.id) {
      throw new CommercialTaskServiceError(
        "active_task_exists",
        "User already has an active simulation task",
      );
    }

    const chargeableTask: CommercialSimulationTaskRecord = {
      ...task,
      creditHoldLedgerId: undefined,
      userDeletedAt: undefined,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(chargeableTask);

    const queueIdempotencyKey = buildQueueSafeIdempotencyKey(
      task.idempotencyKey ?? task.id,
      "continue",
      nowIso,
    );
    try {
      await this.creditService.holdCreditsForTask({
        userId: task.userId,
        taskId: task.id,
        amount: task.creditCost,
        idempotencyKey: `${queueIdempotencyKey}_hold`,
        reason: "simulation_task_continue",
        metadata: { taskId: task.id },
      });
    } catch (error) {
      throw mapCreditError(error);
    }

    const heldTask = await this.requireTask(task.id);
    const queuedTask: CommercialSimulationTaskRecord = {
      ...heldTask,
      status: "queued",
      errorCode: undefined,
      completedAt: undefined,
      queuedAt: nowIso,
      updatedAt: nowIso,
    };
    await this.repository.saveCommercialTask(queuedTask);
    try {
      await this.queue.enqueue(toSimulationQueueJob(queuedTask, {
        userInput,
        idempotencyKey: queueIdempotencyKey,
      }));
    } catch (error) {
      await this.releaseHoldForFailedEnqueue(queuedTask);
      throw new CommercialTaskServiceError(
        "queue_enqueue_failed",
        error instanceof Error ? error.message : "Queue enqueue failed",
      );
    }

    return { task: await this.requireTask(task.id) };
  }

  private async releaseOpenHold(
    task: CommercialSimulationTaskRecord,
    reason: string,
  ): Promise<CreditTransitionResult | undefined> {
    if (task.creditHoldLedgerId === undefined) {
      return undefined;
    }
    try {
      return await this.creditService.releaseHeldCredits({
        userId: task.userId,
        taskId: task.id,
        holdLedgerId: task.creditHoldLedgerId,
        idempotencyKey: `${task.idempotencyKey ?? task.id}:release:${reason}`,
        reason,
        metadata: { taskId: task.id },
      });
    } catch (error) {
      if (
        error instanceof CreditServiceError &&
        error.code === "hold_already_completed"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  private async requireTask(
    taskId: string,
  ): Promise<CommercialSimulationTaskRecord> {
    const task = await this.repository.getCommercialTask(taskId);
    if (!task) {
      throw new CommercialTaskServiceError("task_not_found", "Task not found");
    }
    return task;
  }

  private async requireReport(
    taskId: string,
  ): Promise<CommercialSimulationReportRecord> {
    const report = await this.repository.getCommercialReportByTaskId(taskId);
    if (!report) {
      throw new CommercialTaskServiceError("task_not_found", "Report not found");
    }
    return report;
  }

  private currentIso(): string {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new CommercialTaskServiceError(
        "invalid_task_input",
        "Invalid current time",
      );
    }
    return date.toISOString();
  }
}

function requireHoldLedgerId(task: CommercialSimulationTaskRecord): string {
  if (task.creditHoldLedgerId === undefined) {
    throw new CommercialTaskServiceError(
      "task_not_chargeable",
      "Task does not have a credit hold",
    );
  }
  return task.creditHoldLedgerId;
}

function buildQueueSafeIdempotencyKey(
  base: string,
  action: string,
  timestamp: string,
): string {
  return `${base}_${action}_${timestamp}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
}

function validateRequired(value: string, label: string): void {
  if (value.trim() === "") {
    throw new CommercialTaskServiceError(
      "invalid_task_input",
      `${label} is required`,
    );
  }
}

function mapCreditError(error: unknown): never {
  if (
    error instanceof CreditServiceError &&
    error.code === "insufficient_credits"
  ) {
    throw new CommercialTaskServiceError(
      "insufficient_credits",
      error.message,
    );
  }
  throw error;
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
