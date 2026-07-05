import assert from "node:assert/strict";
import test from "node:test";

import { AiGateway } from "../ai/ai-gateway.js";
import type { AiProviderAdapter } from "../ai/adapters/provider-adapter.js";
import type { AiCallRequest, AiCallResult } from "../ai/types.js";
import type { Agent, AgentAction, AgentVote, UserInput, WorldState } from "../../types.js";
import { runStageInteraction } from "./stage-interaction-runner.js";

class StageInteractionStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "customer_feedback",
          title: "客户质疑信任",
          description: "目标客户认为 AI 简历优化服务缺少可信案例。",
          impact: "negative",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      return makeResult<T>(request, {
        actions: [
          {
            id: "act_customer_challenge_coach",
            type: "challenge",
            actorAgentId: "customer_agent",
            targetAgentId: "coach_agent",
            content: "你说能提升简历命中率，但我看不到真实案例。",
            reason: "缺少信任证据会阻断第一次试用。",
            impact: "negative",
            stateDeltaHint: { confidence: -12, riskLevel: 9 },
          },
          {
            id: "act_coach_reply_customer",
            type: "reply",
            actorAgentId: "coach_agent",
            targetAgentId: "customer_agent",
            content: "我先拿 3 个试用前后对比，不直接承诺命中率。",
            reason: "回复客户质疑并把验证方式降到可执行。",
            impact: "positive",
            stateDeltaHint: { productClarity: 4, confidence: 2 },
          },
          {
            id: "act_coach_like_customer",
            type: "like",
            actorAgentId: "coach_agent",
            targetAgentId: "customer_agent",
            content: "这个信任质疑值得优先处理。",
            reason: "认可客户 Agent 暴露的一阶风险。",
            impact: "positive",
            stateDeltaHint: { productClarity: 2 },
          },
          {
            id: "act_channel_warn_coach",
            type: "warn",
            actorAgentId: "channel_agent",
            targetAgentId: "coach_agent",
            content: "没有信任素材就扩大投放会浪费流量。",
            reason: "渠道转化依赖可验证案例。",
            impact: "negative",
            stateDeltaHint: { trafficProgress: -2, riskLevel: 4 },
          },
          {
            id: "act_channel_support_customer",
            type: "support",
            actorAgentId: "channel_agent",
            targetAgentId: "customer_agent",
            content: "渠道侧也需要真实案例，否则曝光不会转成咨询。",
            reason: "支持客户 Agent 对信任素材的要求。",
            impact: "positive",
            stateDeltaHint: { productClarity: 3 },
          },
          {
            id: "act_customer_vote",
            type: "vote",
            actorAgentId: "customer_agent",
            content: "先补可信案例再继续。",
            reason: "信任证据不足会降低首次付费概率。",
            impact: "negative",
            stateDeltaHint: { confidence: -10, riskLevel: 8 },
          },
        ],
        votes: [
          makeVote("customer_agent"),
          makeVote("coach_agent"),
          makeVote("channel_agent"),
        ],
      });
    }

    if (request.step === "arbitrate_stage") {
      return makeResult<T>(request, {
        summary: "裁判采纳客户 Agent 的信任质疑，但认为仍可小步验证。",
        acceptedAgentIds: ["customer_agent"],
        rejectedAgentIds: ["coach_agent"],
        finalDelta: { confidence: -8, riskLevel: 6 },
        keyDecision: "是否先补 3 个真实案例再继续推广？",
        nextSuggestion: "先邀请 3 个目标用户试用并沉淀前后对比。",
      });
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

class IncompleteActionsStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  constructor(private readonly actions: AgentAction[] = [makeTestAction("challenge")]) {}

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "customer_feedback",
          title: "客户质疑信任",
          description: "目标客户认为 AI 简历优化服务缺少可信案例。",
          impact: "negative",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      return makeResult<T>(request, {
        actions: this.actions,
        votes: [
          {
            agentId: "customer_agent",
            verdict: "pivot",
            confidence: 82,
            stateDeltaVote: { confidence: -10, riskLevel: 8 },
            rationale: "先补可信案例，再扩大投放。",
          },
        ],
      });
    }

    if (request.step === "arbitrate_stage") {
      return makeResult<T>(request, {
        summary: "不应调用裁判。",
        acceptedAgentIds: ["customer_agent"],
        rejectedAgentIds: [],
        finalDelta: {},
        keyDecision: "不应出现。",
        nextSuggestion: "不应出现。",
      });
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

class AgentActionsStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  constructor(
    private readonly actions: AgentAction[],
    private readonly votes: AgentVote[],
  ) {}

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "customer_feedback",
          title: "客户质疑信任",
          description: "目标客户认为 AI 简历优化服务缺少可信案例。",
          impact: "negative",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      return makeResult<T>(request, {
        actions: this.actions,
        votes: this.votes,
      });
    }

    if (request.step === "arbitrate_stage") {
      return makeResult<T>(request, {
        summary: "裁判采纳无定向动作，但补齐最小关系。",
        acceptedAgentIds: ["customer_agent"],
        rejectedAgentIds: ["coach_agent"],
        finalDelta: { confidence: -8, riskLevel: 6 },
        keyDecision: "是否先补 3 个真实案例再继续推广？",
        nextSuggestion: "先邀请 3 个目标用户试用并沉淀前后对比。",
      });
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

class ThrowingInteractionStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "customer_feedback",
          title: "客户质疑信任",
          description: "目标客户认为 AI 简历优化服务缺少可信案例。",
          impact: "negative",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      throw new SyntaxError("Unexpected token in JSON response");
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

class ThrowingWorldEventStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    if (request.step === "generate_world_event") {
      throw new SyntaxError("Unexpected token in world event JSON response");
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

class InvalidActionsStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "customer_feedback",
          title: "客户质疑信任",
          description: "目标客户认为 AI 简历优化服务缺少可信案例。",
          impact: "negative",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      return makeResult<T>(request, {
        actions: "not-an-array",
        votes: [],
      });
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

test("runStageInteraction orchestrates event, actions, arbitration, and backend state update", async () => {
  const adapter = new StageInteractionStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-interaction",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
  });

  assert.equal(result.stage.stageIndex, 1);
  assert.equal(result.stage.timeRange, "第 1-3 天");
  assert.equal(result.stage.events[0].title, "客户质疑信任");
  assert.deepEqual(
    result.stage.interactions?.actions.map((action) => action.type).sort(),
    ["challenge", "like", "reply", "support", "vote", "warn"].sort(),
  );
  assert.deepEqual(result.stage.interactions?.mergedVoteDelta, {
    confidence: -10,
    riskLevel: 8,
  });
  assert.deepEqual(result.stage.interactions?.finalDelta, {
    confidence: -9,
    riskLevel: 7,
  });
  assert.equal(result.stage.interactions?.relationships[0]?.fromAgentId, "customer_agent");
  assert.equal(result.stage.interactions?.relationships[0]?.toAgentId, "coach_agent");
  assert.equal(result.stage.stateAfter.confidence, 41);
  assert.equal(result.stage.stateAfter.riskLevel, 47);
  assert.equal(result.stage.stateAfter.day, 3);
  assert.equal(result.stage.summary, "裁判采纳客户 Agent 的信任质疑，但认为仍可小步验证。");
  assert.equal(result.stage.keyDecision, "是否先补 3 个真实案例再继续推广？");
  assert.equal(result.stage.nextSuggestion, "先邀请 3 个目标用户试用并沉淀前后对比。");

  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions", "arbitrate_stage"],
  );
});

