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

test("progress copy can render English UI text", () => {
  const copy = getSimulationProgressCopy("side_hustle", "en-US");
  const serialized = JSON.stringify(copy);

  assert.match(copy.heading, /business/i);
  assert.match(copy.subHeading, /30 days/i);
  assert.match(serialized, /target customer|competitor|cash flow/i);
  assert.doesNotMatch(serialized, /兄弟|副业|获客/);
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

test("progress display state has an English establishing state", () => {
  assert.deepEqual(getProgressDisplayState(null, "en-US"), {
    percent: 0,
    logs: ["Waiting for backend progress events and opening the sandbox connection..."],
    activeMessage: "Waiting for backend progress events...",
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

test("SimulationProgress renders English error recovery copy", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating={false}
      simulationType="side_hustle"
      errorMsg="model timeout"
      onRetry={() => undefined}
      onCancel={() => undefined}
      language="en-US"
    />,
  );

  assert.match(html, /Sandbox simulation failed/);
  assert.match(html, /The model run did not complete/);
  assert.match(html, /Restart simulation/);
  assert.match(html, /Edit input/);
  assert.doesNotMatch(html, /沙盘模拟计算失败|重新开始模拟|修改输入配置/);
});

test("SimulationProgress labels recoverable failures as resumable", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating={false}
      simulationType="life_choice"
      errorMsg="model_timeout"
      canResume
      onRetry={() => undefined}
      onCancel={() => undefined}
    />,
  );

  assert.match(html, /继续模拟/);
  assert.doesNotMatch(html, /重新开始模拟/);
});
