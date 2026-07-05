import { hashPrompt, type AiCallLogEntry } from "../ai/call-log.js";
import { estimateCostForModel } from "./cost-ledger.js";

export interface AiTokenSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  completedRuns: number;
  failedRuns: number;
  retryCount: number;
  totalLatencyMs: number;
  mostExpensiveStep?: {
    stepName: string;
    estimatedCost: number;
  };
}

type TokenSummaryLogger = Pick<Console, "info">;
type LoggableAiGateway = {
  onLog?: (entry: AiCallLogEntry) => void;
};

interface AiLogSubscriptionState {
  previousLogHandler?: (entry: AiCallLogEntry) => void;
  listeners: Set<(entry: AiCallLogEntry) => void>;
  dispatch: (entry: AiCallLogEntry) => void;
}

const aiLogSubscriptions = new WeakMap<LoggableAiGateway, AiLogSubscriptionState>();

export function summarizeAiCallLogs(entries: AiCallLogEntry[]): AiTokenSummary {
  const summary: AiTokenSummary = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    completedRuns: 0,
    failedRuns: 0,
    retryCount: 0,
    totalLatencyMs: 0,
  };
  let mostExpensiveEntry:
    | {
      stepName: string;
      estimatedCost: number;
    }
    | undefined;

  for (const entry of entries) {
    const promptTokens = entry.inputTokens ?? 0;
    const completionTokens = entry.outputTokens ?? 0;
    const estimatedCost = estimateCostForModel({
      provider: entry.provider,
      modelId: entry.modelId,
      promptTokens,
      completionTokens,
    });

    summary.promptTokens += promptTokens;
    summary.completionTokens += completionTokens;
    summary.totalTokens += promptTokens + completionTokens;
    summary.estimatedCost = roundCost(summary.estimatedCost + estimatedCost);
    summary.totalLatencyMs += entry.latencyMs ?? 0;

    if (entry.success) {
      summary.completedRuns += 1;
    } else {
      summary.failedRuns += 1;
    }

    if (estimatedCost > (mostExpensiveEntry?.estimatedCost ?? -1)) {
      mostExpensiveEntry = {
        stepName: entry.step,
        estimatedCost,
      };
    }
  }

  if (mostExpensiveEntry) {
    summary.mostExpensiveStep = mostExpensiveEntry;
  }

  return summary;
}

export function logAiTokenSummary(
  simulationId: string,
  entries: AiCallLogEntry[],
  logger: TokenSummaryLogger = console,
): void {
  try {
    const summary = summarizeAiCallLogs(entries);
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
    // Token accounting must not affect simulation completion.
  }
}

export async function runWithAiTokenSummaryLogging<T>(
  gateway: LoggableAiGateway,
  simulationId: string,
  run: () => Promise<T>,
  logger: TokenSummaryLogger = console,
): Promise<T> {
  const entries: AiCallLogEntry[] = [];
  const unsubscribe = addSimulationAiCallLogListener(
    gateway,
    simulationId,
    (entry) => entries.push(entry),
  );

  try {
    return await run();
  } finally {
    unsubscribe();
    logAiTokenSummary(simulationId, entries, logger);
  }
}

export function addSimulationAiCallLogListener(
  gateway: LoggableAiGateway,
  simulationId: string,
  listener: (entry: AiCallLogEntry) => void,
): () => void {
  const loggedSimulationIds = new Set([simulationId, hashPrompt(simulationId)]);

  return addAiCallLogListener(gateway, (entry) => {
    if (entry.simulationId && loggedSimulationIds.has(entry.simulationId)) {
      listener(entry);
    }
  });
}

export function addAiCallLogListener(
  gateway: LoggableAiGateway,
  listener: (entry: AiCallLogEntry) => void,
): () => void {
  let state = aiLogSubscriptions.get(gateway);
  if (!state) {
    state = {
      previousLogHandler: gateway.onLog,
      listeners: new Set(),
      dispatch: () => undefined,
    };
    state.dispatch = (entry) => {
      callLogHandler(state?.previousLogHandler, entry);
      for (const activeListener of Array.from(state?.listeners ?? [])) {
        callLogHandler(activeListener, entry);
      }
    };
    aiLogSubscriptions.set(gateway, state);
    gateway.onLog = state.dispatch;
  }

  state.listeners.add(listener);

  return () => {
    const activeState = aiLogSubscriptions.get(gateway);
    if (!activeState) {
      return;
    }

    activeState.listeners.delete(listener);
    if (activeState.listeners.size > 0) {
      return;
    }

    if (gateway.onLog === activeState.dispatch) {
      gateway.onLog = activeState.previousLogHandler;
    }
    aiLogSubscriptions.delete(gateway);
  };
}

function callLogHandler(
  handler: ((entry: AiCallLogEntry) => void) | undefined,
  entry: AiCallLogEntry,
): void {
  try {
    handler?.(entry);
  } catch {
    // Logging observers must not affect provider call outcomes.
  }
}

function roundCost(value: number): number {
  return Number(value.toFixed(8));
}