async function assertInvalidActionSetFallsBack(actions: AgentAction[]): Promise<void> {
  const adapter = new IncompleteActionsStubAdapter(actions);
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const fallbackStage = makeFallbackStage();

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-incomplete-actions",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
    fallbackStage,
  });

  assert.equal(result.stage.title, fallbackStage.title);
  assert.ok(result.stage.interactions);
  assert.deepEqual(
    result.stage.interactions.actions.map((action) => action.type).sort(),
    ["challenge", "like", "reply", "support", "vote", "warn"].sort(),
  );
  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions"],
  );
}

test("runStageInteraction rejects structurally valid action responses missing required coverage", async () => {
  await assertInvalidActionSetFallsBack([makeTestAction("challenge")]);
});

test("runStageInteraction rejects duplicate required action types", async () => {
  await assertInvalidActionSetFallsBack([
    makeTestAction("like", "first"),
    makeTestAction("challenge"),
    makeTestAction("warn"),
    makeTestAction("vote"),
    makeTestAction("like", "duplicate"),
  ]);
});

test("runStageInteraction accepts dense multi-agent discussions beyond four actions", async () => {
  const adapter = new AgentActionsStubAdapter(
    makeDenseActions(),
    [makeVote("customer_agent"), makeVote("coach_agent"), makeVote("channel_agent")],
  );
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-dense-discussion",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
  });

  assert.equal(result.stage.title, "客户质疑信任");
  assert.ok((result.stage.interactions?.actions.length ?? 0) >= 6);
  assert.ok(result.stage.interactions?.actions.some((action) => action.type === "reply"));
  assert.ok(result.stage.interactions?.actions.some((action) => action.type === "support"));
  assert.ok(result.stage.interactions?.relationships.some((relationship) => relationship.toAgentId === "customer_agent"));
  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions", "arbitrate_stage"],
  );
});

