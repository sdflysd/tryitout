import type {
  CreateSimulationTaskRequest,
  CreateSimulationTaskResponse,
  SimulationReportResponse,
  SimulationTaskListResponse,
  SimulationTaskStatusResponse,
} from "./contracts/simulation-task";
import type {
  SimulationApiResponse,
  SimulationProgressEvent,
  SimulationProgressStep,
} from "./types";

export async function createSimulationTask(
  request: CreateSimulationTaskRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateSimulationTaskResponse> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl("/api/simulation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(request),
    }),
  );

  return normalizeCreateSimulationTaskResponse(body);
}

export async function getSimulationTaskStatus(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/status`, {
      credentials: "include",
    }),
  );

  return normalizeSimulationTaskStatusResponse(body);
}

export async function fetchSimulationTasks(
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse[]> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl("/api/simulation-tasks", {
      credentials: "include",
    }),
  );

  return normalizeSimulationTaskListResponse(body).tasks;
}

export async function fetchActiveSimulationTask(
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse | undefined> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl("/api/simulation-tasks/active", {
      credentials: "include",
    }),
  );

  if (isObject(body) && body.task === undefined) {
    return undefined;
  }

  return normalizeSimulationTaskStatusResponse(body);
}

export async function getSimulationTaskReport(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationReportResponse> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/report`, {
      credentials: "include",
    }),
  );

  return normalizeSimulationReportResponse(simulationId, body);
}

export async function resumeSimulationTask(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  return readJsonResponse(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/resume`, {
      method: "POST",
      credentials: "include",
    }),
  );
}

export async function cancelSimulationTask(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse> {
  return readJsonResponse(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/cancel`, {
      method: "POST",
      credentials: "include",
    }),
  );
}

