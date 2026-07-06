import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgentSandboxScenario,
  getLiveSandboxPhase,
} from "./agent-sandbox-model.js";

const EXPECTED_STAGE_LABELS = ["第 1-3 天", "第 4-7 天", "第 8-15 天", "第 16-23 天", "第 24-30 天"];
const EXPECTED_EN_STAGE_LABELS = ["Days 1-3", "Days 4-7", "Days 8-15", "Days 16-23", "Days 24-30"];

test("side hustle sandbox exposes seven business agents and amber accent", () => {
  const scenario = getAgentSandboxScenario("side_hustle");

  assert.equal(scenario.accentName, "amber");
  assert.equal(scenario.agents.length, 7);
  assert.deepEqual(
    scenario.agents.map((agent) => agent.label),
    ["目标客户", "竞品", "平台流量", "执行教练", "现金流", "风险审计", "裁判"],
  );
});

test("side hustle sandbox can render English scenario labels", () => {
  const scenario = getAgentSandboxScenario("side_hustle", "en-US");

  assert.equal(scenario.title, "Side Hustle Sandbox");
  assert.deepEqual(
    scenario.agents.map((agent) => agent.label),
    ["Target Customer", "Competitor", "Platform Traffic", "Execution Coach", "Cash Flow", "Risk Audit", "Arbiter"],
  );
  assert.deepEqual(
    scenario.stages.map((stage) => stage.label),
    EXPECTED_EN_STAGE_LABELS,
  );
});

test("dating sandbox exposes relationship agents and rose accent", () => {
  const scenario = getAgentSandboxScenario("dating");

  assert.equal(scenario.accentName, "rose");
  assert.match(JSON.stringify(scenario), /TA|沟通教练|边界/);
  assert.doesNotMatch(JSON.stringify(scenario), /竞品|平台流量|现金流/);
});

test("life choice sandbox exposes decision agents and indigo accent", () => {
  const scenario = getAgentSandboxScenario("life_choice");

  assert.equal(scenario.accentName, "indigo");
  assert.match(JSON.stringify(scenario), /选项 A|选项 B|未来自己/);
  assert.doesNotMatch(JSON.stringify(scenario), /TA|竞品/);
});

test("each sandbox scenario exposes five exact timeline stage labels", () => {
  for (const type of ["side_hustle", "dating", "life_choice"] as const) {
    const scenario = getAgentSandboxScenario(type);

    assert.equal(scenario.stages.length, 5);
    assert.deepEqual(
      scenario.stages.map((stage) => stage.label),
      EXPECTED_STAGE_LABELS,
    );
  }
});

test("sandbox scenario results are isolated from accidental nested mutations", () => {
  const scenario = getAgentSandboxScenario("side_hustle") as any;

  scenario.agents.pop();
  scenario.agents[0].label = "mutated";
  scenario.collaborationLinks.pop();
  scenario.collaborationLinks[0].label = "mutated";

  const nextScenario = getAgentSandboxScenario("side_hustle");

  assert.equal(nextScenario.agents.length, 7);
  assert.equal(nextScenario.agents[0].label, "目标客户");
  assert.ok(nextScenario.collaborationLinks.length >= 6);
  assert.notEqual(nextScenario.collaborationLinks[0].label, "mutated");
});

test("live sandbox phase maps backend steps into visual phases", () => {
  assert.equal(getLiveSandboxPhase({ step: "generate_agents", percent: 10 }).label, "智能体入场");
  assert.equal(getLiveSandboxPhase({ step: "simulate_stage", percent: 55, stageIndex: 3 }).activeStageIndex, 2);
  assert.equal(getLiveSandboxPhase({ step: "generate_report", percent: 96 }).label, "报告合成");
  assert.equal(getLiveSandboxPhase({ step: "generate_report", percent: 96, language: "en-US" }).label, "Report Synthesis");
});

test("sandbox scenarios expose explicit agent collaboration links", () => {
  for (const type of ["side_hustle", "dating", "life_choice"] as const) {
    const scenario = getAgentSandboxScenario(type);
    const agentIds = new Set(scenario.agents.map((agent) => agent.id));
    const modes = new Set(scenario.collaborationLinks.map((link) => link.mode));

    assert.ok(scenario.collaborationLinks.length >= 6);
    assert.ok(modes.has("support"));
    assert.ok(modes.has("challenge"));
    assert.ok(modes.has("arbitrate"));
    assert.ok(modes.has("synthesize"));

    for (const link of scenario.collaborationLinks) {
      assert.ok(agentIds.has(link.sourceAgentId), `unknown source ${link.sourceAgentId}`);
      assert.ok(agentIds.has(link.targetAgentId), `unknown target ${link.targetAgentId}`);
      assert.ok(link.label.length > 0);
    }
  }
});

test("live sandbox phase exposes interaction modes and active agent ids", () => {
  const actionPhase = getLiveSandboxPhase({ step: "generate_agent_actions", percent: 42, stageIndex: 2 });
  assert.equal(actionPhase.interactionMode, "challenge");
  assert.ok(actionPhase.activeAgentIds.length >= 2);

  const arbitrationPhase = getLiveSandboxPhase({ step: "arbitrate_stage", percent: 82, stageIndex: 4 });
  assert.equal(arbitrationPhase.interactionMode, "arbitrate");
  assert.ok(arbitrationPhase.activeAgentIds.includes("arbiter"));

  const reportPhase = getLiveSandboxPhase({ step: "generate_report", percent: 96 });
  assert.equal(reportPhase.interactionMode, "synthesize");
  assert.ok(reportPhase.activeAgentIds.includes("arbiter"));
});

test("live sandbox phase resolves active ids to real scenario agents", () => {
  const scenario = getAgentSandboxScenario("life_choice");
  const phase = getLiveSandboxPhase({
    scenario,
    step: "generate_agent_actions",
    percent: 42,
    stageIndex: 2,
  });
  const agentIds = new Set(scenario.agents.map((agent) => agent.id));

  assert.ok(phase.activeAgentIds.length >= 3);
  assert.ok(phase.activeAgentIds.every((agentId) => agentIds.has(agentId)));

  const arbitrationPhase = getLiveSandboxPhase({
    scenario,
    step: "arbitrate_stage",
    percent: 68,
    stageIndex: 2,
  });
  assert.ok(arbitrationPhase.activeAgentIds.includes("life_choice-arbiter"));
});
