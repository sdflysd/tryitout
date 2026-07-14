import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ModelSelection, Simulation, SimulationApiResponse, UserInput } from "./types.js";
import type { PublicModelProviderDto } from "./commercial-client.js";
import type { SimulationTaskStatusResponse } from "./contracts/simulation-task.js";

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

test("app header links signed-in users to the account settings page", async () => {
  const { default: App } = await import("./App.js");
  const html = renderToStaticMarkup(<App initialCommercialUser={{
    id: "user_1",
    email: "buyer@example.test",
    emailNormalized: "buyer@example.test",
    role: "user",
    tier: "pro",
    status: "active",
    features: ["custom_model_provider"],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  }} />);

  assert.match(html, /link-commercial-account/);
  assert.match(html, /href="\/account"/);
  assert.doesNotMatch(html, /href="\/login"/);
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
    assert.match(html, /账号登录/);
    assert.match(html, /登录账号/);
    assert.doesNotMatch(html, /创建账号/);
    assert.doesNotMatch(html, /商业账号/);
    assert.doesNotMatch(html, /commercial-secret/);
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
    assert.match(html, /账号注册/);
    assert.match(html, /创建账号/);
    assert.doesNotMatch(html, /登录账号/);
    assert.doesNotMatch(html, /商业账号/);
    assert.doesNotMatch(html, /commercial-secret/);
    assert.doesNotMatch(html, /home-view-container/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("commercial auth and account route chrome can render in English", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/login" },
  });

  try {
    const loginHtml = renderToStaticMarkup(<App initialLanguage="en-US" />);
    assert.match(loginHtml, /Account login/);
    assert.match(loginHtml, /Sign in to account/);
    assert.match(loginHtml, /Create account/);
    assert.doesNotMatch(loginHtml, /Commercial account/);
    assert.doesNotMatch(loginHtml, /commercial-secret/);

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { pathname: "/account" },
    });
    const accountHtml = renderToStaticMarkup(<App initialLanguage="en-US" />);
    assert.match(accountHtml, /Account settings/);
    assert.match(accountHtml, /Sign in before viewing credits, redeeming access codes, or configuring models/);
    assert.match(accountHtml, /Sign in/);
    assert.match(accountHtml, /Create account/);
    assert.doesNotMatch(accountHtml, /Commercial account/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("account path renders the account settings route", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/account" },
  });

  try {
    const html = renderToStaticMarkup(<App initialCommercialUser={{
      id: "user_1",
      email: "buyer@example.test",
      emailNormalized: "buyer@example.test",
      role: "user",
      tier: "pro",
      status: "active",
      features: ["custom_model_provider"],
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
    }} />);
    assert.match(html, /account-page/);
    assert.match(html, /account-panel/);
    assert.doesNotMatch(html, /auth-page-login/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("account path links to a dedicated model configuration page", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/account" },
  });

  try {
    const html = renderToStaticMarkup(<App initialCommercialUser={{
      id: "user_1",
      email: "buyer@example.test",
      emailNormalized: "buyer@example.test",
      role: "user",
      tier: "pro",
      status: "active",
      features: ["custom_model_provider"],
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
    }} />);
    assert.match(html, /account-page/);
    assert.match(html, /href="\/account\/models"/);
    assert.match(html, /模型配置/);
    assert.doesNotMatch(html, /平台模型选择/);
    assert.doesNotMatch(html, /name="accountProviderMode"/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("account path honors stored platform model selection on first render", async () => {
  const { default: App, MODEL_PROFILE_STORAGE_KEY } = await import("./App.js");
  const originalLocation = globalThis.location;
  const originalLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/account" },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) =>
        key === MODEL_PROFILE_STORAGE_KEY ? "gpt_5_5_balanced" : null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });

  try {
    const html = renderToStaticMarkup(<App
      initialLanguage="en-US"
      initialCommercialUser={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "business",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      initialPlatformModels={[
        {
          id: "gemini_3_1_pro",
          label: "gemini-3.1-pro",
          providerLabel: "lemon",
          modelId: "gemini-3.1-pro",
          quality: "balanced",
        },
        {
          id: "gpt_5_5_balanced",
          label: "gpt-5.5",
          providerLabel: "lemon",
          modelId: "gpt-5.5",
          quality: "balanced",
        },
      ]}
    />);

    assert.match(html, /Current selection/);
    assert.match(html, /gpt-5\.5 \(gpt-5\.5\)/);
    assert.doesNotMatch(html, /gemini-3\.1-pro \(gemini-3\.1-pro\)/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

test("model configuration path renders selectable platform and BYOK settings", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/account/models" },
  });

  try {
    const html = renderToStaticMarkup(<App
      initialLanguage="en-US"
      initialCommercialUser={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      initialCommercialModelProvider={{
        id: "provider_1",
        provider: "openai",
        displayName: "OpenAI-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMask: "sk-liv...3456",
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      initialPlatformModels={[
        {
          id: "gemini_flash_balanced",
          label: "Gemini Flash Balanced",
          providerLabel: "Gemini",
          modelId: "gemini-3.5-flash",
          quality: "balanced",
        },
      ]}
    />);
    assert.match(html, /model-config-page/);
    assert.match(html, /Model settings/);
    assert.doesNotMatch(html, /Account settings/);
    assert.match(html, /Platform model choice/);
    assert.match(html, /Gemini Flash Balanced/);
    assert.match(html, /API key choice/);
    assert.match(html, /Use my API key/);
    assert.match(html, /sk-liv\.\.\.3456/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("commercial post-auth helpers return users to home", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    getCommercialPostAuthPath?: () => string;
    redirectToCommercialPostAuthPath?: (location?: Pick<Location, "assign">) => void;
  };
  const assignedPaths: string[] = [];

  assert.equal(appModule.getCommercialPostAuthPath?.(), "/");
  appModule.redirectToCommercialPostAuthPath?.({
    assign: (path: string | URL) => {
      assignedPaths.push(String(path));
    },
  });

  assert.deepEqual(assignedPaths, ["/"]);
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

test("commercial provider helpers gate BYOK and calculate selected credit costs", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    canConfigureByokProvider?: (input: {
      user?: { tier: "basic" | "pro" | "business"; features: string[] };
    }) => boolean;
    canUseByokProvider?: (input: {
      user?: { tier: "basic" | "pro" | "business"; features: string[] };
      provider?: PublicModelProviderDto;
    }) => boolean;
    resolveCommercialSimulationCost?: (input: {
      deepAgentMode: boolean;
      providerMode: "platform" | "byok";
    }) => number;
    buildCommercialSimulationTaskRequest?: (
      userInput: UserInput,
      input: {
        deepAgentMode: boolean;
        providerMode: "platform" | "byok";
        startedAt: number;
        modelSelection?: ModelSelection;
      },
    ) => unknown;
    buildCommercialModelSelection?: (input: {
      providerMode: "platform" | "byok";
      selectedModelProfileId?: string;
      selectedCredentialId?: string;
      deepAgentMode: boolean;
    }) => ModelSelection | undefined;
  };

  assert.equal(appModule.canConfigureByokProvider?.({
    user: { tier: "business", features: ["custom_model_provider"] },
  }), true);
  assert.equal(appModule.canUseByokProvider?.({
    user: { tier: "business", features: ["custom_model_provider"] },
  }), false);
  const activeProvider: PublicModelProviderDto = {
    id: "provider_1",
    provider: "openai",
    displayName: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKeyMask: "sk-liv...3456",
    status: "active",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  };
  const userInput: UserInput = {
    type: "side_hustle",
    projectIdea: "用AI帮求职者优化简历并按次收费",
  };

  assert.equal(appModule.canUseByokProvider?.({
    user: { tier: "pro", features: ["custom_model_provider"] },
    provider: activeProvider,
  }), true);
  assert.equal(appModule.canUseByokProvider?.({
    user: { tier: "basic", features: [] },
    provider: activeProvider,
  }), false);
  assert.equal(appModule.resolveCommercialSimulationCost?.({
    deepAgentMode: true,
    providerMode: "platform",
  }), 3);
  assert.equal(appModule.resolveCommercialSimulationCost?.({
    deepAgentMode: true,
    providerMode: "byok",
  }), 2);
  assert.deepEqual(appModule.buildCommercialSimulationTaskRequest?.(userInput, {
    deepAgentMode: true,
    providerMode: "byok",
    startedAt: 123,
    modelSelection: {
      userCredentialId: "provider_1",
      mode: "deep",
    },
    createIdempotencyKey: (startedAt: number) => `simulation_${startedAt}_test-id`,
  }), {
    userInput,
    interactionMode: "enabled",
    providerMode: "byok",
    modelSelection: {
      userCredentialId: "provider_1",
      mode: "deep",
    },
    idempotencyKey: "simulation_123_test-id",
  });
  assert.deepEqual(appModule.buildCommercialModelSelection?.({
    providerMode: "platform",
    selectedModelProfileId: "anthropic_sonnet_balanced",
    deepAgentMode: true,
  }), {
    modelProfileId: "anthropic_sonnet_balanced",
  });
  assert.deepEqual(appModule.buildCommercialModelSelection?.({
    providerMode: "byok",
    selectedCredentialId: "provider_1",
    deepAgentMode: true,
  }), {
    userCredentialId: "provider_1",
  });
});

test("commercial active task elapsed time uses persisted queue and start timestamps", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    getCommercialTaskElapsedMs?: (
      task: {
        status: "queued" | "running" | "recoverable_failed" | "completed" | "failed" | "cancelled" | "paused";
        queuedAt?: string;
        startedAt?: string;
        createdAt?: string;
        updatedAt: string;
      },
      now?: number,
    ) => number;
  };
  const now = Date.parse("2026-07-07T00:10:00.000Z");

  assert.equal(appModule.getCommercialTaskElapsedMs?.({
    status: "queued",
    queuedAt: "2026-07-07T00:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:30.000Z",
  }, now), 10 * 60 * 1000);
  assert.equal(appModule.getCommercialTaskElapsedMs?.({
    status: "running",
    queuedAt: "2026-07-07T00:00:00.000Z",
    startedAt: "2026-07-07T00:03:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:09:00.000Z",
  }, now), 7 * 60 * 1000);
});

test("commercial task reports can be converted into history simulations", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    buildCommercialTaskReportSimulation?: (
      task: SimulationTaskStatusResponse,
      report: SimulationApiResponse,
    ) => Simulation;
  };

  assert.equal(typeof appModule.buildCommercialTaskReportSimulation, "function");

  const simulation = appModule.buildCommercialTaskReportSimulation(
    makeTask({ simulationId: "task_report", scenarioType: "dating", mode: "enabled" }),
    makeApiResponse("sim_report"),
  );

  assert.equal(simulation.id, "sim_report");
  assert.equal(simulation.type, "dating");
  assert.deepEqual(simulation.userInput, { type: "dating" });
  assert.equal(simulation.interactionModeUsed, "enabled");
  assert.equal(simulation.report.projectName, "测试报告 sim_report");
});

test("model configuration path only shows admin-enabled platform models", async () => {
  const { default: App } = await import("./App.js");
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/account/models" },
  });

  try {
    const html = renderToStaticMarkup(<App
      initialLanguage="en-US"
      initialCommercialUser={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      initialPlatformModels={[
        {
          id: "anthropic_sonnet_balanced",
          label: "Claude Sonnet Balanced",
          providerLabel: "Anthropic",
          modelId: "claude-sonnet-4-20250514",
          quality: "balanced",
        },
      ]}
    />);

    assert.match(html, /Claude Sonnet Balanced/);
    assert.doesNotMatch(html, /Gemini Flash Balanced/);
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("commercial start action notices guide signed-out and low-credit users", async () => {
  const appModule = await import("./App.js") as typeof import("./App.js") & {
    resolveCommercialStartActionNotice?: (input: {
      commercialMode: boolean;
      startAttempted: boolean;
      hasUser: boolean;
      availableCredits: number;
      requiredCredits: number;
      language?: "zh-CN" | "en-US";
    }) => unknown;
  };

  assert.equal(appModule.resolveCommercialStartActionNotice?.({
    commercialMode: true,
    startAttempted: false,
    hasUser: false,
    availableCredits: 0,
    requiredCredits: 3,
    language: "en-US",
  }), undefined);
  assert.deepEqual(appModule.resolveCommercialStartActionNotice?.({
    commercialMode: true,
    startAttempted: true,
    hasUser: false,
    availableCredits: 0,
    requiredCredits: 3,
    language: "en-US",
  }), {
    tone: "login",
    title: "Sign in required",
    message: "Sign in or create an account before starting a simulation.",
    primaryHref: "/login",
    primaryLabel: "Sign in",
    secondaryHref: "/register",
    secondaryLabel: "Create account",
  });
  assert.deepEqual(appModule.resolveCommercialStartActionNotice?.({
    commercialMode: true,
    startAttempted: true,
    hasUser: false,
    availableCredits: 0,
    requiredCredits: 3,
    language: "zh-CN",
  }), {
    tone: "login",
    title: "需要登录",
    message: "请先登录账号或注册后再启动推演。",
    primaryHref: "/login",
    primaryLabel: "去登录",
    secondaryHref: "/register",
    secondaryLabel: "注册账号",
  });
  assert.deepEqual(appModule.resolveCommercialStartActionNotice?.({
    commercialMode: true,
    startAttempted: true,
    hasUser: true,
    availableCredits: 1,
    requiredCredits: 3,
    language: "zh-CN",
  }), {
    tone: "credits",
    title: "额度不足",
    message: "当前可用额度不足。请先兑换访问码或联系运营充值后再启动推演。",
    primaryHref: "/account",
    primaryLabel: "去账号页兑换",
  });
  assert.equal(appModule.resolveCommercialStartActionNotice?.({
    commercialMode: true,
    startAttempted: true,
    hasUser: true,
    availableCredits: 3,
    requiredCredits: 3,
    language: "zh-CN",
  }), undefined);
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

function makeApiResponse(id: string): SimulationApiResponse {
  return {
    id,
    status: "completed",
    agents: [],
    stages: [],
    createdAt: "2026-07-04T00:00:00.000Z",
    interactionModeUsed: "enabled",
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

function makeTask(
  overrides: Partial<SimulationTaskStatusResponse> = {},
): SimulationTaskStatusResponse {
  return {
    simulationId: "task_1",
    scenarioType: "side_hustle",
    mode: "enabled",
    status: "queued",
    progressPercent: 0,
    recoverable: false,
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
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
