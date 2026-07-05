import type { AiCallLogEntry } from "../ai/call-log.js";
import type { SimulationApiResponse, SimulationProgressEvent } from "../../types.js";
import type { SimulationTaskService } from "./task-service.js";

interface RunSimulationTaskDeps {
  service: SimulationTaskService;
  logger?: Pick<Console, "info">;
  runSimulation: (hooks: {
    onProgress: (event: SimulationProgressEvent) => void;
    onAiCallLog: (entry: AiCallLogEntry) => void;
  }) => Promise<SimulationApiResponse>;
}

export async function runSimulationTaskOnce(
  simulationId: string,
  { service, logger = console, runSimulation }: RunSimulationTaskDeps,
): Promise<void> {
  const pendingWrites: Promise<unknown>[] = [];
  let writeQueue = Promise.resolve();
  const enqueueWrite = (write: () => Promise<unknown>): void => {
    const queuedWrite = writeQueue.then(write).catch(() => undefined);
    writeQueue = queuedWrite.then(() => undefined, () => undefined);
    pendingWrites.push(queuedWrite);
  };

  await service.markRunning(simulationId, {
    currentStageIndex: 0,
    currentStepName: "run_simulation",
    progressPercent: 1,
  });

  try {
    const report = await runSimulation({
      onProgress: (event) => {
        enqueueWrite(
          () => service.markRunning(simulationId, {
            currentStageIndex: event.stageIndex,
            currentStepName: event.step,
            progressPercent: event.percent,
          }),
        );
      },
      onAiCallLog: (entry) => {
        enqueueWrite(
          () => service.recordModelCall({
            simulationId,
            stageIndex: entry.stageIndex,
            stepName: entry.step,
            provider: entry.provider,
            modelId: entry.modelId,
            modelProfileId: entry.modelProfileId,
            promptTokens: entry.inputTokens,
            completionTokens: entry.outputTokens,
            latencyMs: entry.latencyMs,
            status: entry.success ? "completed" : "failed",
            errorCode: entry.errorCode,
            startedAt: entry.timestamp,
            completedAt: entry.timestamp,
          }),
        );
      },
    });
    await Promise.all(pendingWrites);
    await logTokenSummary(simulationId, service, logger);
    await service.markCompleted(simulationId, report);
  } catch (error) {
    await Promise.all(pendingWrites);
    const errorCode = classifyTaskError(error);
    const checkpoint = await service.getLatestCheckpoint(simulationId);
    const update = {
      currentStageIndex: checkpoint?.stageIndex ?? 0,
      currentStepName: checkpoint?.stepName ?? "run_simulation",
      progressPercent: (await service.getStatus(simulationId))?.progressPercent ?? 1,
      errorCode,
    };

    if (isRecoverableTaskError(error)) {
      await service.markRecoverableFailure(simulationId, update);
      return;
    }

    await service.markFailed(simulationId, update);
  }
}

async function logTokenSummary(
  simulationId: string,
  service: SimulationTaskService,
  logger: Pick<Console, "info">,
): Promise<void> {
  try {
    const summary = await service.getCostSummary(simulationId);
    logger.info(
      "[AI_TOTAL]",
      JSON.stringify({
        simulationId,
        promptTokens: summary.promptTokens,
        completionTokens: summary.completionTokens,
        totalTokens: summary.totalTokens,
        estimatedCost: summary.estimatedCost,
        completedRuns: summary.completedRuns,
        failedRuns: summary.failedRuns,
        retryCount: summary.retryCount,
        totalLatencyMs: summary.totalLatencyMs,
        mostExpensiveStep: summary.mostExpensiveStep,
      }),
    );
  } catch {
    // Token accounting must not affect simulation task completion.
  }
}

export function classifyTaskError(error: unknown): string {
  const status = getErrorStatus(error);
  if (status) {
    return `provider_${status}`;
  }

  const code = getErrorCode(error);
  if (code) {
    return code;
  }

  if (error instanceof Error && /timeout|timed out|deadline/i.test(error.message)) {
    return "model_timeout";
  }
  if (error instanceof Error && /network|fetch failed|connection/i.test(error.message)) {
    return "network_interruption";
  }

  return "simulation_failed";
}

export function isRecoverableTaskError(error: unknown): boolean {
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
    code &&
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
    ].includes(code)
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /timeout|timed out|deadline|network|fetch failed|rate limit|too many requests|temporar|unavailable|service unavailable/i
    .test(error.message);
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode ?? record.code;
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
