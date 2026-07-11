import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HomeView from "./HomeView.js";
import type { Simulation, SimulationType, UserInput } from "../types.js";

test("homepage hero uses concise decision-sandbox advertising copy", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[]}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
    />,
  );
  const heroTitleClass = html.match(/id="home-main-title" class="([^"]+)"/)?.[1] ?? "";

  assert.match(html, /试一下：多智能体协作沙盘/);
  assert.match(html, /先推演再行动/);
  assert.match(html, /AI 星图沙盘 · 30 天推演/);
  assert.match(html, /home-ambient-mesh/);
  assert.match(html, /传播级 AI 决策沙盘/);
  assert.match(html, /先模拟试一次 30 天后的风险、机会和下一步/);
  assert.match(html, /home-starmap-shell/);
  assert.match(html, /text-white/);
  assert.match(html, /block whitespace-nowrap">试一下：多智能体协作沙盘/);
  assert.match(heroTitleClass, /text-xl/);
  assert.match(heroTitleClass, /font-extrabold/);
  assert.match(heroTitleClass, /leading-\[1\.14\]/);
  assert.match(heroTitleClass, /md:text-\[1\.95rem\]/);
  assert.match(heroTitleClass, /lg:text-\[2\.1rem\]/);
  assert.doesNotMatch(heroTitleClass, /text-2xl/);
  assert.doesNotMatch(heroTitleClass, /font-black/);
  assert.doesNotMatch(heroTitleClass, /lg:text-\[2\.8rem\]/);
  assert.doesNotMatch(html, /别急着发，别急着选/);
  assert.doesNotMatch(html, /人生是单行道/);
  assert.doesNotMatch(html, /AI 多Agent沙盘/);
});

test("homepage renders agent sandbox preview near the hero", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[]}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
    />,
  );

  assert.match(html, /AI 星图沙盘/);
  assert.match(html, /AI 多智能体沙盘预演/);
  assert.match(html, /7 个智能体正在围绕你的选择建立世界线/);
  assert.match(html, /未来后果可视化/);
  assert.match(html, /agent-sandbox-orb/);
  assert.match(html, /agent-preview-orb-stage-rail/);
  assert.match(html, /agent-preview-signal-rail/);
  assert.match(html, /真实 3D/);
  assert.doesNotMatch(html, /360° 立体拖拽/);
  assert.match(html, /目标客户/);
  assert.doesNotMatch(html, /agent-lifeform-network/);
});

test("homepage renders the approved immersive toolbench layout", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[]}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
    />,
  );

  assert.match(html, /home-toolbench-shell/);
  assert.match(html, /home-toolbench-hero/);
  assert.match(html, /home-scenario-tool-grid/);
  assert.match(html, /home-example-tool-strip/);
  assert.match(html, /agent-starmap-preview-dashboard/);
  assert.match(html, /agent-sandbox-orb/);
  assert.match(html, /data-renderer="three-webgl"/);
  assert.match(html, /data-draggable="true"/);
  assert.match(html, /真实 3D/);
  assert.doesNotMatch(html, /360° 立体拖拽/);
});

test("homepage can render English entry workflow copy", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[]}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
      language="en-US"
    />,
  );

  assert.match(html, /rush to send it/);
  assert.match(html, /AI Starmap Sandbox/);
  assert.match(html, /Enter simulation/);
  assert.match(html, /Load a real example/);
  assert.doesNotMatch(html, /点击加载真实案例/);
});

test("home templates provide complete simulation input for confirmation before running", async () => {
  const homeModule = await import("./HomeView.js") as typeof import("./HomeView.js") & {
    getTemplateSimulationInput?: (type: SimulationType, index: number) => UserInput;
  };

  assert.equal(typeof homeModule.getTemplateSimulationInput, "function");

  const sideHustleInput = homeModule.getTemplateSimulationInput("side_hustle", 0);
  assert.equal(sideHustleInput.type, "side_hustle");
  assert.ok(sideHustleInput.projectIdea);
  assert.ok(sideHustleInput.dailyTime);
  assert.ok(sideHustleInput.budget);
  assert.ok(sideHustleInput.monetization);
  assert.ok(sideHustleInput.acquisitionChannel?.length);
  assert.ok(sideHustleInput.userStatus);

  const datingInput = homeModule.getTemplateSimulationInput("dating", 0);
  assert.equal(datingInput.type, "dating");
  assert.ok(datingInput.relationshipStatus);
  assert.ok(datingInput.datingDuration);
  assert.ok(datingInput.targetPersonality);
  assert.ok(datingInput.chatLogOrIssue);
  assert.ok(datingInput.proposedAction);

  const lifeChoiceInput = homeModule.getTemplateSimulationInput("life_choice", 0);
  assert.equal(lifeChoiceInput.type, "life_choice");
  assert.ok(lifeChoiceInput.decisionContext);
  assert.ok(lifeChoiceInput.lifeChoiceOptions && lifeChoiceInput.lifeChoiceOptions.length >= 2);
  assert.ok(lifeChoiceInput.optionA);
  assert.ok(lifeChoiceInput.optionB);
  assert.ok(lifeChoiceInput.financialBuffer);
  assert.ok(lifeChoiceInput.familySupport);
  assert.ok(lifeChoiceInput.coreFear);
});

test("home template copy says examples are loaded for confirmation, not run immediately", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[]}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
    />,
  );

  assert.match(html, /点击加载真实案例，确认后再开始推演/);
  assert.match(html, /载入模板/);
  assert.doesNotMatch(html, /立刻进入星图模拟/);
  assert.doesNotMatch(html, /快速模拟/);
});

function makeHistorySimulation(id: string): Simulation {
  return {
    id,
    type: "dating",
    userInput: {
      type: "dating",
      chatLogOrIssue: "TA 最近突然变冷淡，想知道该怎么回。",
      proposedAction: "先降压，再轻轻解释。",
    },
    agents: [],
    stages: [],
    createdAt: "2026-07-04T00:00:00.000Z",
    report: {
      projectName: "暧昧降温推演",
      successProbability: 62,
      expectedRevenue: "关系缓和",
      riskLevel: "medium",
      finalRecommendation: "先低压沟通。",
      scores: {
        demandStrength: 60,
        willingnessToPay: 50,
        acquisitionDifficulty: 40,
        competitionPressure: 45,
        executionFit: 70,
        monetizationClarity: 55,
      },
      finalOutcome: "保留沟通窗口",
      opportunities: [],
      risks: [],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small",
    },
  };
}

test("homepage exposes a continue editing entry when a last input draft exists", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[]}
      lastInputDraft={{
        type: "side_hustle",
        projectIdea: "我想重新编辑上次提交的 AI 简历项目。",
      }}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
      onContinueDraft={() => undefined}
      onDeleteHistory={() => undefined}
    />,
  );

  assert.match(html, /继续编辑上次输入/);
  assert.match(html, /btn-continue-last-input-draft/);
});

test("homepage history rows expose delete report controls", () => {
  const html = renderToStaticMarkup(
    <HomeView
      historyList={[makeHistorySimulation("sim-delete-me")]}
      onStart={() => undefined}
      onSelectHistory={() => undefined}
      onSelectTemplate={() => undefined}
      onDeleteHistory={() => undefined}
    />,
  );

  assert.match(html, /删除报告/);
  assert.match(html, /btn-delete-history-sim-delete-me/);
});
