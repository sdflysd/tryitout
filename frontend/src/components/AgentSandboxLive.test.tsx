import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgentSandboxLive from "./AgentSandboxLive.js";

test("live sandbox renders backend progress and active phase", () => {
  const html = renderToStaticMarkup(
    <AgentSandboxLive
      simulationType="life_choice"
      progressEvent={{
        simulationId: "sim-1",
        step: "simulate_stage",
        status: "started",
        percent: 55,
        stageIndex: 3,
        message: "正在推演第 8-15 天：痛点爆发期...",
      }}
    />,
  );

  assert.match(html, /实时 AI 星图沙盘/);
  assert.match(html, /agent-starmap-live/);
  assert.match(html, /simulation-command-center/);
  assert.match(html, /agent-lifeform-network/);
  assert.match(html, /live-scan-plane/);
  assert.match(html, /signal-cascade/);
  assert.match(html, /推演引擎在线/);
  assert.match(html, /信号汇聚/);
  assert.match(html, /55%/);
  assert.match(html, /第 8-15 天/);
  assert.match(html, /选项 A/);
  assert.match(html, /痛点爆发期/);
});

test("live sandbox maps backend steps to visible collaboration modes", () => {
  const challengeHtml = renderToStaticMarkup(
    <AgentSandboxLive
      simulationType="side_hustle"
      progressEvent={{
        simulationId: "sim-challenge",
        step: "generate_agent_actions",
        status: "started",
        percent: 48,
        stageIndex: 3,
        message: "风险审计 Agent 正在质疑执行教练...",
      }}
    />,
  );

  assert.match(challengeHtml, /interaction-mode-challenge/);
  assert.match(challengeHtml, /data-active="true"/);
  assert.match(challengeHtml, /质疑交锋/);

  const arbitrateHtml = renderToStaticMarkup(
    <AgentSandboxLive
      simulationType="side_hustle"
      progressEvent={{
        simulationId: "sim-arbitrate",
        step: "arbitrate_stage",
        status: "started",
        percent: 82,
        stageIndex: 4,
        message: "裁判正在仲裁不同 Agent 的票据...",
      }}
    />,
  );

  assert.match(arbitrateHtml, /interaction-mode-arbitrate/);
  assert.match(arbitrateHtml, /仲裁校准/);

  const synthesizeHtml = renderToStaticMarkup(
    <AgentSandboxLive
      simulationType="side_hustle"
      progressEvent={{
        simulationId: "sim-synthesize",
        step: "generate_report",
        status: "started",
        percent: 96,
        message: "所有信号正在汇聚到报告核心...",
      }}
    />,
  );

  assert.match(synthesizeHtml, /interaction-mode-synthesize/);
  assert.match(synthesizeHtml, /信号汇聚/);
});

test("live sandbox has an establishing state before backend events arrive", () => {
  const html = renderToStaticMarkup(
    <AgentSandboxLive simulationType="side_hustle" progressEvent={null} />,
  );

  assert.match(html, /建立沙盘连接/);
  assert.match(html, /实时 AI 星图沙盘/);
  assert.match(html, /目标客户/);
});

test("live sandbox exposes progress and event updates to assistive tech", () => {
  const html = renderToStaticMarkup(
    <AgentSandboxLive
      simulationType="dating"
      progressEvent={{
        simulationId: "sim-a11y",
        step: "generate_agent_actions",
        status: "started",
        percent: 42,
        stageIndex: 2,
        message: "TA Agent 正在回应沟通策略...",
      }}
    />,
  );

  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="42"/);
  assert.match(html, /aria-label="实时 Agent 沙盘进度"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
});
