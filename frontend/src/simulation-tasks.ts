import type {
  CreateSimulationTaskRequest,
  CreateSimulationTaskResponse,
  SimulationReportResponse,
  SimulationTaskStatusResponse,
} from "./contracts/simulation-task";

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

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.error === "string" ? body.error : `HTTP error ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}
