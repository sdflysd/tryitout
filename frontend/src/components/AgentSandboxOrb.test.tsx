import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentSandboxOrb from "./AgentSandboxOrb.js";
import { getAgentSandboxScenario } from "./agent-sandbox-model.js";

test("agent sandbox orb auto motion uses steady spin without pitch oscillation", async () => {
  const orbModule = await import("./AgentSandboxOrb.js") as typeof import("./AgentSandboxOrb.js") & {
    getOrbAutoMotionStep?: () => {
      spinY: number;
      pitchOscillationAmplitude: number;
    };
  };

  assert.equal(typeof orbModule.getOrbAutoMotionStep, "function");

  const motion = orbModule.getOrbAutoMotionStep();
  assert.ok(motion.spinY > 0);
  assert.equal(motion.pitchOscillationAmplitude, 0);
});

test("agent sandbox orb renders a draggable signal sphere for active agents", () => {
  const scenario = getAgentSandboxScenario("side_hustle");
  const html = renderToStaticMarkup(
    <AgentSandboxOrb
      scenario={scenario}
      activeAgentIds={[
        "side_hustle-target-customer",
        "side_hustle-execution-coach",
        "side_hustle-risk-audit",
      ]}
      activeStageLabel="第 8-15 天"
      activeStageTitle="流量测试"
      progressPercent={48}
      interactionMode="challenge"
    />,
  );

  assert.match(html, /agent-sandbox-orb/);
  assert.match(html, /data-draggable="true"/);
  assert.match(html, /data-renderer="three-webgl"/);
  assert.match(html, /data-point-count="144"/);
  assert.match(html, /data-orbit-azimuth="unbounded"/);
  assert.match(html, /data-orbit-polar="0-180"/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="可拖动旋转的 Agent 信号球"/);
  assert.match(html, /真实 3D/);
  assert.doesNotMatch(html, /360° 立体拖拽/);
  assert.match(html, /48%/);
  assert.match(html, /流量测试/);
  assert.match(html, /canvas/);
  assert.match(html, /agent-orb-webgl-canvas/);
});

test("agent sandbox orb can render English accessible copy", () => {
  const scenario = getAgentSandboxScenario("life_choice", "en-US");
  const html = renderToStaticMarkup(
    <AgentSandboxOrb
      scenario={scenario}
      activeAgentIds={["life_choice-option-a"]}
      activeStageLabel="Days 8-15"
      activeStageTitle="Pressure Simulation"
      progressPercent={64}
      interactionMode="support"
      language="en-US"
    />,
  );

  assert.match(html, /Draggable Agent signal sphere/);
  assert.doesNotMatch(html, /360° orbit drag/);
  assert.match(html, /Pressure Simulation/);
  assert.match(html, /true 3D/);
  assert.doesNotMatch(html, /拖动旋转/);
});
