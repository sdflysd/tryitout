import type {
  CreateSimulationTaskRequest,
  CreateSimulationTaskResponse,
  SimulationReportResponse,
  SimulationTaskStatusResponse,
} from "../../contracts/simulation-task.js";
import type { CostSummary } from "./cost-ledger.js";
import type { SimulationTaskService } from "./task-service.js";
import { assessUserInputSafety } from "./safety.js";
import { toPublicStatus } from "./task-service.js";

interface Deps {
  service: SimulationTaskService;
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export async function handleCreateSimulationTaskRequest(
  body: unknown,
  { service }: Deps,
): Promise<ApiResult<CreateSimulationTaskResponse | { error: string }>> {
  const request = parseCreateTaskRequest(body);
  if (request.ok === false) {
    return {
      status: 400,
      body: { error: request.error },
    };
  }

  return {
    status: 200,
    body: await service.createTask(request.value),
  };
}

export async function handleGetSimulationTaskStatusRequest(
  simulationId: string,
  { service }: Deps,
): Promise<ApiResult<SimulationTaskStatusResponse | { error: string }>> {
  const status = await service.getStatus(simulationId);
  if (!status) {
    return {
      status: 404,
      body: { error: "simulation task not found" },
    };
  }

  return {
    status: 200,
    body: status,
  };
}

export async function handleResumeSimulationTaskRequest(
  simulationId: string,
  { service }: Deps,
): Promise<ApiResult<{ ok: boolean; error?: string }>> {
  const status = await service.getStatus(simulationId);
  if (!status) {
    return {
      status: 404,
      body: { ok: false, error: "simulation task not found" },
    };
  }
  if (!status.recoverable || status.status !== "recoverable_failed") {
    return {
      status: 409,
      body: { ok: false, error: "simulation task is not recoverable" },
    };
  }

  await service.resumeRecoverableTask(simulationId);
  return {
    status: 200,
    body: { ok: true },
  };
}

export async function handleCancelSimulationTaskRequest(
  simulationId: string,
  { service }: Deps,
): Promise<ApiResult<SimulationTaskStatusResponse | { error: string }>> {
  try {
    const task = await service.cancelTask(simulationId);
    return {
      status: 200,
      body: toPublicStatus(task),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "cancel failed";
    return {
      status: /not found/i.test(message) ? 404 : 409,
      body: { error: message },
    };
  }
}

export async function handleGetSimulationReportRequest(
  simulationId: string,
  { service }: Deps,
): Promise<ApiResult<SimulationReportResponse>> {
  const status = await service.getStatus(simulationId);
  if (!status) {
    return {
      status: 404,
      body: {
        simulationId,
        status: "failed",
        error: "simulation task not found",
      },
    };
  }

  const report = await service.getReport(simulationId);
  if (!report?.publicReport) {
    return {
      status: 404,
      body: {
        simulationId,
        status: status.status,
        error: "simulation report not ready",
      },
    };
  }

  return {
    status: 200,
    body: {
      simulationId,
      status: status.status,
      report: report.publicReport,
    },
  };
}

export async function handleGetSimulationCostSummaryRequest(
  simulationId: string,
  { service }: Deps,
): Promise<ApiResult<CostSummary>> {
  return {
    status: 200,
    body: await service.getCostSummary(simulationId),
  };
}

function parseCreateTaskRequest(
  body: unknown,
):
  | { ok: true; value: CreateSimulationTaskRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "request body must be an object" };
  }

  const raw = body as Partial<CreateSimulationTaskRequest>;
  const userInput = raw.userInput;
  if (!userInput || typeof userInput !== "object") {
    return { ok: false, error: "用户输入 (userInput) 不能为空" };
  }
  if (
    userInput.type !== "side_hustle" &&
    userInput.type !== "dating" &&
    userInput.type !== "life_choice"
  ) {
    return { ok: false, error: "invalid simulation type" };
  }
  if (userInput.type === "side_hustle" && !userInput.projectIdea) {
    return { ok: false, error: "项目想法 (projectIdea) 不能为空" };
  }
  if (userInput.type === "dating" && !userInput.chatLogOrIssue) {
    return { ok: false, error: "聊天记录或冲突内容 (chatLogOrIssue) 不能为空" };
  }
  if (
    userInput.type === "life_choice" &&
    (!userInput.optionA || !userInput.optionB) &&
    (!userInput.lifeChoiceOptions || userInput.lifeChoiceOptions.length < 2)
  ) {
    return { ok: false, error: "至少需要 2 个可比较的人生选择" };
  }
  if (
    raw.interactionMode !== undefined &&
    raw.interactionMode !== "legacy" &&
    raw.interactionMode !== "enabled"
  ) {
    return { ok: false, error: "invalid interactionMode" };
  }

  const safety = assessUserInputSafety(userInput);
  if (!safety.ok) {
    return { ok: false, error: safety.message };
  }

  return {
    ok: true,
    value: {
      userInput,
      interactionMode: raw.interactionMode,
    },
  };
}
