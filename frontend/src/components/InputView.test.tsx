import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import InputView from "./InputView.js";
import type { UserInput } from "../types.js";

test("submit button label describes agent game simulation", async () => {
  const { START_SIMULATION_BUTTON_LABEL } = await import("./input-view-copy.js");

  assert.equal(START_SIMULATION_BUTTON_LABEL, "开始 30 天 Agent 博弈推演");
});

test("side hustle form exposes custom write-in entries for strategy and background", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
    />,
  );

  assert.match(html, /自定义变现方式/);
  assert.match(html, /自定义获客渠道/);
  assert.match(html, /自定义现实状态背景/);
});

test("dating form exposes custom write-in entry for target personality", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="dating"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
    />,
  );

  assert.match(html, /自定义性格侧写/);
});

test("template input can prefill a side hustle confirmation form without starting simulation", async () => {
  const inputViewModule = await import("./InputView.js") as typeof import("./InputView.js") & {
    deriveInitialInputState?: (input: UserInput) => {
      projectIdea: string;
      targetUser: string;
      selectedSkills: string[];
      dailyTime: string;
      budget: string;
      monetization: string;
      selectedChannels: string[];
      userStatus: string;
    };
  };

  assert.equal(typeof inputViewModule.deriveInitialInputState, "function");

  const templateInput: UserInput = {
    type: "side_hustle",
    projectIdea: "我想做一个 AI 简历优化小程序，帮应届生优化简历。",
    targetUser: "找工作或写不出好简历的应届毕业生、求职转行者",
    skills: ["AI工具使用", "文案撰写"],
    dailyTime: "2小时",
    budget: "500元以内",
    monetization: "单次收费 (如按次帮改简历、按次付费买资料)",
    acquisitionChannel: ["小红书 (视觉对比/图文种草)"],
    userStatus: "在校大学生 (每天下课有闲、缺乏实战经验)",
  };

  const state = inputViewModule.deriveInitialInputState(templateInput);
  assert.equal(state.projectIdea, templateInput.projectIdea);
  assert.equal(state.targetUser, templateInput.targetUser);
  assert.deepEqual(state.selectedSkills, templateInput.skills);
  assert.equal(state.dailyTime, templateInput.dailyTime);
  assert.equal(state.budget, templateInput.budget);
  assert.equal(state.monetization, templateInput.monetization);
  assert.deepEqual(state.selectedChannels, templateInput.acquisitionChannel);
  assert.equal(state.userStatus, templateInput.userStatus);
});

test("light confirmation form fields render entered text with readable dark color", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
    />,
  );

  assert.match(html, /id="input-project-idea"[^>]*text-gray-950/);
  assert.match(html, /id="input-project-idea"[^>]*placeholder:text-gray-400/);
  assert.match(html, /id="input-target-user"[^>]*text-gray-950/);
  assert.match(html, /id="input-target-user"[^>]*placeholder:text-gray-400/);
});

test("deep mode toggle explains unavailable server capability", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      deepAgentMode={true}
      runtimeCapabilities={{
        deepModeAvailable: false,
        defaultInteractionMode: "legacy",
        fallbackPolicy: "safe_stage_fallback",
        providerConfigured: false,
        reason: "Deep Agent mode is not enabled on this server.",
      }}
    />,
  );

  assert.match(html, /服务端未启用深度 Agent 模式/);
  assert.match(html, /disabled=""/);
});
