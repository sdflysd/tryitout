import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RouteComparisonPanel from "./RouteComparisonPanel.js";
import type { Simulation } from "../types.js";

test("route comparison panel renders nothing without route data", () => {
  const html = renderToStaticMarkup(
    <RouteComparisonPanel simulation={makeSimulation(undefined)} />,
  );

  assert.equal(html, "");
});

test("route comparison panel renders recommendation, routes, regret risk, and probe", () => {
  const html = renderToStaticMarkup(
    <RouteComparisonPanel
      simulation={makeSimulation({
        recommendedRouteId: "mvp",
        routes: [
          {
            id: "mvp",
            label: "B",
            title: "MVP 手动验证",
            premise: "先用人工服务验证需求。",
            stageSummaries: ["前 7 天访谈和案例"],
            finalState: makeWorldState(),
            successProbability: 64,
            regretRisk: 28,
            upside: "低成本看到真实信号",
            downside: "增长较慢",
            triggerToChoose: "5 个用户愿意付费",
          },
          {
            id: "pivot",
            label: "C",
            title: "换成简历诊断课",
            premise: "从工具改成服务。",
            stageSummaries: ["先交付诊断"],
            finalState: makeWorldState(),
            successProbability: 58,
            regretRisk: 35,
            upside: "更容易成交",
            downside: "更耗时间",
            triggerToChoose: "工具开发受阻",
          },
        ],
        tradeoffs: ["速度 vs 成本"],
        sensitivityVariables: ["付费意愿"],
        sevenDayProbe: ["找 5 个应届生访谈"],
      })}
    />,
  );

  assert.match(html, /推荐路线/);
  assert.match(html, /MVP 手动验证/);
  assert.match(html, /换成简历诊断课/);
  assert.match(html, /后悔风险/);
  assert.match(html, /找 5 个应届生访谈/);
});

function makeSimulation(routeComparison: Simulation["routeComparison"]): Simulation {
  return {
    id: "sim-route-panel",
    type: "side_hustle",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
    agents: [],
    stages: [],
    createdAt: "2026-07-05T00:00:00.000Z",
    routeComparison,
    report: {
      projectName: "AI 简历优化",
      successProbability: 56,
      expectedRevenue: "100 元",
      riskLevel: "medium",
      finalRecommendation: "先小测。",
      scores: {
        demandStrength: 60,
        willingnessToPay: 50,
        acquisitionDifficulty: 40,
        competitionPressure: 50,
        executionFit: 70,
        monetizationClarity: 55,
      },
      finalOutcome: "可小测",
      opportunities: [],
      risks: [],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small",
    },
  };
}

function makeWorldState() {
  return {
    day: 30,
    productClarity: 60,
    executionEnergy: 60,
    trafficProgress: 40,
    trialUsers: 5,
    paidUsers: 1,
    revenue: 99,
    riskLevel: 40,
    confidence: 60,
  };
}
