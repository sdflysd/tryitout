import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SimulationProgress, {
  getProgressDisplayState,
  getSimulationProgressCopy,
} from "./SimulationProgress.js";
import type { SimulationProgressEvent } from "../types.js";

test("dating progress copy uses relationship language instead of side-hustle language", () => {
  const copy = getSimulationProgressCopy("dating");
  const serialized = JSON.stringify(copy);

  assert.match(serialized, /恋爱|情感|关系|TA/);
  assert.doesNotMatch(serialized, /副业|搞钱|创业|商业|获客|付费|变现|MVP/);
});

test("life-choice progress copy uses decision language instead of side-hustle language", () => {
  const copy = getSimulationProgressCopy("life_choice");
  const serialized = JSON.stringify(copy);

  assert.match(serialized, /人生|抉择|机会成本|选择/);
  assert.doesNotMatch(serialized, /副业|搞钱|创业|商业|获客|付费|变现|MVP/);
});

test("progress display state follows backend event percent and label", () => {
  const event: SimulationProgressEvent = {
    simulationId: "sim-progress",
    step: "simulate_stage",
    stageIndex: 3,
    status: "started",
    percent: 50,
    message: "正在推演第 8-15 天：核心矛盾逼近...",
  };

  assert.deepEqual(getProgressDisplayState(event), {
    percent: 50,
    logs: ["正在推演第 8-15 天：核心矛盾逼近..."],
    activeMessage: "正在推演第 8-15 天：核心矛盾逼近...",
  });
});

test("SimulationProgress renders backend progress instead of timer-only percent", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="dating"
      progressEvent={{
        simulationId: "sim-progress",
        step: "simulate_stage",
        stageIndex: 4,
        status: "completed",
        percent: 75,
        message: "第 16-23 天推演完成，正在进入结果收束...",
      }}
    />,
  );

  assert.match(html, /75%/);
  assert.match(html, /第 16-23 天推演完成/);
  assert.doesNotMatch(html, /99%/);
});

test("SimulationProgress renders the live agent sandbox", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="dating"
      progressEvent={{
        simulationId: "sim-progress",
        step: "generate_agent_actions",
        stageIndex: 2,
        status: "started",
        percent: 42,
        message: "TA Agent 正在回应沟通策略...",
      }}
    />,
  );

  assert.match(html, /实时 AI 星图沙盘/);
  assert.match(html, /simulation-command-center/);
  assert.match(html, /agent-lifeform-network/);
  assert.match(html, /interaction-mode-challenge/);
  assert.match(html, /live-scan-plane/);
  assert.match(html, /42%/);
  assert.match(html, /TA Agent 正在回应沟通策略/);
  assert.match(html, /沟通教练/);
});
