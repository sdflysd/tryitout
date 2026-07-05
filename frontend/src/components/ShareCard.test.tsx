import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ShareCard from "./ShareCard.js";
import type { Simulation } from "../types.js";

const baseSimulation: Simulation = {
  id: "sim-test-0001",
  type: "dating",
  userInput: {
    type: "dating",
    relationshipStatus: "暧昧冷淡期",
    chatLogOrIssue: "TA 最近回复变慢",
  },
  agents: [],
  stages: [],
  createdAt: "2026-06-26T00:00:00.000Z",
  report: {
    projectName: "暧昧拉扯期低压修复评估",
    successProbability: 78,
    expectedRevenue: "情感安全感回升",
    riskLevel: "medium",
    finalRecommendation: "建议放慢推进速度，用低压力、可回应的生活化表达重新建立安全感。",
    finalOutcome: "关系回到可沟通状态",
    shouldDo: "test_small",
    scores: {
      demandStrength: 72,
      willingnessToPay: 65,
      acquisitionDifficulty: 58,
      competitionPressure: 46,
      executionFit: 74,
      monetizationClarity: 60,
    },
    opportunities: ["对方仍保留回应窗口"],
    risks: ["过度追问会触发防备"],
    pivotSuggestions: [
      {
        title: "换成低压回应",
        description: "先承认对方节奏，再给出轻量邀约。",
      },
    ],
    actionPlan7Days: [
      {
        day: 1,
        title: "降压开场",
        action: "发送一句不索取答案的轻量关心。",
      },
    ],
  },
};

test("dating share card uses relationship language instead of side-hustle copy", () => {
  const html = renderToStaticMarkup(
    <ShareCard simulation={baseSimulation} onClose={() => undefined} />,
  );

  assert.match(html, /情感|关系|TA|亲密/);
  assert.doesNotMatch(html, /副业|搞钱|现金流|跑通胜率|MVP|兄弟们一起参谋/);
});

test("share card highlights route outcome, agent objection, and regret risk", () => {
  const html = renderToStaticMarkup(
    <ShareCard
      simulation={{
        ...baseSimulation,
        type: "side_hustle",
        userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
        agents: [
          {
            id: "customer_agent",
            name: "客户 Agent",
            role: "目标客户",
            stance: "质疑",
            keyJudgment: "需要案例",
            objection: "缺少真实案例，付费会犹豫。",
          },
        ],
        routeComparison: {
          recommendedRouteId: "mvp",
          routes: [
            {
              id: "mvp",
              label: "B",
              title: "MVP 手动验证",
              premise: "先服务再开发。",
              stageSummaries: [],
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
              successProbability: 64,
              regretRisk: 28,
              upside: "低成本看到信号",
              downside: "增长慢",
              triggerToChoose: "5 人愿意付费",
            },
          ],
          tradeoffs: [],
          sensitivityVariables: [],
          sevenDayProbe: [],
        },
      }}
      onClose={() => undefined}
    />,
  );

  assert.match(html, /MVP 手动验证/);
  assert.match(html, /缺少真实案例/);
  assert.match(html, /后悔风险|28%/);
});
