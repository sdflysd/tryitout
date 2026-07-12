import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ReportView from "./ReportView.js";
import type { Simulation } from "../types.js";

const reportSimulation: Simulation = {
  id: "sim-report-edit",
  type: "side_hustle",
  userInput: {
    type: "side_hustle",
    projectIdea: "我想用 AI 帮应届生改简历，并在小红书获客。",
    dailyTime: "2小时",
    budget: "500元以内",
  },
  agents: [
    {
      id: "self_agent",
      name: "行动者 Agent",
      role: "用户本人",
      stance: "支持",
      keyJudgment: "可以先手动服务验证需求。",
    },
    {
      id: "customer_agent",
      name: "客户 Agent",
      role: "目标客户",
      stance: "质疑",
      keyJudgment: "需要看到案例才会付费。",
    },
  ],
  stages: [
    {
      stageIndex: 1,
      timeRange: "第 1-3 天",
      title: "冷启动",
      summary: "先做 3 个免费案例。",
      events: [],
      agentReactions: [],
      stateAfter: {
        day: 3,
        productClarity: 55,
        executionEnergy: 70,
        trafficProgress: 15,
        trialUsers: 3,
        paidUsers: 0,
        revenue: 0,
        riskLevel: 40,
        confidence: 52,
      },
      keyDecision: "是否继续投放案例？",
      nextSuggestion: "补齐前后对比素材。",
    },
  ],
  createdAt: "2026-07-04T00:00:00.000Z",
  report: {
    projectName: "AI 简历优化",
    successProbability: 56,
    expectedRevenue: "30-300 元",
    riskLevel: "medium",
    finalRecommendation: "先用手动服务验证需求。",
    scores: {
      demandStrength: 70,
      willingnessToPay: 42,
      acquisitionDifficulty: 60,
      competitionPressure: 55,
      executionFit: 75,
      monetizationClarity: 50,
    },
    finalOutcome: "小范围可测",
    opportunities: ["求职焦虑真实"],
    risks: ["免费替代较多"],
    pivotSuggestions: [
      {
        title: "先做人工改简历",
        description: "用 5 个真实案例再判断是否开发工具。",
      },
    ],
    actionPlan7Days: [
      {
        day: 1,
        title: "找样本",
        action: "约 3 位同学免费试改。",
      },
    ],
    shouldDo: "test_small",
  },
};

test("report view exposes an edit input action for the current simulation", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={reportSimulation}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /编辑输入/);
  assert.match(html, /btn-edit-report-input/);
});

test("report view renders the B+C decision workbench and mobile accordion contract", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={reportSimulation}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /report-layout-workbench/);
  assert.match(html, /report-decision-rail/);
  assert.match(html, /report-workspace/);
  assert.match(html, /report-mobile-decision-flow/);
  assert.match(html, /report-mobile-action-preview/);
  assert.match(html, /report-detail-accordion/);
  assert.match(html, /先用手动服务验证需求。/);
  assert.match(html, /找样本/);
});

test("report view includes route comparison when available", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={{
        ...reportSimulation,
        routeComparison: {
          recommendedRouteId: "mvp",
          routes: [
            {
              id: "mvp",
              label: "B",
              title: "MVP 手动验证",
              premise: "先用人工服务验证需求。",
              stageSummaries: ["前 7 天访谈和案例"],
              finalState: reportSimulation.stages[0].stateAfter,
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
              finalState: reportSimulation.stages[0].stateAfter,
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
        },
      }}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /推荐路线/);
  assert.match(html, /MVP 手动验证/);
});

test("report view renders agent memory evidence when available", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={{
        ...reportSimulation,
        agents: [
          {
            ...reportSimulation.agents[1],
            memory: {
              trustByAgentId: {},
              claimsRemembered: ["价格太高"],
              lastPosition: "pivot",
            },
          },
        ],
      }}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /价格太高/);
  assert.match(html, /pivot/);
});

test("report view renders outcome feedback panel", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={reportSimulation}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /后续真实结果/);
  assert.match(html, /simulation-outcome-feedback/);
});

test("report view renders report disclaimer when present", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={{
        ...reportSimulation,
        report: {
          ...reportSimulation.report,
          disclaimer: "本报告仅用于模拟参考，不构成投资、职业、法律或心理建议。",
        },
      }}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /仅用于模拟参考/);
  assert.match(html, /不构成投资/);
});

test("report view renders agent-backed evidence when present", () => {
  const html = renderToStaticMarkup(
    <ReportView
      simulation={{
        ...reportSimulation,
        report: {
          ...reportSimulation.report,
          disagreementSummary: "客户 Agent 和商业导师分歧最大。",
          agentEvidence: [
            {
              conclusion: "先做人工服务验证。",
              supportingAgentIds: ["customer_agent"],
              opposingAgentIds: ["self_agent"],
              evidence: "客户需要真实案例。",
            },
          ],
        },
      }}
      onRestart={() => undefined}
      onOpenShareCard={() => undefined}
      onEditInput={() => undefined}
    />,
  );

  assert.match(html, /Agent 分歧证据/);
  assert.match(html, /先做人工服务验证/);
  assert.match(html, /客户需要真实案例/);
});
