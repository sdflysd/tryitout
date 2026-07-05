import type { AiProviderType } from "../ai/types.js";
import type { SimulationStepRunRecord } from "./task-types.js";

export interface CostEstimateInput {
  promptTokens: number;
  completionTokens: number;
  inputTokenPricePerMillion: number;
  outputTokenPricePerMillion: number;
}

export interface StepRunSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  totalLatencyMs: number;
  completedRuns: number;
  failedRuns: number;
  retryCount: number;
}

export interface CostSummary extends StepRunSummary {
  byStage: Record<number, StepRunSummary>;
  byStep: Record<string, StepRunSummary>;
  mostExpensiveStep?: {
    stepName: string;
    estimatedCost: number;
  };
}

interface ModelPrice {
  inputTokenPricePerMillion: number;
  outputTokenPricePerMillion: number;
}

const DEFAULT_MODEL_PRICE: ModelPrice = {
  inputTokenPricePerMillion: 0,
  outputTokenPricePerMillion: 0,
};

const MODEL_PRICING_USD_PER_MILLION: Record<string, ModelPrice> = {
  "gemini:gemini-3.5-flash": {
    inputTokenPricePerMillion: 0.3,
    outputTokenPricePerMillion: 2.5,
  },
  "anthropic:claude-3-5-haiku-latest": {
    inputTokenPricePerMillion: 0.8,
    outputTokenPricePerMillion: 4,
  },
  "anthropic:claude-sonnet-4-20250514": {
    inputTokenPricePerMillion: 3,
    outputTokenPricePerMillion: 15,
  },
};

export function estimateModelCallCost(input: CostEstimateInput): number {
  const inputCost =
    (input.promptTokens / 1_000_000) * input.inputTokenPricePerMillion;
  const outputCost =
    (input.completionTokens / 1_000_000) * input.outputTokenPricePerMillion;

  return roundCost(inputCost + outputCost);
}

export function estimateCostForModel({
  provider,
  modelId,
  promptTokens,
  completionTokens,
}: {
  provider?: string;
  modelId?: string;
  promptTokens?: number;
  completionTokens?: number;
}): number {
  const price = getModelPrice(provider, modelId);

  return estimateModelCallCost({
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    inputTokenPricePerMillion: price.inputTokenPricePerMillion,
    outputTokenPricePerMillion: price.outputTokenPricePerMillion,
  });
}

export function summarizeStepRuns(runs: SimulationStepRunRecord[]): CostSummary {
  const total = emptySummary();
  const byStage: Record<number, StepRunSummary> = {};
  const byStep: Record<string, StepRunSummary> = {};
  let mostExpensiveRun: SimulationStepRunRecord | undefined;

  for (const run of runs) {
    addRun(total, run);

    if (typeof run.stageIndex === "number") {
      byStage[run.stageIndex] ??= emptySummary();
      addRun(byStage[run.stageIndex], run);
    }

    byStep[run.stepName] ??= emptySummary();
    addRun(byStep[run.stepName], run);

    if (
      (run.estimatedCost ?? 0) > (mostExpensiveRun?.estimatedCost ?? -1)
    ) {
      mostExpensiveRun = run;
    }
  }

  return {
    ...total,
    byStage,
    byStep,
    mostExpensiveStep: mostExpensiveRun
      ? {
          stepName: mostExpensiveRun.stepName,
          estimatedCost: mostExpensiveRun.estimatedCost ?? 0,
        }
      : undefined,
  };
}

function emptySummary(): StepRunSummary {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    totalLatencyMs: 0,
    completedRuns: 0,
    failedRuns: 0,
    retryCount: 0,
  };
}

function addRun(summary: StepRunSummary, run: SimulationStepRunRecord): void {
  summary.promptTokens += run.promptTokens ?? 0;
  summary.completionTokens += run.completionTokens ?? 0;
  summary.totalTokens +=
    run.totalTokens ?? (run.promptTokens ?? 0) + (run.completionTokens ?? 0);
  summary.estimatedCost = roundCost(
    summary.estimatedCost + (run.estimatedCost ?? 0),
  );
  summary.totalLatencyMs += run.latencyMs ?? 0;
  summary.retryCount += run.retryCount ?? 0;
  if (run.status === "completed") {
    summary.completedRuns += 1;
  }
  if (run.status === "failed") {
    summary.failedRuns += 1;
  }
}

function getModelPrice(provider?: string, modelId?: string): ModelPrice {
  if (!provider || !modelId) {
    return DEFAULT_MODEL_PRICE;
  }

  const key = `${provider as AiProviderType}:${modelId}`;
  return MODEL_PRICING_USD_PER_MILLION[key] ?? DEFAULT_MODEL_PRICE;
}

function roundCost(value: number): number {
  return Number(value.toFixed(8));
}
