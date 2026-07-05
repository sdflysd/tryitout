import assert from "node:assert/strict";
import test from "node:test";

import { updateAgentMemories } from "./agent-memory.js";
import type { Agent, AgentAction, AgentRelationship, AgentVote } from "../../types.js";

test("updateAgentMemories updates lastPosition from votes", () => {
  const [agent] = updateAgentMemories({
    agents: [makeAgent("agent_1")],
    actions: [],
    votes: [makeVote("agent_1", "pivot")],
    relationships: [],
  });

  assert.equal(agent.memory?.lastPosition, "pivot");
});

test("updateAgentMemories adds bounded action claims", () => {
  const actions = Array.from({ length: 7 }, (_, index) =>
    makeAction(`action_${index}`, "agent_1", undefined, `第 ${index} 个重要观点，需要被后续记住。`),
  );

  const [agent] = updateAgentMemories({
    agents: [makeAgent("agent_1")],
    actions,
    votes: [],
    relationships: [],
  });

  assert.equal(agent.memory?.claimsRemembered.length, 5);
  assert.match(agent.memory?.claimsRemembered[4] ?? "", /第 6 个重要观点/);
});

test("updateAgentMemories updates trust for targeted support and challenge", () => {
  const [agent] = updateAgentMemories({
    agents: [makeAgent("agent_1")],
    actions: [
      makeAction("support_1", "agent_1", "agent_2", "我支持你的低压路线。", "support"),
      makeAction("challenge_1", "agent_1", "agent_3", "我质疑这个高压选择。", "challenge"),
    ],
    votes: [],
    relationships: [],
  });

  assert.equal(agent.memory?.trustByAgentId.agent_2, 56);
  assert.equal(agent.memory?.trustByAgentId.agent_3, 44);
});

test("updateAgentMemories folds relationship trust and does not mutate inputs", () => {
  const agents = [
    makeAgent("agent_1", {
      trustByAgentId: { agent_2: 20 },
      claimsRemembered: ["旧观点"],
    }),
  ];
  const original = JSON.stringify(agents);
  const relationships: AgentRelationship[] = [
    { fromAgentId: "agent_1", toAgentId: "agent_2", trust: 67, alignment: 10 },
  ];

  const updated = updateAgentMemories({
    agents,
    actions: [],
    votes: [],
    relationships,
  });

  assert.equal(updated[0].memory?.trustByAgentId.agent_2, 67);
  assert.equal(JSON.stringify(agents), original);
  assert.notEqual(updated[0], agents[0]);
});

function makeAgent(id: string, memory?: Agent["memory"]): Agent {
  return {
    id,
    name: id,
    role: "观察者",
    stance: "观望",
    keyJudgment: "观察",
    memory,
  };
}

function makeVote(agentId: string, verdict: AgentVote["verdict"]): AgentVote {
  return {
    agentId,
    verdict,
    confidence: 70,
    stateDeltaVote: {},
    rationale: "阶段判断",
  };
}

function makeAction(
  id: string,
  actorAgentId: string,
  targetAgentId: string | undefined,
  content: string,
  type: AgentAction["type"] = "reply",
): AgentAction {
  return {
    id,
    type,
    actorAgentId,
    targetAgentId,
    content,
    reason: "测试",
    impact: "neutral",
  };
}