test("runStageInteraction rejects empty votes and skips arbitration", async () => {
  const adapter = new AgentActionsStubAdapter(makeRequiredActions(), []);
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const fallbackStage = makeFallbackStage();

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-empty-votes",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
    fallbackStage,
  });

  assert.equal(result.stage.title, fallbackStage.title);
  assert.ok(result.stage.interactions);
  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions"],
  );
});

test("runStageInteraction rejects votes that do not cover activated agents", async () => {
  const adapter = new AgentActionsStubAdapter(
    makeRequiredActions(),
    [makeVote("customer_agent"), makeVote("coach_agent")],
  );
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const fallbackStage = makeFallbackStage();

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-missing-vote-coverage",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
    fallbackStage,
  });

  assert.equal(result.stage.title, fallbackStage.title);
  assert.ok(result.stage.interactions);
  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions"],
  );
});

test("runStageInteraction rejects dense-looking actions with no target agents", async () => {
  const adapter = new AgentActionsStubAdapter(
    makeRequiredActions().map((action) => ({ ...action, targetAgentId: undefined })),
    [makeVote("customer_agent"), makeVote("coach_agent"), makeVote("channel_agent")],
  );
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const fallbackStage = makeFallbackStage();

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-relationship-fallback",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
    fallbackStage,
  });

  assert.equal(result.stage.title, fallbackStage.title);
  assert.ok((result.stage.interactions?.relationships.length ?? 0) > 0);
  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions"],
  );
});

test("runStageInteraction returns safe fallback interactions when event generation throws", async () => {
  const adapter = new ThrowingWorldEventStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const fallbackStage = makeFallbackStage();

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-fallback",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
    fallbackStage,
  });

  assert.equal(result.stage.title, fallbackStage.title);
  assert.ok(result.stage.interactions);
  assert.deepEqual(
    result.stage.interactions.actions.map((action) => action.type).sort(),
    ["challenge", "like", "reply", "support", "vote", "warn"].sort(),
  );
  assert.equal(result.stage.interactions.votes[0]?.verdict, "wait");
  assert.equal(result.stage.stateAfter.day, 3);
});

test("runStageInteraction builds local interaction when action generation times out", async () => {
  const adapter = new ThrowingInteractionStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-local-interaction",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
  });

  assert.equal(result.stage.title, "客户质疑信任");
  assert.ok(result.stage.interactions);
  assert.equal(result.stage.interactions.activatedAgentIds.includes("fallback_arbiter_agent"), false);
  assert.equal(result.stage.interactions.activatedAgentIds.includes("customer_agent"), true);
  assert.equal(result.stage.interactions.activatedAgentIds.includes("channel_agent"), true);
  assert.deepEqual(
    result.stage.interactions.actions.map((action) => action.type).sort(),
    ["challenge", "like", "reply", "support", "vote", "warn"].sort(),
  );
  assert.equal(result.stage.interactions.votes.length, result.stage.interactions.activatedAgentIds.length);
  assert.match(result.stage.interactions.arbiterSummary, /本地保底互动/);
  assert.doesNotMatch(result.stage.interactions.arbiterSummary, /互动步骤失败/);
  assert.equal(result.stage.stateAfter.day, 3);
  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    ["generate_world_event", "generate_agent_actions"],
  );
});

test("runStageInteraction returns safe minimal fallback when validation fallback throws", async () => {
  const adapter = new InvalidActionsStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  let fallbackCalls = 0;

  const result = await runStageInteraction({
    gateway,
    simulationId: "sim-stage-validation-fallback",
    userInput: makeSideHustleInput(),
    stageIndex: 1,
    coreAgents: makeCoreAgents(),
    peripheralAgents: makePeripheralAgents(),
    currentState: makeWorldState(),
    previousActions: [],
    fallbackStage: () => {
      fallbackCalls += 1;
      throw new Error("fallback failed");
    },
  });

  assert.equal(fallbackCalls, 1);
  assert.equal(result.stage.stageIndex, 1);
  assert.equal(result.stage.stateAfter.day, 3);
  assert.deepEqual(
    result.stage.interactions?.actions.map((action) => action.type).sort(),
    ["challenge", "like", "reply", "support", "vote", "warn"].sort(),
  );
  assert.ok((result.stage.interactions?.votes.length ?? 0) > 0);
  assert.ok((result.stage.interactions?.relationships.length ?? 0) > 0);
  const serializedStage = JSON.stringify(result.stage);
  assert.doesNotMatch(serializedStage, /fallback failed/);
  assert.doesNotMatch(serializedStage, /actions must be an array/);
});

