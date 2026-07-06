import type {
  CreateSimulationTaskRequest,
  CreateSimulationTaskResponse,
  SimulationReportResponse,
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
  return readJsonResponse(
    await fetchImpl("/api/simulation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

export async function getSimulationTaskStatus(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationTaskStatusResponse> {
  return readJsonResponse(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/status`),
  );
}

export async function getSimulationTaskReport(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationReportResponse> {
  return readJsonResponse(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/report`),
  );
}

export async function resumeSimulationTask(
  simulationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  return readJsonResponse(
    await fetchImpl(`/api/simulation-tasks/${encodeURIComponent(simulationId)}/resume`, {
      method: "POST",
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
    }),
  );
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

interface RunSimulationTaskOptions {
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
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
  while (true) {
    const status = await getSimulationTaskStatus(simulationId, fetchImpl);
    onProgress?.(toProgressEvent(status));

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
    status: status.status === "completed" ? "completed" : "started",
    percent: status.progressPercent,
    message: getTaskProgressMessage(status, step),
    createdAt: status.updatedAt,
  };
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
