import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentCompositionPrompt,
  enforceAgentComposition,
  getAgentCompositionSpec,
} from "./agent-composition.js";
import type { Agent } from "../../types.js";

test("side hustle agent composition has seven required slots", () => {
  const spec = getAgentCompositionSpec("side_hustle");
  assert.equal(spec.slots.length, 7);
  assert.deepEqual(
    spec.slots.map((slot) => slot.category),
    [
      "user_inner_system",
      "stakeholder",
      "stakeholder",
      "opposition_competition",
      "environment_system",
      "expert_arbiter",
      "counterfactual_system",
    ],
  );
});

test("composition prompt names all required role card categories", () => {
  const prompt = buildAgentCompositionPrompt("dating");
  assert.match(prompt, /必须严格生成以下 7 个 Agent 槽位/);
  assert.match(prompt, /user_inner_system/);
  assert.match(prompt, /counterfactual_system/);
});

test("enforceAgentComposition repairs duplicate categories in generated agents", () => {
  const agents = Array.from({ length: 7 }, (_, index): Agent => ({
    id: `agent_${index + 1}`,
    name: `Agent ${index + 1}`,
    role: "观察员",
    stance: index % 2 === 0 ? "支持" : "质疑",
    keyJudgment: "观察",
    roleCard: { category: "environment_system" },
  }));

  const repaired = enforceAgentComposition(agents, "side_hustle");
  assert.deepEqual(
    repaired.map((agent) => agent.roleCard?.category),
    [
      "user_inner_system",
      "stakeholder",
      "stakeholder",
      "opposition_competition",
      "environment_system",
      "expert_arbiter",
      "counterfactual_system",
    ],
  );
});

test("enforceAgentComposition does not mutate input", () => {
  const agents = makeCompositionAgents();
  const snapshot = JSON.stringify(agents);
  enforceAgentComposition(agents, "dating");
  assert.equal(JSON.stringify(agents), snapshot);
});

function makeCompositionAgents(): Agent[] {
  return Array.from({ length: 7 }, (_, index): Agent => ({
    id: `agent_${index + 1}`,
    name: `Agent ${index + 1}`,
    role: "观察员",
    stance: "观望",
    keyJudgment: "观察",
  }));
}