export async function deleteSimulationTask(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse> {
  const body = await readJsonResponse<unknown>(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}`, {
      method: "DELETE",
      credentials: "include",
    }),
  );

  return normalizeSimulationTaskStatusResponse(body);
}

export class RecoverableSimulationTaskError extends Error {
  readonly simulationId: string;
  readonly errorCode?: string;

  constructor(status: SimulationTaskStatusResponse) {
    super(status.errorCode || "simulation task failed but can be resumed");
    this.name = "RecoverableSimulationTaskError";
    this.simulationId = status.simulationId;
    this.errorCode = status.errorCode;
  }
}

export function isRecoverableSimulationTaskError(
  error: unknown,
): error is RecoverableSimulationTaskError {
  return error instanceof RecoverableSimulationTaskError;
}

export async function runSimulationTaskUntilComplete(
  request: CreateSimulationTaskRequest,
  options: RunSimulationTaskOptions = {},
): Promise<SimulationApiResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const created = await createSimulationTask(request, fetchImpl);
  options.onCreated?.(created);

  return pollSimulationTaskUntilComplete(created.simulationId, options);
}

export async function resumeSimulationTaskUntilComplete(
  simulationId: string,
  options: RunSimulationTaskOptions = {},
): Promise<SimulationApiResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  await resumeSimulationTask(simulationId, fetchImpl);

  return pollSimulationTaskUntilComplete(simulationId, options);
}

export async function watchSimulationTaskUntilComplete(
  simulationId: string,
  options: RunSimulationTaskOptions = {},
): Promise<SimulationApiResponse> {
  return pollSimulationTaskUntilComplete(simulationId, options);
}

interface RunSimulationTaskOptions {
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onCreated?: (created: CreateSimulationTaskResponse) => void;
  onProgress?: (event: SimulationProgressEvent) => void;
}

async function pollSimulationTaskUntilComplete(
  simulationId: string,
  {
    fetchImpl = fetch,
    pollIntervalMs = 1500,
    sleep = defaultSleep,
    onProgress,
  }: RunSimulationTaskOptions = {},
): Promise<SimulationApiResponse> {
  let highestProgressPercent: number | undefined;
  while (true) {
    const status = await getSimulationTaskStatus(simulationId, fetchImpl);
    const progressEvent = toProgressEvent(status);
    highestProgressPercent = Math.max(
      highestProgressPercent ?? progressEvent.percent,
      progressEvent.percent,
    );
    onProgress?.({ ...progressEvent, percent: highestProgressPercent });

    if (status.status === "completed") {
      const report = await getSimulationTaskReport(simulationId, fetchImpl);
      if (report.report) {
        return report.report;
      }

      throw new Error(report.error || "simulation report not ready");
    }

    if (status.status === "recoverable_failed" && status.recoverable) {
      throw new RecoverableSimulationTaskError(status);
    }

    if (status.status === "failed" || status.status === "cancelled") {
      throw new Error(status.errorCode || `simulation task ${status.status}`);
    }

    await sleep(pollIntervalMs);
  }
}

function toProgressEvent(status: SimulationTaskStatusResponse): SimulationProgressEvent {
  const step = normalizeProgressStep(status.currentStepName);

  return {
    simulationId: status.simulationId,
    step,
    stageIndex: status.currentStageIndex,
    status: status.status === "queued"
      ? "queued"
      : status.status === "completed" ? "completed" : "started",
    percent: status.progressPercent,
    message: getTaskProgressMessage(status, step),
    createdAt: getTaskProgressTimestamp(status),
  };
}

function getTaskProgressTimestamp(status: SimulationTaskStatusResponse): string {
  if (status.status === "queued") {
    return status.queuedAt ?? status.createdAt ?? status.updatedAt;
  }
  return status.startedAt ?? status.queuedAt ?? status.createdAt ?? status.updatedAt;
}

function normalizeProgressStep(stepName: string | undefined): SimulationProgressStep {
  const knownSteps = new Set<SimulationProgressStep>([
    "safety_check",
    "generate_agents",
    "initialize_world_state",
    "simulate_stage",
    "generate_world_event",
    "generate_agent_actions",
    "arbitrate_stage",
    "generate_report",
    "generate_route_comparison",
  ]);

  return stepName && knownSteps.has(stepName as SimulationProgressStep)
    ? stepName as SimulationProgressStep
    : "generate_agents";
}

function getTaskProgressMessage(
  status: SimulationTaskStatusResponse,
  step: SimulationProgressStep,
): string {
  if (typeof status.progressMessage === "string" && status.progressMessage.trim()) {
    return status.progressMessage;
  }
  if (status.status === "queued") {
    return "任务已进入商业队列，等待 worker 处理。";
  }
  if (status.status === "completed") {
    return "模拟任务完成，正在读取报告。";
  }
  if (status.status === "recoverable_failed") {
    return `模拟任务可恢复失败：${status.errorCode || "unknown_error"}`;
  }

  const stage = status.currentStageIndex ? `第 ${status.currentStageIndex} 阶段` : "全局步骤";
  return `${stage} ${step} 运行中。`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.error === "string" ? body.error : `HTTP error ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

function normalizeCreateSimulationTaskResponse(
  body: unknown,
): CreateSimulationTaskResponse {
  if (isObject(body) && typeof body.simulationId === "string") {
    return body as unknown as CreateSimulationTaskResponse;
  }
  const task = isObject(body) && isObject(body.task) ? body.task : undefined;
  if (task && typeof task.id === "string") {
    return {
      simulationId: task.id,
      status: normalizeTaskStatus(task.status),
    };
  }

  return body as CreateSimulationTaskResponse;
}

function normalizeSimulationTaskListResponse(
  body: unknown,
): SimulationTaskListResponse {
  if (!isObject(body) || !Array.isArray(body.tasks)) {
    return { tasks: [] };
  }
  return {
    tasks: body.tasks
      .filter((task) => isObject(task))
      .map((task) => normalizeSimulationTaskStatusResponse({ task })),
  };
}

function normalizeSimulationTaskStatusResponse(
  body: unknown,
): SimulationTaskStatusResponse {
  if (isObject(body) && typeof body.simulationId === "string") {
    return body as unknown as SimulationTaskStatusResponse;
  }
  const task = isObject(body) && isObject(body.task) ? body.task : undefined;
  if (task && typeof task.id === "string") {
    const progressPercent =
      typeof task.progressPercent === "number"
        ? task.progressPercent
        : getCommercialTaskProgressPercent(task.status);
    const displayTitle = normalizeTaskDisplayTitle(task);
    return {
      simulationId: task.id,
      ...(displayTitle !== undefined ? { displayTitle } : {}),
      scenarioType: normalizeScenarioType(task.scenarioType),
      mode: task.interactionMode === "enabled" ? "enabled" : "legacy",
      status: normalizeTaskStatus(task.status),
      progressPercent,
      recoverable: typeof task.recoverable === "boolean"
        ? task.recoverable
        : task.status === "recoverable_failed",
      ...(typeof task.currentStepName === "string"
        ? { currentStepName: task.currentStepName }
        : {}),
      ...(typeof task.currentStageIndex === "number"
        ? { currentStageIndex: task.currentStageIndex }
        : {}),
      ...(typeof task.progressMessage === "string"
        ? { progressMessage: task.progressMessage }
        : {}),
      ...(typeof task.errorCode === "string" ? { errorCode: task.errorCode } : {}),
      ...(typeof task.queuedAt === "string" ? { queuedAt: task.queuedAt } : {}),
      ...(typeof task.startedAt === "string" ? { startedAt: task.startedAt } : {}),
      ...(typeof task.completedAt === "string" ? { completedAt: task.completedAt } : {}),
      ...(typeof task.createdAt === "string" ? { createdAt: task.createdAt } : {}),
      updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : new Date().toISOString(),
    };
  }

  return body as SimulationTaskStatusResponse;
}

function normalizeTaskDisplayTitle(task: Record<string, unknown>): string | undefined {
  const directTitle = typeof task.displayTitle === "string" ? task.displayTitle : undefined;
  const summaryTitle = isObject(task.inputSummary) && typeof task.inputSummary.title === "string"
    ? task.inputSummary.title
    : undefined;
  const userInputTitle = isObject(task.userInput) ? titleForTaskUserInput(task.userInput) : undefined;
  const title = directTitle ?? summaryTitle ?? userInputTitle;
  const normalized = title?.trim();
  return normalized ? normalized.slice(0, 120) : undefined;
}

function titleForTaskUserInput(userInput: Record<string, unknown>): string | undefined {
  if (userInput.type === "side_hustle" && typeof userInput.projectIdea === "string") {
    return userInput.projectIdea;
  }
  if (userInput.type === "dating" && typeof userInput.chatLogOrIssue === "string") {
    return userInput.chatLogOrIssue;
  }
  if (userInput.type === "life_choice") {
    if (typeof userInput.decisionContext === "string") {
      return userInput.decisionContext;
    }
    if (typeof userInput.optionA === "string" && typeof userInput.optionB === "string") {
      return `${userInput.optionA} vs ${userInput.optionB}`;
    }
  }
  return undefined;
}

function normalizeSimulationReportResponse(
  simulationId: string,
  body: unknown,
): SimulationReportResponse {
  if (isObject(body) && typeof body.simulationId === "string") {
    return body as unknown as SimulationReportResponse;
  }
  const report = isObject(body) && isObject(body.report) ? body.report : undefined;
  if (report && typeof report.taskId === "string") {
    const publicReport = report.publicReport;
    if (publicReport !== undefined) {
      return {
        simulationId: report.taskId,
        status: "completed",
        report: publicReport as SimulationApiResponse,
      };
    }
    return {
      simulationId: report.taskId,
      status: "failed",
      error: "simulation report not ready",
    };
  }

  return body as SimulationReportResponse;
}

function normalizeScenarioType(value: unknown): SimulationTaskStatusResponse["scenarioType"] {
  return value === "dating" || value === "life_choice" ? value : "side_hustle";
}

function normalizeTaskStatus(value: unknown): CreateSimulationTaskResponse["status"] {
  if (
    value === "queued" ||
    value === "running" ||
    value === "paused" ||
    value === "recoverable_failed" ||
    value === "failed" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }
  if (value === "refunded") {
    return "cancelled";
  }

  return "queued";
}

function getCommercialTaskProgressPercent(status: unknown): number {
  switch (status) {
    case "queued":
      return 5;
    case "running":
      return 50;
    case "completed":
    case "failed":
    case "cancelled":
    case "refunded":
      return 100;
    default:
      return 0;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
