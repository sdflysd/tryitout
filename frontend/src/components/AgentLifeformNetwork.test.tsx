import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentLifeformNetwork from "./AgentLifeformNetwork.js";
import { getAgentSandboxScenario } from "./agent-sandbox-model.js";

test("lifeform network renders living agents and collaboration signals", () => {
  const scenario = getAgentSandboxScenario("side_hustle");
  const html = renderToStaticMarkup(
    <AgentLifeformNetwork
      scenario={scenario}
      activeAgentIds={["primary", "challenger", "risk"]}
      interactionMode="challenge"
      activeStageLabel="第 8-15 天"
      activeStageTitle="流量测试"
      progressPercent={48}
      variant="preview"
    />,
  );

  assert.match(html, /agent-lifeform-network/);
  assert.match(html, /interaction-mode-challenge/);
  assert.match(html, /agent-lifeform-node/);
  assert.match(html, /agent-collaboration-link/);
  assert.match(html, /agent-signal-packet/);
  assert.match(html, /agent-luminous-thread/);
  assert.match(html, /agent-bidirectional-signal/);
  assert.match(html, /data-active="true"/);
  assert.match(html, /agent-active-collaboration-rail/);
  assert.match(html, /agent-action-callout/);
  assert.doesNotMatch(html, /active-agent-arrow/);
  assert.doesNotMatch(html, /marker-end|markerEnd/);
  assert.match(html, /竞品 → 目标客户/);
  assert.match(html, /风险审计 → 执行教练/);
  assert.match(html, /每个 Agent 都是一个生命体/);
  assert.match(html, /协作信号/);
  assert.match(html, /质疑/);
  assert.match(html, /仲裁/);
  assert.match(html, /汇聚/);
  assert.match(html, /流量测试/);
  assert.match(html, /48%/);
});

test("lifeform network exposes a compact mobile constellation", () => {
  const scenario = getAgentSandboxScenario("dating");
  const html = renderToStaticMarkup(
    <AgentLifeformNetwork
      scenario={scenario}
      activeAgentIds={["primary"]}
      interactionMode="support"
      variant="live"
    />,
  );

  assert.match(html, /agent-lifeform-mobile-grid/);
  assert.match(html, /sm:hidden/);
  assert.match(html, /hidden sm:block/);
  assert.match(html, /TA/);
  assert.match(html, /沟通教练/);
});
