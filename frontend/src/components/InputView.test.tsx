import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import InputView from "./InputView.js";
import type { UserInput } from "../types.js";

test("submit button label describes agent game simulation", async () => {
  const {
    START_SIMULATION_BUTTON_LABEL,
    getStartSimulationButtonLabel,
  } = await import("./input-view-copy.js");

  assert.equal(START_SIMULATION_BUTTON_LABEL, "开始 30 天 Agent 博弈推演");
  assert.equal(getStartSimulationButtonLabel("en-US"), "Start 30-Day Agent Simulation");
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

test("input view can render English entry controls", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
    />,
  );

  assert.match(html, /Back home/);
  assert.match(html, /TryItOut Side-Hustle Sandbox/);
  assert.match(html, /Side Hustle/);
  assert.match(html, /Your project idea/);
  assert.match(html, /What side-hustle idea do you want to test/);
  assert.match(html, /Current length: 0/);
  assert.match(html, /Your existing resources/);
  assert.match(html, /Your operations and monetization strategy/);
  assert.match(html, /Custom acquisition channel/);
  assert.match(html, /Your real-world background/);
  assert.match(html, /Start 30-Day Agent Simulation/);
  assert.match(html, /Privacy note/);
});

test("dating input view can render English form shell", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="dating"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
    />,
  );

  assert.match(html, /Dating Communication Sandbox/);
  assert.match(html, /Relationship background and core conflict/);
  assert.match(html, /Current status or trigger/);
  assert.match(html, /Your planned reply or action/);
  assert.match(html, /Relationship status and duration/);
  assert.match(html, /TA personality profile/);
  assert.match(html, /Other\/custom personality profile/);
});

test("life choice input view can render English form shell", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="life_choice"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
    />,
  );

  assert.match(html, /Life Choice Regret Calculator/);
  assert.match(html, /Write the dilemma as-is/);
  assert.match(html, /What are you torn about/);
  assert.match(html, /Organize options/);
  assert.match(html, /Agent will identify 2-4 possible options/);
  assert.match(html, /Reality buffer and support base/);
  assert.match(html, /What is your current income and safety buffer/);
});

test("input view can render English loading label", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating
      language="en-US"
    />,
  );

  assert.match(html, /Loading and evolving the sandbox/);
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

test("commercial mode keeps start clickable without showing a preemptive credit warning", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
      commercialMode
      requiredCredits={3}
      availableCredits={1}
    />,
  );

  assert.doesNotMatch(html, /Commercial credits/);
  assert.doesNotMatch(html, /Cost: 3 credits/);
  assert.doesNotMatch(html, /Available: 1/);
  assert.doesNotMatch(html, /Insufficient credits/);
  assert.doesNotMatch(html, /commercial-action-notice/);
  assert.doesNotMatch(html, /btn-trigger-simulation[^>]*disabled=""/);
  assert.doesNotMatch(html, /cursor-not-allowed/);
});

test("commercial mode can show a login modal with localized links", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
      commercialMode
      requiredCredits={3}
      availableCredits={0}
      commercialActionNotice={{
        tone: "login",
        title: "Sign in required",
        message: "Sign in or create an account before starting a simulation.",
        primaryHref: "/login",
        primaryLabel: "Sign in",
        secondaryHref: "/register",
        secondaryLabel: "Create account",
      }}
    />,
  );

  assert.match(html, /commercial-action-modal/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /Sign in required/);
  assert.match(html, /Sign in or create an account/);
  assert.doesNotMatch(html, /commercial account/);
  assert.match(html, /href="\/login"/);
  assert.match(html, />Sign in</);
  assert.match(html, /href="\/register"/);
  assert.match(html, />Create account</);
  assert.match(html, /btn-close-commercial-action-modal/);
  assert.doesNotMatch(html, /commercial-action-notice/);
});

test("commercial mode can show a credit modal with account navigation", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="zh-CN"
      commercialMode
      requiredCredits={3}
      availableCredits={1}
      commercialActionNotice={{
        tone: "credits",
        title: "额度不足",
        message: "当前可用额度不足。请先兑换访问码或联系运营充值后再启动推演。",
        primaryHref: "/account",
        primaryLabel: "去账号页兑换",
      }}
    />,
  );

  assert.match(html, /commercial-action-modal/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /额度不足/);
  assert.match(html, /当前可用额度不足/);
  assert.match(html, /href="\/account"/);
  assert.match(html, />去账号页兑换</);
  assert.doesNotMatch(html, /commercial-action-notice/);
});

test("commercial mode keeps model source configuration out of the input form", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
      commercialMode
      requiredCredits={2}
      availableCredits={6}
      providerMode="byok"
      byokAvailable
      onProviderModeChange={() => undefined}
    />,
  );

  assert.doesNotMatch(html, /Commercial credits/);
  assert.doesNotMatch(html, /Cost: 2 credits/);
  assert.doesNotMatch(html, /Model source/);
  assert.doesNotMatch(html, /Platform model/);
  assert.doesNotMatch(html, /My API key/);
});

test("commercial mode localizes the credit modal in Chinese", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="zh-CN"
      commercialMode
      requiredCredits={3}
      availableCredits={1}
      frozenCredits={2}
      commercialActionNotice={{
        tone: "credits",
        title: "额度不足",
        message: "当前可用额度不足。请先兑换访问码或联系运营充值后再启动推演。",
        primaryHref: "/account",
        primaryLabel: "去账号页兑换",
      }}
      providerMode="platform"
      byokAvailable={false}
      onProviderModeChange={() => undefined}
    />,
  );

  assert.doesNotMatch(html, /商业额度/);
  assert.match(html, /额度不足/);
  assert.match(html, /当前可用额度不足/);
  assert.match(html, /去账号页兑换/);
  assert.match(html, /aria-label="关闭提示"/);
  assert.doesNotMatch(html, /消耗：3 点/);
  assert.doesNotMatch(html, /可用：1/);
  assert.doesNotMatch(html, /冻结：2/);
  assert.doesNotMatch(html, /Set up BYOK in account settings first/);
});

test("commercial mode localizes the credit modal in English", () => {
  const html = renderToStaticMarkup(
    <InputView
      simulationType="side_hustle"
      onTypeChange={() => undefined}
      onBack={() => undefined}
      onSubmit={() => undefined}
      isGenerating={false}
      language="en-US"
      commercialMode
      requiredCredits={3}
      availableCredits={1}
      frozenCredits={2}
      commercialActionNotice={{
        tone: "credits",
        title: "Insufficient credits",
        message: "Insufficient available credits. Redeem an access code or ask support to top up before starting.",
        primaryHref: "/account",
        primaryLabel: "Open account settings",
      }}
      providerMode="platform"
      byokAvailable={false}
      onProviderModeChange={() => undefined}
    />,
  );

  assert.doesNotMatch(html, /Commercial credits/);
  assert.match(html, /Insufficient credits/);
  assert.match(html, /Insufficient available credits/);
  assert.match(html, /Open account settings/);
  assert.match(html, /aria-label="Close prompt"/);
  assert.doesNotMatch(html, /Cost: 3 credits/);
  assert.doesNotMatch(html, /Available: 1/);
  assert.doesNotMatch(html, /Frozen: 2/);
});
