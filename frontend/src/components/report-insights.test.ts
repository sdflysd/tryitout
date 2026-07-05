import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentMemoryEvidence,
  buildAgentEvidenceRows,
  buildAgentVoteRows,
  buildArbiterEvidence,
  buildKeyVariables,
  getReportModeSummary,
} from "./report-insights.js";
import type { Simulation } from "../types.js";

function makeSimulation(): Simulation {
  return {
    id: "sim_1",
    type: "side_hustle",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
    createdAt: "2026-06-30T00:00:00.000Z",
    agents: [
      { id: "customer_agent", name: "客户 Agent", role: "客户", stance: "质疑", keyJudgment: "我需要案例才付费。" },
      { id: "mentor_agent", name: "导师 Agent", role: "导师", stance: "支持", keyJudgment: "可以手动验证。" },
    ],
    stages: [
      {
        stageIndex: 1,
        timeRange: "第 1-3 天",
        title: "测试",
        summary: "客户要求看到前后对比。",
        events: [],
        agentReactions: [],
        interactions: {
          activatedAgentIds: ["customer_agent", "mentor_agent"],
          actions: [],
          votes: [
            {
              agentId: "customer_agent",
              verdict: "pivot",
              confidence: 81,
              stateDeltaVote: { confidence: -8, riskLevel: 6 },
              rationale: "没有案例时付费意愿不足。",
            },
          ],
          relationships: [],
          mergedVoteDelta: { confidence: -8, riskLevel: 6 },
          finalDelta: { confidence: -5, riskLevel: 4 },
          arbiterSummary: "裁判采纳客户 Agent 的质疑，但保留小范围测试。",
        },
        stateAfter: {
          day: 3,
          productClarity: 40,
          executionEnergy: 70,
          trafficProgress: 10,
          trialUsers: 3,
          paidUsers: 0,
          revenue: 0,
          riskLevel: 55,
          confidence: 42,
        },
        keyDecision: "是否先做手动服务？",
        nextSuggestion: "约 5 个用户访谈。",
      },
    ],
    report: {
      projectName: "AI 简历优化",
      successProbability: 52,
      expectedRevenue: "小额试水",
      riskLevel: "medium",
      finalRecommendation: "先测试",
      scores: {
        demandStrength: 70,
        willingnessToPay: 35,
        acquisitionDifficulty: 65,
        competitionPressure: 70,
        executionFit: 60,
        monetizationClarity: 45,
      },
      finalOutcome: "可小测",
      opportunities: ["求职焦虑真实"],
      risks: ["免费替代多"],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small",
    },
  };
}

test("buildAgentVoteRows reads interaction votes, not static stance only", () => {
  const rows = buildAgentVoteRows(makeSimulation());
  assert.equal(rows[0].agentName, "客户 Agent");
  assert.equal(rows[0].verdict, "pivot");
  assert.match(rows[0].rationale, /付费意愿不足/);
});

test("buildAgentEvidenceRows falls back to basic stage reactions without calling them votes", () => {
  const simulation = makeSimulation();
  delete simulation.stages[0].interactions;
  simulation.interactionModeUsed = "legacy";
  simulation.stages[0].agentReactions = [
    {
      agentId: "customer_agent",
      agentName: "客户 Agent",
      quote: "没有案例我不会付费。",
      interpretation: "需要先补案例和低价试用。",
      fieldAffected: "willingnessToPay",
      delta: -8,
    },
  ];

  const rows = buildAgentEvidenceRows(simulation);

  assert.equal(rows.kind, "reactions");
  assert.equal(rows.title, "Agent 观点");
  assert.match(rows.rows[0].rationale, /低价试用/);
});

test("getReportModeSummary exposes the actual user-facing execution mode", () => {
  const deepSimulation = makeSimulation();
  deepSimulation.interactionModeUsed = "enabled";

  assert.deepEqual(getReportModeSummary(deepSimulation), {
    label: "深度 Agent 已生效",
    detail: "本次报告包含 Agent 动作、投票和裁判仲裁。",
    tone: "deep",
  });

  const basicSimulation = makeSimulation();
  delete basicSimulation.stages[0].interactions;
  basicSimulation.interactionModeUsed = "legacy";

  assert.deepEqual(getReportModeSummary(basicSimulation), {
    label: "基础推演报告",
    detail: "本次报告使用分步推演和 Agent 观点，不包含逐 Agent 投票。",
    tone: "basic",
  });
});

test("getReportModeSummary warns when deep mode partially fell back", () => {
  const simulation = makeSimulation();
  simulation.interactionModeUsed = "enabled";
  simulation.runtimeDiagnostics = {
    requestedInteractionMode: "enabled",
    interactionModeUsed: "enabled",
    deepModeAvailable: true,
    fallbackStageCount: 2,
    stages: [],
  };

  const summary = getReportModeSummary(simulation);

  assert.match(summary.label, /部分|降级/);
  assert.match(summary.detail, /2/);
});

test("buildArbiterEvidence exposes arbiter summary and final delta", () => {
  const evidence = buildArbiterEvidence(makeSimulation());
  assert.match(evidence.join("\n"), /裁判采纳客户 Agent/);
  assert.match(evidence.join("\n"), /信心指数 -5/);
});

test("buildArbiterEvidence translates life choice state deltas", () => {
  const simulation = makeSimulation();
  simulation.type = "life_choice";
  simulation.userInput = { type: "life_choice", decisionContext: "是否继续全职做 AI 产品" };

  const evidence = buildArbiterEvidence(simulation).join("\n");

  assert.match(evidence, /信心指数 -5/);
  assert.match(evidence, /悔恨与断粮风险 \+4/);
  assert.doesNotMatch(evidence, /confidence|riskLevel|productClarity|executionEnergy/);
});

test("buildKeyVariables surfaces decision-sensitive variables", () => {
  const variables = buildKeyVariables(makeSimulation());
  assert.match(variables.join("\n"), /付费|获客|风险|信心/);
});

test("buildKeyVariables uses life choice variables for life choice simulations", () => {
  const simulation = makeSimulation();
  simulation.type = "life_choice";
  simulation.userInput = { type: "life_choice", decisionContext: "是否继续全职做 AI 产品" };

  const variables = buildKeyVariables(simulation).join("\n");

  assert.match(variables, /主推方向潜力|备选方向潜力|现实阻力|面包保障|悔恨与断粮风险|信心指数/);
  assert.doesNotMatch(variables, /付费|获客|竞争/);
});

test("buildAgentMemoryEvidence explains stance changes from remembered claims", () => {
  const simulation = makeSimulation();
  simulation.agents[0].memory = {
    trustByAgentId: {},
    claimsRemembered: ["价格太高"],
    lastPosition: "pivot",
  };

  const evidence = buildAgentMemoryEvidence(simulation);

  assert.match(evidence.join("\n"), /客户 Agent/);
  assert.match(evidence.join("\n"), /价格太高/);
  assert.match(evidence.join("\n"), /pivot/);
});
