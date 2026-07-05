import assert from "node:assert/strict";
import test from "node:test";
import type {
  Agent,
  AgentAction,
  AgentLayer,
  AgentMemory,
  AgentPersonalityKernel,
  AgentRelationship,
  AgentVote,
  MbtiType,
  SimulationStage,
  WorldStateDelta,
} from "../../types.js";

test("agent interaction types support personality, actions, memory, and votes", () => {
  const mbtiType: MbtiType = "INTJ";
  const layer: AgentLayer = "core";

  const personality: AgentPersonalityKernel = {
    mbtiType,
    riskTolerance: 35,
    conflictStyle: "direct",
    evidencePreference: "data",
    emotionalSensitivity: 20,
    persuasionThreshold: 72,
    memoryBias: "risk_anchored",
  };

  const memory: AgentMemory = {
    trustByAgentId: { customer_agent: 42 },
    claimsRemembered: ["客户质疑信任不足"],
    lastPosition: "pivot",
  };

  const agent: Agent = {
    id: "commercial_arbiter_agent",
    name: "商业裁判 Agent",
    role: "裁判",
    layer,
    stance: "观望",
    personalityKernel: personality,
    memory,
    keyJudgment: "先验证信任，再谈规模化。",
  };

  const action: AgentAction = {
    id: "act_1",
    type: "challenge",
    actorAgentId: agent.id,
    targetAgentId: "optimist_agent",
    content: "你忽略了陌生用户为什么信任这个方案。",
    reason: "当前证据不足以支持高胜率。",
    impact: "negative",
  };

  const vote: AgentVote = {
    agentId: agent.id,
    verdict: "pivot",
    confidence: 81,
    stateDeltaVote: {
      confidence: -8,
      riskLevel: 10,
    },
    rationale: "信任链路还没闭合。",
  };

  const relationship: AgentRelationship = {
    fromAgentId: agent.id,
    toAgentId: "optimist_agent",
    trust: 30,
    alignment: -25,
  };

  const delta: WorldStateDelta = {
    confidence: -6,
    riskLevel: 8,
  };

  const stage = {
    stageIndex: 1,
    timeRange: "第 1-3 天",
    title: "信任冲突",
    summary: "客户 Agent 与乐观 Agent 发生冲突。",
    events: [],
    agentReactions: [],
    interactions: {
      activatedAgentIds: [agent.id],
      actions: [action],
      votes: [vote],
      relationships: [relationship],
      mergedVoteDelta: delta,
      finalDelta: delta,
      arbiterSummary: "裁判采纳客户 Agent 的质疑。",
    },
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
  } satisfies SimulationStage;

  assert.equal(stage.interactions.actions[0].type, "challenge");
});
