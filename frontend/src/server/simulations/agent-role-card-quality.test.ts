import assert from "node:assert/strict";
import test from "node:test";

import type { Agent } from "../../types.js";
import { normalizeAgentRoleCard } from "./agent-role-card.js";
import { assessAgentRoleCardQuality } from "./agent-role-card-quality.js";

test("role card quality rejects vague generated role cards", () => {
  const agent: Agent = {
    id: "vague_agent",
    name: "普通 Agent",
    role: "分析",
    stance: "观望",
    keyJudgment: "看看情况",
    roleCard: {
      category: "expert_arbiter",
      identity: "分析者",
      goal: "分析问题",
      triggerConditions: ["需要时"],
      decisionModel: "综合判断",
      forbiddenBehaviors: [],
    },
  };

  const result = assessAgentRoleCardQuality(agent, "life_choice");
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /goal|trigger|forbidden/i);
});

test("role card quality accepts specific repaired role cards", () => {
  const agent: Agent = {
    id: "customer_agent",
    name: "客户 Agent",
    role: "目标客户",
    stance: "质疑",
    keyJudgment: "没有案例我不会付费。",
    roleCard: {
      category: "stakeholder",
      identity: "价格敏感的求职用户",
      goal: "判断这项服务是否有真实案例和可信交付。",
      triggerConditions: ["缺少案例", "价格过高"],
      decisionModel: "先看证据和边界，再考虑是否试用。",
      forbiddenBehaviors: ["不要编造案例", "不要给出违法、操控或侵犯隐私的建议"],
    },
  };
  assert.equal(assessAgentRoleCardQuality(agent, "side_hustle").ok, true);
});

test("normalizeAgentRoleCard strengthens vague generated role card fields", () => {
  const normalized = normalizeAgentRoleCard(
    {
      id: "vague_agent",
      name: "普通 Agent",
      role: "分析",
      stance: "观望",
      keyJudgment: "看看情况",
      roleCard: {
        category: "expert_arbiter",
        identity: "分析者",
        goal: "分析问题",
        triggerConditions: ["需要时"],
        decisionModel: "综合判断",
        forbiddenBehaviors: [],
      },
    },
    "life_choice",
  );

  assert.ok(normalized.roleCard);
  assert.notEqual(normalized.roleCard.goal, "分析问题");
  assert.notDeepEqual(normalized.roleCard.triggerConditions, ["需要时"]);
  assert.notEqual(normalized.roleCard.decisionModel, "综合判断");
  assert.ok(normalized.roleCard.forbiddenBehaviors.some((item) => /违法|操控|隐私|编造/.test(item)));
});
