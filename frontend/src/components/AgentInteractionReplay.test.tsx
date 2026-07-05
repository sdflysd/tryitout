import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentInteractionReplay, {
  formatVoteConfidence,
  getAgentActionLabel,
} from "./AgentInteractionReplay.js";
import type { SimulationStage } from "../types.js";

test("agent action labels use compact Chinese replay labels", () => {
  assert.equal(getAgentActionLabel("like"), "点赞");
  assert.equal(getAgentActionLabel("challenge"), "质疑");
  assert.equal(getAgentActionLabel("warn"), "警告");
  assert.equal(getAgentActionLabel("vote"), "投票");
});

test("vote confidence formats 0-100 values without rescaling", () => {
  assert.equal(formatVoteConfidence(81), "CONF 81%");
});

const baseStage: SimulationStage = {
  stageIndex: 1,
  timeRange: "第 1-3 天",
  title: "信任冲突",
  summary: "客户 Agent 与乐观 Agent 发生冲突。",
  events: [],
  agentReactions: [],
  stateAfter: {
    day: 3,
    productClarity: 30,
    executionEnergy: 70,
    trafficProgress: 10,
    trialUsers: 0,
    paidUsers: 0,
    revenue: 0,
    riskLevel: 48,
    confidence: 44,
  },
  keyDecision: "是否转向手动验证？",
  nextSuggestion: "先约 5 个目标用户访谈。",
};

test("AgentInteractionReplay renders empty markup for legacy stages", () => {
  assert.equal(renderToStaticMarkup(<AgentInteractionReplay stage={baseStage} />), "");
});

test("AgentInteractionReplay renders interaction summary, actions, and votes", () => {
  const markup = renderToStaticMarkup(
    <AgentInteractionReplay
      stage={{
        ...baseStage,
        interactions: {
          activatedAgentIds: ["arbiter_agent"],
          actions: [
            {
              id: "act_1",
              type: "challenge",
              actorAgentId: "arbiter_agent",
              targetAgentId: "optimist_agent",
              content: "你忽略了信任成本。",
              reason: "证据链不足。",
              impact: "negative",
            },
          ],
          votes: [
            {
              agentId: "arbiter_agent",
              verdict: "pivot",
              confidence: 81,
              stateDeltaVote: { confidence: -8 },
              rationale: "先手动验证。",
            },
          ],
          relationships: [],
          mergedVoteDelta: { confidence: -8 },
          finalDelta: { confidence: -8 },
          arbiterSummary: "裁判采纳质疑。",
        },
      }}
    />,
  );

  assert.match(markup, /aria-label="Agent 互动复盘"/);
  assert.match(markup, /裁判采纳质疑/);
  assert.match(markup, /你忽略了信任成本/);
  assert.match(markup, /CONF 81%/);
});

test("AgentInteractionReplay translates life choice vote deltas", () => {
  const markup = renderToStaticMarkup(
    <AgentInteractionReplay
      simulationType="life_choice"
      stage={{
        ...baseStage,
        interactions: {
          activatedAgentIds: ["cashflow_guardian"],
          actions: [],
          votes: [
            {
              agentId: "cashflow_guardian",
              verdict: "pivot",
              confidence: 76,
              stateDeltaVote: {
                productClarity: 3,
                executionEnergy: -2,
                riskLevel: 5,
                confidence: -4,
              },
              rationale: "现金流压力过高。",
            },
          ],
          relationships: [],
          mergedVoteDelta: { riskLevel: 5, confidence: -4 },
          finalDelta: { riskLevel: 5, confidence: -4 },
          arbiterSummary: "裁判采纳现金流守门人的质疑。",
        },
      }}
    />,
  );

  assert.match(markup, /决策明晰度 \+3/);
  assert.match(markup, /精神能量 -2/);
  assert.match(markup, /悔恨与断粮风险 \+5/);
  assert.match(markup, /信心指数 -4/);
  assert.doesNotMatch(markup, /productClarity|executionEnergy|riskLevel|confidence/);
});
