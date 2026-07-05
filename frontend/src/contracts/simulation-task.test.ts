import assert from "node:assert/strict";
import test from "node:test";

import {
  isRecoverableTaskStatus,
  SIMULATION_TASK_STATUSES,
} from "./simulation-task.js";

test("simulation task statuses include durable execution states", () => {
  assert.deepEqual(SIMULATION_TASK_STATUSES, [
    "queued",
    "running",
    "paused",
    "recoverable_failed",
    "failed",
    "completed",
    "cancelled",
  ]);
});

test("isRecoverableTaskStatus only accepts recoverable failed state", () => {
  assert.equal(isRecoverableTaskStatus("recoverable_failed"), true);
  assert.equal(isRecoverableTaskStatus("running"), false);
  assert.equal(isRecoverableTaskStatus("completed"), false);
});

test("simulation responses can include runtime diagnostics", async () => {
  const types = await import("../types.js");
  const diagnostics: import("../types.js").SimulationRuntimeDiagnostics = {
    requestedInteractionMode: "enabled",
    interactionModeUsed: "legacy",
    deepModeAvailable: false,
    fallbackStageCount: 0,
    stages: [
      {
        stageIndex: 1,
        mode: "legacy",
        activatedAgentCount: 0,
        actionCount: 0,
        voteCount: 0,
        relationshipCount: 0,
      },
    ],
  };

  assert.equal(diagnostics.stages[0]?.mode, "legacy");
  assert.ok(types);
});

test("simulation responses can include route comparisons", () => {
  const routeComparison: import("../types.js").RouteComparison = {
    recommendedRouteId: "route_a",
    routes: [
      {
        id: "route_a",
        label: "A",
        title: "原方案",
        premise: "继续按原计划推进",
        stageSummaries: ["先跑 7 天"],
        finalState: {
          day: 30,
          productClarity: 50,
          executionEnergy: 50,
          trafficProgress: 50,
          trialUsers: 0,
          paidUsers: 0,
          revenue: 0,
          riskLevel: 50,
          confidence: 50,
        },
        successProbability: 50,
        regretRisk: 50,
        upside: "速度快",
        downside: "风险高",
        triggerToChoose: "有强反馈",
      },
      {
        id: "route_b",
        label: "B",
        title: "MVP 路线",
        premise: "先手动验证",
        stageSummaries: ["访谈用户"],
        finalState: {
          day: 30,
          productClarity: 60,
          executionEnergy: 60,
          trafficProgress: 40,
          trialUsers: 5,
          paidUsers: 1,
          revenue: 99,
          riskLevel: 40,
          confidence: 60,
        },
        successProbability: 60,
        regretRisk: 35,
        upside: "低成本",
        downside: "慢",
        triggerToChoose: "预算有限",
      },
    ],
    tradeoffs: ["速度 vs 风险"],
    sensitivityVariables: ["预算"],
    sevenDayProbe: ["访谈 5 人"],
  };

  const response: import("../types.js").SimulationApiResponse = {
    id: "sim-route",
    status: "completed",
    agents: [],
    stages: [],
    report: {} as import("../types.js").Report,
    createdAt: "2026-07-05T00:00:00.000Z",
    routeComparison,
  };

  assert.equal(response.routeComparison?.routes.length, 2);
});
