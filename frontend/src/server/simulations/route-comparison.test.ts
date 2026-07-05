import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteComparisonPrompt,
  normalizeRouteComparison,
} from "./route-comparison.js";
import type { Agent, SimulationStage, UserInput, WorldState } from "../../types.js";

const fallbackState: WorldState = {
  day: 30,
  productClarity: 50,
  executionEnergy: 50,
  trafficProgress: 50,
  trialUsers: 0,
  paidUsers: 0,
  revenue: 0,
  riskLevel: 50,
  confidence: 50,
};

const agents: Agent[] = [
  {
    id: "customer_agent",
    name: "客户 Agent",
    role: "目标用户",
    stance: "质疑",
    keyJudgment: "需要更明确的付费理由。",
  },
];

const stages: SimulationStage[] = [
  {
    stageIndex: 1,
    timeRange: "第 1-3 天",
    title: "冷启动",
    summary: "用户先验证需求。",
    events: [],
    agentReactions: [],
    stateAfter: fallbackState,
    keyDecision: "是否继续原方案？",
    nextSuggestion: "做更小样本测试。",
  },
];

test("buildRouteComparisonPrompt includes side hustle route language", () => {
  const prompt = buildRouteComparisonPrompt({
    type: "side_hustle",
    userInput: {
      type: "side_hustle",
      projectIdea: "AI 简历优化服务",
    },
    agents,
    stages,
  });

  assert.match(prompt, /original/i);
  assert.match(prompt, /MVP/i);
  assert.match(prompt, /pivot/i);
});

test("buildRouteComparisonPrompt includes dating route language", () => {
  const prompt = buildRouteComparisonPrompt({
    type: "dating",
    userInput: {
      type: "dating",
      chatLogOrIssue: "对方回复变慢",
      proposedAction: "直接问清楚关系",
    },
    agents,
    stages,
  });

  assert.match(prompt, /direct/i);
  assert.match(prompt, /space/i);
  assert.match(prompt, /repair/i);
});

test("buildRouteComparisonPrompt includes all life choice options", () => {
  const userInput: UserInput = {
    type: "life_choice",
    decisionContext: "我在几个选择之间纠结。",
    lifeChoiceOptions: [
      { label: "A", title: "继续考研" },
      { label: "B", title: "先去工作" },
      { label: "C", title: "回老家考编" },
    ],
  };

  const prompt = buildRouteComparisonPrompt({
    type: "life_choice",
    userInput,
    agents,
    stages,
  });

  assert.match(prompt, /继续考研/);
  assert.match(prompt, /先去工作/);
  assert.match(prompt, /回老家考编/);
});

test("normalizeRouteComparison caps routes and clamps scores", () => {
  const normalized = normalizeRouteComparison(
    {
      routeComparison: {
        recommendedRouteId: "r1",
        routes: [
          makeRoute("r1", -5, 105),
          makeRoute("r2", 55, 45),
          makeRoute("r3", 70, 30),
          makeRoute("r4", 80, 20),
        ],
        tradeoffs: ["速度 vs 风险"],
        sensitivityVariables: ["预算"],
        sevenDayProbe: ["访谈 5 人"],
      },
    },
    fallbackState,
  );

  assert.ok(normalized);
  assert.equal(normalized.routes.length, 3);
  assert.equal(normalized.routes[0].successProbability, 0);
  assert.equal(normalized.routes[0].regretRisk, 100);
});

test("normalizeRouteComparison rejects fewer than two routes", () => {
  const normalized = normalizeRouteComparison(
    {
      routeComparison: {
        recommendedRouteId: "r1",
        routes: [makeRoute("r1", 50, 50)],
        tradeoffs: [],
        sensitivityVariables: [],
        sevenDayProbe: [],
      },
    },
    fallbackState,
  );

  assert.equal(normalized, undefined);
});

function makeRoute(id: string, successProbability: number, regretRisk: number) {
  return {
    id,
    label: id.toUpperCase(),
    title: `路线 ${id}`,
    premise: "先做小范围验证",
    stageSummaries: ["第 1 周验证需求"],
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
    successProbability,
    regretRisk,
    upside: "更快看到信号",
    downside: "样本偏小",
    triggerToChoose: "访谈反馈强烈",
  };
}
