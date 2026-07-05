import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateModelCallCost,
  summarizeStepRuns,
} from "./cost-ledger.js";
import type { SimulationStepRunRecord } from "./task-types.js";

test("estimateModelCallCost calculates input and output token cost", () => {
  assert.equal(
    estimateModelCallCost({
      promptTokens: 1000,
      completionTokens: 500,
      inputTokenPricePerMillion: 2,
      outputTokenPricePerMillion: 10,
    }),
    0.007,
  );
});

test("summarizeStepRuns aggregates tokens and cost by task and stage", () => {
  const runs: SimulationStepRunRecord[] = [
    {
      id: "1",
      simulationId: "sim_1",
      stageIndex: 1,
      stepName: "generate_world_event",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.001,
      latencyMs: 1000,
      status: "completed",
      startedAt: "2026-07-02T00:00:00.000Z",
      completedAt: "2026-07-02T00:00:01.000Z",
    },
    {
      id: "2",
      simulationId: "sim_1",
      stageIndex: 1,
      stepName: "arbitrate_stage",
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      estimatedCost: 0.002,
      latencyMs: 2000,
      retryCount: 1,
      status: "failed",
      startedAt: "2026-07-02T00:00:01.000Z",
      completedAt: "2026-07-02T00:00:03.000Z",
    },
  ];

  const summary = summarizeStepRuns(runs);

  assert.equal(summary.totalTokens, 450);
  assert.equal(summary.estimatedCost, 0.003);
  assert.equal(summary.totalLatencyMs, 3000);
  assert.equal(summary.failedRuns, 1);
  assert.equal(summary.retryCount, 1);
  assert.equal(summary.byStage[1]?.totalTokens, 450);
  assert.equal(summary.mostExpensiveStep?.stepName, "arbitrate_stage");
});
