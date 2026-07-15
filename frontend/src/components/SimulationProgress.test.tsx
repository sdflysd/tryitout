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
  assert.doesNotMatch(copy.subHeading, /10 to 30 seconds/i);
  assert.match(serialized, /target customer|competitor|cash flow/i);
  assert.doesNotMatch(serialized, /兄弟|副业|获客/);
});

test("life-choice progress copy uses decision language instead of side-hustle language", () => {
  const copy = getSimulationProgressCopy("life_choice");
  const serialized = JSON.stringify(copy);

  assert.match(serialized, /人生|抉择|机会成本|选择/);
  assert.doesNotMatch(copy.subHeading, /10 至 30 秒/);
  assert.doesNotMatch(serialized, /副业|搞钱|创业|商业|获客|付费|变现|MVP/);
});

test("SimulationProgress shows elapsed runtime below the progress bar", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="dating"
      elapsedMs={65_000}
      progressEvent={{
        simulationId: "sim-progress",
        step: "simulate_stage",
        stageIndex: 4,
        status: "started",
        percent: 75,
        message: "正在推演第 16-23 天...",
      }}
    />,
  );

  assert.match(html, /已运行/);
  assert.match(html, /01:05/);
});

test("SimulationProgress labels queued elapsed time as waiting time", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="life_choice"
      elapsedMs={8 * 60 * 1000}
      progressEvent={{
        simulationId: "commercial_task_waiting",
        step: "generate_agents",
        status: "queued",
        percent: 5,
        message: "任务已进入商业队列，等待 worker 处理。",
      }}
    />,
  );

  assert.match(html, /已等待/);
  assert.match(html, /08:00/);
  assert.doesNotMatch(html, /已运行 08:00/);
});

test("SimulationProgress hides task cancellation until a real active task can be cancelled", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="life_choice"
      onCancel={() => undefined}
      progressEvent={{
        simulationId: "commercial_task_waiting",
        step: "generate_agents",
        status: "queued",
        percent: 5,
        message: "任务已进入商业队列，等待 worker 处理。",
      }}
    />,
  );

  assert.doesNotMatch(html, /btn-cancel-simulation/);
  assert.doesNotMatch(html, /取消任务/);
});

test("SimulationProgress exposes a cancel action while a task is active", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="life_choice"
      canCancelTask
      onCancel={() => undefined}
      progressEvent={{
        simulationId: "commercial_task_waiting",
        step: "generate_agents",
        status: "queued",
        percent: 5,
        message: "任务已进入商业队列，等待 worker 处理。",
      }}
    />,
  );

  assert.match(html, /btn-cancel-simulation/);
  assert.match(html, /取消任务/);
});

test("SimulationProgress exposes a retry action while a queued task is waiting", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating
      simulationType="side_hustle"
      canResume
      canCancelTask
      onRetry={() => undefined}
      onCancel={() => undefined}
      progressEvent={{
        simulationId: "commercial_task_waiting",
        step: "generate_agents",
        status: "queued",
        percent: 5,
        message: "任务已进入商业队列，等待 worker 处理。",
      }}
    />,
  );

  assert.match(html, /btn-retry-active-task/);
  assert.match(html, /重新尝试/);
  assert.match(html, /取消任务/);
});

test("SimulationProgress labels the recoverable error secondary action as task cancellation", () => {
  const html = renderToStaticMarkup(
    <SimulationProgress
      isGenerating={false}
      simulationType="life_choice"
      errorMsg="provider_timeout"
      canResume
      onRetry={() => undefined}
      onCancel={() => undefined}
    />,
  );

  assert.match(html, /继续模拟/);
  assert.match(html, /取消任务/);
  assert.doesNotMatch(html, /修改输入配置/);
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

test("progress display state labels queued commercial tasks as waiting", () => {
  const event: SimulationProgressEvent = {
    simulationId: "commercial_task_active",
    step: "generate_agents",
    status: "queued",
    percent: 5,
    message: "任务已进入商业队列，等待 worker 处理。",
  };

  assert.deepEqual(getProgressDisplayState(event), {
    percent: 5,
    logs: ["任务已进入商业队列，等待 worker 处理。"],
    activeMessage: "任务已进入商业队列，等待 worker 处理。",
  });
});

test("progress display state explains backend steps with concrete user-facing actions", () => {
  const event: SimulationProgressEvent = {
    simulationId: "commercial_task_running",
    step: "generate_agents",
    status: "started",
    percent: 20,
    message: "全局步骤 generate_agents 运行中。",
  };

  const state = getProgressDisplayState(event, "zh-CN", "side_hustle");

  assert.equal(state.percent, 20);
  assert.match(state.activeMessage, /正在组建核心商业智能体群/);
  assert.match(state.logs.join("\n"), /目标客户 Agent 正在入场/);
  assert.doesNotMatch(state.logs.join("\n"), /generate_agents/);
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
