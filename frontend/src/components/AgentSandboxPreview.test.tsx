import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentSandboxPreview from "./AgentSandboxPreview.js";

test("preview sandbox renders an AI starmap for side hustle", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="side_hustle" />);

  assert.match(html, /AI 星图沙盘/);
  assert.match(html, /agent-starmap-preview-dashboard/);
  assert.match(html, /agent-sandbox-orb/);
  assert.match(html, /data-renderer="three-webgl"/);
  assert.match(html, /data-draggable="true"/);
  assert.match(html, /agent-preview-orb-stage-rail/);
  assert.match(html, /agent-preview-signal-rail/);
  assert.match(html, /viral-signature/);
  assert.match(html, /未来后果可视化/);
  assert.match(html, /多位智能体正在协作推演/);
  assert.doesNotMatch(html, /7 个智能体/);
  assert.match(html, /bg-\[#050711\]/);
  assert.match(html, /目标客户/);
  assert.match(html, /竞品/);
  assert.match(html, /第 8-15 天/);
  assert.match(html, /风险/);
  assert.doesNotMatch(html, /agent-lifeform-network/);
  assert.doesNotMatch(html, /agent-lifeform-node/);
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
  assert.match(html, /true 3D/);
  assert.doesNotMatch(html, /360° orbit drag/);
  assert.doesNotMatch(html, /未来后果可视化/);
});

test("preview sandbox uses a compact dashboard instead of duplicate large networks", () => {
  const html = renderToStaticMarkup(<AgentSandboxPreview simulationType="side_hustle" />);

  assert.match(html, /agent-preview-orb-stage-rail/);
  assert.match(html, /agent-preview-signal-rail/);
  assert.doesNotMatch(html, /agent-starmap-mobile-agents/);
  assert.doesNotMatch(html, /absolute z-20[^"]*top-1\/2[^"]*translate-y-20/);
});
