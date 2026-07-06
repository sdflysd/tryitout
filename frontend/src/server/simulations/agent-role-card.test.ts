import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAgentRoleCard,
  normalizeAgentRoleCards,
} from "./agent-role-card.js";
import type { Agent } from "../../types.js";

test("normalizeAgentRoleCard fills a complete v2 role card from a lightweight agent", () => {
  const normalized = normalizeAgentRoleCard(
    {
      id: "customer_agent",
      name: "客户 Agent",
      role: "目标客户",
      stance: "质疑",
      keyJudgment: "没有真实案例我不会付费。",
      objection: "信任证据不足。",
    },
    "side_hustle",
  );

  assert.ok(normalized.roleCard);
  assert.equal(normalized.roleCard.category, "stakeholder");
  assert.match(normalized.roleCard.goal, /目标客户|客户/);
  assert.ok(normalized.roleCard.triggerConditions.length > 0);
  assert.ok(normalized.roleCard.forbiddenBehaviors.some((item) => /编造|违法|操控/.test(item)));
  assert.match(normalized.roleCard.memoryPolicy, /短期/);
});

test("normalizeAgentRoleCard preserves existing role card fields and fills missing ones", () => {
  const normalized = normalizeAgentRoleCard(
    makeAgent({
      roleCard: {
        category: "expert_arbiter",
        identity: "风险审计员",
        goal: "只负责识别最坏情况。",
        fears: ["用户过度自信"],
      },
    }),
    "life_choice",
  );

  assert.equal(normalized.roleCard?.identity, "风险审计员");
  assert.equal(normalized.roleCard?.goal, "只负责识别最坏情况。");
  assert.ok(normalized.roleCard?.knownInfo.length);
  assert.ok(normalized.roleCard?.unknownInfo.length);
  assert.ok(normalized.roleCard?.capabilities.length);
});

test("normalizeAgentRoleCards does not mutate input agents", () => {
  const agents = [makeAgent({ id: "agent_a" }), makeAgent({ id: "agent_b" })];
  const snapshot = JSON.stringify(agents);

  const normalized = normalizeAgentRoleCards(agents, "dating");

  assert.equal(JSON.stringify(agents), snapshot);
  assert.ok(normalized.every((agent) => agent.roleCard));
  assert.notEqual(normalized[0], agents[0]);
});

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent_1",
    name: "测试 Agent",
    role: "观察者",
    stance: "观望",
    keyJudgment: "保持观察",
    ...overrides,
  };
}
