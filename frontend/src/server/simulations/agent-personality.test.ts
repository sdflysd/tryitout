import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAgentPersonalities,
  normalizeAgentPersonality,
} from "./agent-personality.js";
import type { Agent } from "../../types.js";

test("normalizeAgentPersonality fills missing kernel deterministically from stance and role", () => {
  const agent = makeAgent({
    id: "customer_agent",
    role: "目标客户",
    stance: "质疑",
  });

  const first = normalizeAgentPersonality(agent);
  const second = normalizeAgentPersonality(agent);

  assert.ok(first.personalityKernel);
  assert.deepEqual(first.personalityKernel, second.personalityKernel);
  assert.equal(first.personalityKernel.conflictStyle, "probing");
});

test("normalizeAgentPersonality clamps numeric personality fields", () => {
  const normalized = normalizeAgentPersonality(
    makeAgent({
      personalityKernel: {
        mbtiType: "ENTP",
        riskTolerance: 150,
        conflictStyle: "direct",
        evidencePreference: "data",
        emotionalSensitivity: -10,
        persuasionThreshold: 101,
        memoryBias: "risk_anchored",
      },
    }),
  );

  assert.equal(normalized.personalityKernel?.riskTolerance, 100);
  assert.equal(normalized.personalityKernel?.emotionalSensitivity, 0);
  assert.equal(normalized.personalityKernel?.persuasionThreshold, 100);
});

test("normalizeAgentPersonality preserves existing valid kernel", () => {
  const agent = makeAgent({
    personalityKernel: {
      mbtiType: "INFJ",
      riskTolerance: 42,
      conflictStyle: "diplomatic",
      evidencePreference: "emotion",
      emotionalSensitivity: 77,
      persuasionThreshold: 63,
      memoryBias: "trust_building",
    },
  });

  const normalized = normalizeAgentPersonality(agent);

  assert.deepEqual(normalized.personalityKernel, agent.personalityKernel);
});

test("normalizeAgentPersonalities does not mutate input agents", () => {
  const agents = [makeAgent({ id: "a" }), makeAgent({ id: "b", stance: "支持" })];
  const original = agents.map((agent) => ({ ...agent }));

  const normalized = normalizeAgentPersonalities(agents);

  assert.notEqual(normalized[0], agents[0]);
  assert.deepEqual(agents, original);
  assert.ok(normalized.every((agent) => agent.personalityKernel));
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