function makeSideHustleInput(): UserInput {
  return {
    type: "side_hustle",
    projectIdea: "AI 简历优化服务",
    targetUser: "准备跳槽的互联网从业者",
    skills: ["简历修改", "AI 自动化"],
    dailyTime: "2小时",
    budget: "500元",
    monetization: "按次付费",
    acquisitionChannel: ["小红书", "社群"],
    userStatus: "下班后执行",
  };
}

function makeWorldState(): WorldState {
  return {
    day: 0,
    productClarity: 35,
    executionEnergy: 75,
    trafficProgress: 12,
    trialUsers: 2,
    paidUsers: 0,
    revenue: 0,
    riskLevel: 40,
    confidence: 50,
  };
}

function makeCoreAgents(): Agent[] {
  return [
    {
      id: "coach_agent",
      name: "教练 Agent",
      role: "优化服务提供者",
      layer: "core",
      stance: "支持",
      keyJudgment: "先快速拿到试用反馈。",
      objection: "不能过早扩大。",
    },
    {
      id: "customer_agent",
      name: "客户 Agent",
      role: "目标客户",
      layer: "core",
      stance: "质疑",
      keyJudgment: "我需要看到可信案例才会付费。",
      objection: "信任链路不足。",
    },
  ];
}

function makePeripheralAgents(): Agent[] {
  return [
    {
      id: "channel_agent",
      name: "渠道 Agent",
      role: "流量渠道观察者",
      layer: "peripheral",
      stance: "观望",
      keyJudgment: "信任素材会影响转化。",
    },
  ];
}

function makeFallbackStage() {
  return {
    stageIndex: 1,
    timeRange: "第 1-3 天",
    title: "备用阶段",
    summary: "互动步骤失败后使用备用阶段。",
    events: [],
    agentReactions: [],
    stateAfter: {
      ...makeWorldState(),
      day: 3,
    },
    keyDecision: "先保守推进。",
    nextSuggestion: "使用原有阶段推演结果。",
  };
}

function makeRequiredActions(): AgentAction[] {
  return makeDenseActions();
}

function makeDenseActions(): AgentAction[] {
  const actions = [
    makeTestAction("like"),
    makeTestAction("challenge"),
    makeTestAction("reply"),
    makeTestAction("support"),
    makeTestAction("warn"),
    makeTestAction("vote"),
  ];

  return actions.map((action) => {
    if (action.type === "reply" || action.type === "like") {
      return {
        ...action,
        actorAgentId: "coach_agent",
        targetAgentId: "customer_agent",
        impact: "positive" as const,
      };
    }
    if (action.type === "support" || action.type === "warn") {
      return {
        ...action,
        actorAgentId: "channel_agent",
        targetAgentId: "customer_agent",
        impact: action.type === "support" ? "positive" as const : "negative" as const,
      };
    }

    return action;
  });
}

function makeTestAction(
  type: AgentAction["type"],
  suffix: string = type,
): AgentAction {
  return {
    id: `act_${suffix}`,
    type,
    actorAgentId: "customer_agent",
    targetAgentId: type === "vote" ? undefined : "coach_agent",
    content: "你说能提升简历命中率，但我看不到真实案例。",
    reason: "缺少信任证据会阻断第一次试用。",
    impact: type === "like" ? "positive" : "negative",
    stateDeltaHint: { confidence: -12, riskLevel: 9 },
  };
}

function makeVote(agentId: string): AgentVote {
  return {
    agentId,
    verdict: "pivot",
    confidence: 82,
    stateDeltaVote: { confidence: -10, riskLevel: 8 },
    rationale: "先补可信案例，再扩大投放。",
  };
}

function makeResult<T>(
  request: AiCallRequest,
  data: unknown,
): AiCallResult<T> {
  return {
    data: data as T,
    provider: request.modelProfile.provider,
    modelId: request.modelProfile.modelId,
    modelProfileId: request.modelProfile.id,
    latencyMs: 1,
  };
}
