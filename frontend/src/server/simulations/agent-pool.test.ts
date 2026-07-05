import assert from "node:assert/strict";
import test from "node:test";
import type { Agent, SimulationType } from "../../types.js";
import { splitAgentPool } from "./agent-pool.js";

function makeAgents(): Agent[] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `agent_${index + 1}`,
    name: `Agent ${index + 1}`,
    role: "核心角色",
    stance: index % 2 === 0 ? "支持" : "质疑",
    keyJudgment: "判断",
  }));
}

test("splitAgentPool preserves core agents and creates peripheral placeholders when needed", () => {
  const agents = makeAgents();

  const pool = splitAgentPool(agents, "side_hustle");

  assert.equal(pool.coreAgents.length, 7);
  assert.equal(pool.peripheralAgents.length >= 8, true);
  assert.equal(pool.coreAgents.every((agent) => agent.layer === "core"), true);
  assert.equal(pool.peripheralAgents.every((agent) => agent.layer === "peripheral"), true);
});

test("splitAgentPool does not mutate original input agents", () => {
  const agents = makeAgents();

  splitAgentPool(agents, "side_hustle");

  assert.equal(agents.every((agent) => agent.layer === undefined), true);
});

test("splitAgentPool creates peripheral agents for every simulation type", () => {
  const types: SimulationType[] = ["side_hustle", "dating", "life_choice"];

  for (const type of types) {
    const pool = splitAgentPool(makeAgents(), type);

    assert.equal(pool.peripheralAgents.length >= 8, true);
  }
});
