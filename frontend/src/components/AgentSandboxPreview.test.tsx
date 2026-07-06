import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentSandboxPreview from "./AgentSandboxPreview.js";

test("preview sandbox renders an AI starmap for side hustle", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="side_hustle" />);

  assert.match(html, /AI 星图沙盘/);
  assert.match(html, /agent-starmap-preview/);
  assert.match(html, /agent-starmap-orbit/);
  assert.match(html, /agent-starmap-spectral-core/);
  assert.match(html, /agent-lifeform-network/);
  assert.match(html, /agent-lifeform-node/);
  assert.match(html, /agent-signal-packet/);
  assert.match(html, /每个 Agent 都是一个生命体/);
  assert.match(html, /协作信号/);
  assert.match(html, /decision-horizon/);
  assert.match(html, /viral-signature/);
  assert.match(html, /未来后果可视化/);
  assert.match(html, /7 个智能体/);
  assert.match(html, /世界线/);
  assert.match(html, /bg-\[#050711\]/);
  assert.match(html, /目标客户/);
  assert.match(html, /竞品/);
  assert.match(html, /第 8-15 天/);
  assert.match(html, /风险/);
});

test("preview sandbox changes copy for dating mode", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="dating" />);

  assert.match(html, /TA/);
  assert.match(html, /沟通教练/);
  assert.doesNotMatch(html, /目标客户/);
});

test("preview sandbox can render English UI text", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="side_hustle" language="en-US" />);

  assert.match(html, /AI Starmap Sandbox/);
  assert.match(html, /Future outcomes/);
  assert.match(html, /Target Customer/);
  assert.match(html, /Days 8-15/);
  assert.doesNotMatch(html, /未来后果可视化/);
});

test("preview sandbox includes a non-absolute mobile starmap layout", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="side_hustle" />);

  assert.match(html, /agent-starmap-mobile-agents/);
  assert.match(html, /sm:hidden/);
  assert.match(html, /hidden sm:block/);
});

test("preview sandbox keeps desktop orbit agents out of the center lane", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="side_hustle" />);

  assert.doesNotMatch(html, /absolute z-20[^"]*top-1\/2[^"]*translate-y-20/);
});
