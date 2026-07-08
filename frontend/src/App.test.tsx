import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Simulation, UserInput } from "./types.js";

test("simulation request body defaults interaction mode to legacy", async () => {
  const { buildSimulationRequestBody } = await import("./simulation-request.js");
  const userInput: UserInput = {
    type: "side_hustle",
    projectIdea: "用AI帮求职者优化简历并按次收费",
  };

  assert.deepEqual(buildSimulationRequestBody(userInput), {
    userInput,
    interactionMode: "legacy",
  });
});

test("app header exposes a language switch", async () => {
  const { default: App } = await import("./App.js");
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /btn-toggle-language/);
  assert.match(html, /aria-label="Switch language to English"/);
  assert.match(html, />EN</);
});

test("app header links to standalone commercial auth pages", async () => {
  const { default: App } = await import("./App.js");
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /link-commercial-login/);
  assert.match(html, /href="\/login"/);
  assert.match(html, />登录</);
  assert.match(html, /link-commercial-register/);
  assert.match(html, /href="\/register"/);
  assert.match(html, />注册</);
  assert.doesNotMatch(html, /account-panel/);
});

test("login path renders a standalone commercial login page", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/login" },
  });

  try {
    const html = renderToStaticMarkup(<App />);
    assert.match(html, /auth-page-login/);
    assert.match(html, /商业账号登录/);
    assert.match(html, /登录商业账号/);
    assert.doesNotMatch(html, /创建商业账号/);
    assert.doesNotMatch(html, /home-view-container/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("register path renders a standalone commercial registration page", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/register" },
  });

  try {
    const html = renderToStaticMarkup(<App />);
    assert.match(html, /auth-page-register/);
    assert.match(html, /商业账号注册/);
    assert.match(html, /创建商业账号/);
    assert.doesNotMatch(html, /登录商业账号/);
    assert.doesNotMatch(html, /home-view-container/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("admin path renders the commercial admin shell", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/admin" },
  });

  try {
    const html = renderToStaticMarkup(<App />);
    assert.match(html, /admin-app-shell/);
    assert.match(html, /平台控制中心/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("view changes can reset scroll before showing a new workflow", async () => {
  const { scrollToTopForViewChange } = await import("./App.js");
  const calls: ScrollToOptions[] = [];
  const originalScrollTo = globalThis.scrollTo;
  globalThis.scrollTo = (options?: ScrollToOptions | number) => {
    if (typeof options === "object") {
      calls.push(options);
    }
  };

  try {
    scrollToTopForViewChange();
  } finally {
    globalThis.scrollTo = originalScrollTo;
  }

  assert.deepEqual(calls, [{ top: 0, left: 0, behavior: "instant" }]);
});

test("buildShareCardOpenedEvent records share modal exposure separately from copy intent", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    buildShareCardOpenedEvent?: (simulation: Simulation) => unknown;
  };

  assert.deepEqual(appModule.buildShareCardOpenedEvent?.(makeSimulation("sim-share")), {
    type: "share_card_opened",
    simulationId: "sim-share",
    scenarioType: "side_hustle",
  });
});

function makeSimulation(id: string, createdAt = "2026-07-04T00:00:00.000Z"): Simulation {
  return {
    id,
    type: "side_hustle",
    userInput: {
      type: "side_hustle",
      projectIdea: `测试项目 ${id}`,
    },
    agents: [],
    stages: [],
    createdAt,
    report: {
      projectName: `测试报告 ${id}`,
      successProbability: 50,
      expectedRevenue: "0 元",
      riskLevel: "medium",
      finalRecommendation: "先小范围测试",
      scores: {
        demandStrength: 50,
        willingnessToPay: 50,
        acquisitionDifficulty: 50,
        competitionPressure: 50,
        executionFit: 50,
        monetizationClarity: 50,
      },
      finalOutcome: "可继续观察",
      opportunities: [],
      risks: [],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small",
    },
  };
}

test("adding a simulation to history dedupes by id and caps at five reports", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    addSimulationToHistoryList?: (history: Simulation[], simulation: Simulation) => Simulation[];
  };

  assert.equal(typeof appModule.addSimulationToHistoryList, "function");

  const existing = ["sim_1", "sim_2", "sim_3", "sim_4", "sim_5"]
    .map((id) => makeSimulation(id));
  const replacement = makeSimulation("sim_3", "2026-07-04T01:00:00.000Z");

  const updated = appModule.addSimulationToHistoryList(existing, replacement);

  assert.equal(updated.length, 5);
  assert.equal(updated[0].id, "sim_3");
  assert.equal(updated[0].createdAt, "2026-07-04T01:00:00.000Z");
  assert.deepEqual(updated.map((item) => item.id), ["sim_3", "sim_1", "sim_2", "sim_4", "sim_5"]);
});

test("adding a new simulation to full history drops the oldest report", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    addSimulationToHistoryList?: (history: Simulation[], simulation: Simulation) => Simulation[];
  };

  assert.equal(typeof appModule.addSimulationToHistoryList, "function");

  const existing = ["sim_1", "sim_2", "sim_3", "sim_4", "sim_5"]
    .map((id) => makeSimulation(id));
  const updated = appModule.addSimulationToHistoryList(existing, makeSimulation("sim_6"));

  assert.deepEqual(updated.map((item) => item.id), ["sim_6", "sim_1", "sim_2", "sim_3", "sim_4"]);
});

test("deleting a simulation from history removes only the matching report", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    deleteSimulationFromHistoryList?: (history: Simulation[], simulationId: string) => Simulation[];
  };

  assert.equal(typeof appModule.deleteSimulationFromHistoryList, "function");

  const existing = ["sim_1", "sim_2", "sim_3"].map((id) => makeSimulation(id));
  const updated = appModule.deleteSimulationFromHistoryList(existing, "sim_2");

  assert.deepEqual(updated.map((item) => item.id), ["sim_1", "sim_3"]);
});

test("stored user input draft parsing accepts valid user input and ignores invalid data", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    parseStoredUserInput?: (stored: string | null) => UserInput | undefined;
  };

  assert.equal(typeof appModule.parseStoredUserInput, "function");

  const draft: UserInput = {
    type: "dating",
    relationshipStatus: "暧昧拉扯期",
    chatLogOrIssue: "TA 最近突然变冷淡，我想知道下一句怎么回。",
    proposedAction: "先道歉降压，再轻轻约一次。",
  };

  assert.deepEqual(appModule.parseStoredUserInput(JSON.stringify(draft)), draft);
  assert.equal(appModule.parseStoredUserInput(null), undefined);
  assert.equal(appModule.parseStoredUserInput("{bad json"), undefined);
  assert.equal(appModule.parseStoredUserInput(JSON.stringify({ projectIdea: "缺少 type" })), undefined);
});

test("stored user input draft parsing ignores corrupted JSON without logging noise", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    parseStoredUserInput?: (stored: string | null) => UserInput | undefined;
  };
  const originalConsoleError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    assert.equal(appModule.parseStoredUserInput?.("{bad json"), undefined);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(calls, []);
});
