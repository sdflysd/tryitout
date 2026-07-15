import assert from "node:assert/strict";
import test from "node:test";

import { AiGateway } from "../ai/ai-gateway.js";
import type { AiProviderAdapter } from "../ai/adapters/provider-adapter.js";
import type { AiCallRequest, AiCallResult } from "../ai/types.js";
import type {
  SimulationCheckpointSnapshot,
} from "./multi-agent-runner.js";
import { runMultiAgentSimulation } from "./multi-agent-runner.js";
import type {
  Agent,
  AgentAction,
  AgentVote,
  Report,
  SimulationProgressEvent,
  SimulationStage,
  UserInput,
  WorldState,
} from "../../types.js";

class StepwiseStubAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (request.step === "safety_check") {
      return makeResult<T>(request, { allowed: true, reason: "safe" });
    }

    if (request.step === "generate_agents") {
      return makeResult<T>(request, { agents: makeAgents() });
    }

    if (request.step === "initialize_world_state") {
      return makeResult<T>(request, { state: makeWorldState(0) });
    }

    if (request.step === "simulate_stage") {
      const stageIndex = request.metadata.stageIndex;
      assert.equal(typeof stageIndex, "number");

      return makeResult<T>(request, { stage: makeStage(stageIndex) });
    }

    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "dating_response",
          title: "对方短暂回应",
          description: "对方用一句轻量回复测试用户是否会继续施压。",
          impact: "neutral",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      return makeResult<T>(request, makeAgentActionsResponse(request));
    }

    if (request.step === "arbitrate_stage") {
      return makeResult<T>(request, {
        summary: "互动裁判认为低压回应被采纳，关系小幅回暖。",
        acceptedAgentIds: ["agent_1"],
        rejectedAgentIds: [],
        finalDelta: { trafficProgress: 3, confidence: 2 },
        keyDecision: "继续保持低压联系还是重新解释？",
        nextSuggestion: "继续轻量回应，避免长篇证明。",
      });
    }

    if (request.step === "generate_report") {
      return makeResult<T>(request, { report: makeReport() });
    }

    if (request.step === "generate_route_comparison") {
      return makeResult<T>(request, {
        routeComparison: makeRouteComparison(),
      });
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

class ThrowingRouteComparisonAdapter extends StepwiseStubAdapter {
  override async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    if (request.step === "generate_route_comparison") {
      this.calls.push(request);
      throw new Error("route comparison timeout");
    }

    return super.generateJson<T>(request);
  }
}

class MalformedAgentsThenRepairAdapter extends StepwiseStubAdapter {
  override async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    if (request.step === "generate_agents") {
      this.calls.push(request);
      const error = new SyntaxError("Unterminated string in JSON at position 1375");
      Object.assign(error, {
        code: "ai_json_parse_error",
        rawText: '{"agents":[{"id":"agent_1","name":"半截输出}',
      });
      throw error;
    }

    if (request.step === "json_repair") {
      this.calls.push(request);
      return makeResult<T>(request, { agents: makeAgents() });
    }

    return super.generateJson<T>(request);
  }
}

class ThrowingActionsWithLegacyFallbackAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;
  readonly calls: AiCallRequest[] = [];

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.calls.push(request);

    if (request.step === "safety_check") {
      return makeResult<T>(request, { allowed: true, reason: "safe" });
    }

    if (request.step === "generate_agents") {
      return makeResult<T>(request, { agents: makeAgents() });
    }

    if (request.step === "initialize_world_state") {
      return makeResult<T>(request, { state: makeWorldState(0) });
    }

    if (request.step === "generate_world_event") {
      return makeResult<T>(request, {
        event: {
          type: "dating_response",
          title: "对方继续观望",
          description: "对方没有拒绝，但也没有立刻拉近距离。",
          impact: "neutral",
        },
      });
    }

    if (request.step === "generate_agent_actions") {
      throw new Error("provider timeout while generating actions");
    }

    if (request.step === "simulate_stage") {
      const stageIndex = request.metadata.stageIndex;
      assert.equal(typeof stageIndex, "number");

      return makeResult<T>(request, { stage: makeExtremeFallbackStage(stageIndex) });
    }

    if (request.step === "generate_report") {
      return makeResult<T>(request, { report: makeReport() });
    }

    if (request.step === "generate_route_comparison") {
      return makeResult<T>(request, {
        routeComparison: makeRouteComparison(),
      });
    }

    throw new Error(`Unexpected simulation step: ${request.step}`);
  }
}

test("runMultiAgentSimulation runs separate agent, state, stage, and report steps", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-test",
    userInput: makeDatingInput(),
  });

  assert.equal(result.agents.length, 7);
  assert.equal(result.stages.length, 5);
  assert.equal(result.report.projectName, "冷淡破冰关系推演");
  assert.match(result.report.disclaimer ?? "", /模拟参考/);

  assert.deepEqual(
    adapter.calls.map((call) => call.step),
    [
      "safety_check",
      "generate_agents",
      "initialize_world_state",
      "simulate_stage",
      "simulate_stage",
      "simulate_stage",
      "simulate_stage",
      "simulate_stage",
      "generate_report",
      "generate_route_comparison",
    ],
  );
  assert.ok(!adapter.calls.some((call) => call.step === "full_simulation"));

  assert.deepEqual(
    adapter.calls
      .filter((call) => call.step === "simulate_stage")
      .map((call) => call.metadata.stageIndex),
    [1, 2, 3, 4, 5],
  );
});

test("runMultiAgentSimulation rejects unsafe input before agent generation", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  await assert.rejects(
    () =>
      runMultiAgentSimulation({
        gateway,
        simulationId: "sim-unsafe",
        userInput: {
          type: "dating",
          chatLogOrIssue: "我想用 PUA 套路操控对方并监控她。",
        },
      }),
    /不能帮你推演操控、欺骗、监控或侵犯隐私/,
  );

  assert.deepEqual(adapter.calls.map((call) => call.step), []);
});

test("runMultiAgentSimulation emits backend progress events in actual step order", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const progressEvents: SimulationProgressEvent[] = [];

  await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-progress",
    userInput: makeDatingInput(),
    onProgress: (event) => progressEvents.push(event),
  });

  assert.deepEqual(
    progressEvents
      .filter((event) => event.status === "started")
      .map((event) => `${event.step}:${event.stageIndex ?? ""}`),
    [
      "safety_check:",
      "generate_agents:",
      "initialize_world_state:",
      "simulate_stage:1",
      "simulate_stage:2",
      "simulate_stage:3",
      "simulate_stage:4",
      "simulate_stage:5",
      "generate_report:",
      "generate_route_comparison:",
    ],
  );

  assert.deepEqual(
    progressEvents
      .filter((event) => event.status === "completed")
      .map((event) => event.percent),
    [10, 20, 30, 40, 50, 60, 70, 80, 100, 100],
  );
  assert.equal(progressEvents.at(-1)?.step, "generate_route_comparison");
  assert.equal(progressEvents.at(-1)?.status, "completed");
  assert.equal(progressEvents.at(-1)?.percent, 100);
  assert.ok(progressEvents.every((event) => event.simulationId === "sim-progress"));
});

test("runMultiAgentSimulation repairs malformed JSON step output once before continuing", async () => {
  const adapter = new MalformedAgentsThenRepairAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-json-repair",
    userInput: makeDatingInput(),
  });

  assert.equal(result.agents.length, 7);
  assert.deepEqual(
    adapter.calls.slice(0, 4).map((call) => call.step),
    [
      "safety_check",
      "generate_agents",
      "json_repair",
      "initialize_world_state",
    ],
  );
  const repairCall = adapter.calls.find((call) => call.step === "json_repair");
  assert.ok(repairCall);
  assert.match(repairCall.userPrompt, /generate_agents/);
  assert.match(repairCall.userPrompt, /半截输出/);
});

test("runMultiAgentSimulation runs interactive stages when interaction mode is enabled", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-interactive",
    userInput: makeDatingInput(),
    interactionMode: "enabled",
  });

  assert.equal(result.stages.length, 5);
  assert.ok(result.stages.every((stage) => stage.interactions));
  assert.ok(adapter.calls.some((call) => call.step === "generate_agent_actions"));
  assert.ok(adapter.calls.some((call) => call.step === "arbitrate_stage"));
});

test("runMultiAgentSimulation returns peripheral agents that participated in deep mode", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-visible-peripheral-agents",
    userInput: makeDatingInput(),
    interactionMode: "enabled",
  });

  assert.equal(result.agents.some((agent) => agent.id === "family_pressure_agent"), true);
  assert.equal(result.agents.some((agent) => agent.id === "group_chat_agent"), true);
  assert.equal(result.agents.some((agent) => agent.layer === "peripheral"), true);
  assert.equal(result.agents.filter((agent) => agent.layer === "core").length, 7);
  assert.ok(result.agents.length > 7);
});

test("runMultiAgentSimulation wraps interactive action failures with safe fallback interactions", async () => {
  const adapter = new ThrowingActionsWithLegacyFallbackAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-interactive-fallback",
    userInput: makeDatingInput(),
    interactionMode: "enabled",
  });

  assert.equal(result.stages.length, 5);
  assert.ok(result.stages.every((stage) => stage.interactions));
  assert.equal(
    adapter.calls.filter((call) => call.step === "simulate_stage").length,
    0,
  );

  const firstStage = result.stages[0];
  assert.ok(firstStage.interactions);
  assert.ok(firstStage.interactions.actions.length > 0);
  assert.ok(firstStage.interactions.votes.length > 0);
  assert.ok(firstStage.interactions.mergedVoteDelta);
  assert.ok(firstStage.interactions.finalDelta);
  assert.ok(firstStage.interactions.arbiterSummary);
  assert.match(firstStage.interactions.arbiterSummary, /本地保底互动/);
  assert.doesNotMatch(firstStage.interactions.arbiterSummary, /互动步骤失败/);
  assert.equal(firstStage.stateAfter.day, 3);
  assert.notEqual(firstStage.stateAfter.confidence, 999);
  assert.notEqual(firstStage.stateAfter.riskLevel, -999);
  assert.ok(firstStage.stateAfter.confidence >= 0 && firstStage.stateAfter.confidence <= 100);
  assert.ok(firstStage.stateAfter.riskLevel >= 0 && firstStage.stateAfter.riskLevel <= 100);
});

test("runMultiAgentSimulation includes previous stages in later stage prompts", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-history",
    userInput: makeDatingInput(),
  });

  const fifthStageCall = adapter.calls.find(
    (call) => call.step === "simulate_stage" && call.metadata.stageIndex === 5,
  );

  assert.ok(fifthStageCall);
  assert.match(fifthStageCall.userPrompt, /已完成阶段/);
  assert.match(fifthStageCall.userPrompt, /阶段 1/);
  assert.match(fifthStageCall.userPrompt, /阶段 4/);
});

test("runMultiAgentSimulation resumes from saved checkpoint without rerunning completed setup", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });
  const checkpointAgents = makeAgents();
  const savedStages = [makeStage(1), makeStage(2)];
  const savedState = savedStages.at(-1)?.stateAfter ?? makeWorldState(6);
  const checkpointUpdates: SimulationCheckpointSnapshot[] = [];

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-resume",
    userInput: makeDatingInput(),
    resumeFrom: {
      agents: checkpointAgents,
      worldState: savedState,
      completedStages: savedStages,
      nextStep: "simulate_stage",
    },
    onCheckpoint: (checkpoint) => {
      checkpointUpdates.push(checkpoint);
    },
  });

  assert.equal(result.stages.length, 5);
  assert.deepEqual(
    adapter.calls.map((call) => `${call.step}:${call.metadata.stageIndex ?? ""}`),
    [
      "simulate_stage:3",
      "simulate_stage:4",
      "simulate_stage:5",
      "generate_report:",
      "generate_route_comparison:",
    ],
  );
  assert.equal(
    adapter.calls.some(
      (call) =>
        call.step === "safety_check" ||
        call.step === "generate_agents" ||
        call.step === "initialize_world_state",
    ),
    false,
  );
  assert.ok(
    checkpointUpdates.some(
      (checkpoint) =>
        checkpoint.nextStep === "generate_report" &&
        checkpoint.completedStages?.length === 5,
    ),
  );
});

test("runMultiAgentSimulation generates route comparison after report", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-route",
    userInput: makeDatingInput(),
  });

  assert.equal(result.routeComparison?.routes.length, 2);
  assert.deepEqual(
    adapter.calls.slice(-2).map((call) => call.step),
    ["generate_report", "generate_route_comparison"],
  );
});

test("runMultiAgentSimulation completes when route comparison fails", async () => {
  const adapter = new ThrowingRouteComparisonAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-route-fallback",
    userInput: makeDatingInput(),
  });

  assert.equal(result.report.projectName, "冷淡破冰关系推演");
  assert.equal(result.routeComparison, undefined);
});

test("runMultiAgentSimulation normalizes generated agent personalities", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-personality",
    userInput: makeDatingInput(),
  });

  assert.ok(result.agents.every((agent) => agent.personalityKernel));
});

test("runMultiAgentSimulation normalizes generated agent role cards", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  const result = await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-role-card",
    userInput: makeDatingInput(),
  });

  assert.ok(result.agents.every((agent) => agent.roleCard));
  assert.ok(result.agents.every((agent) => agent.roleCard?.triggerConditions.length));
});

test("runMultiAgentSimulation carries memory into later interactive stage prompts", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-memory",
    userInput: makeDatingInput(),
    interactionMode: "enabled",
  });

  const secondActionsCall = adapter.calls.find(
    (call) => call.step === "generate_agent_actions" && call.metadata.stageIndex === 2,
  );

  assert.ok(secondActionsCall);
  assert.match(secondActionsCall.userPrompt, /memory=last:continue/);
});

test("generate report prompt asks for agent-backed conclusions", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-report-agent-citations",
    userInput: makeDatingInput(),
  });

  const reportCall = adapter.calls.find((call) => call.step === "generate_report");
  assert.ok(reportCall);
  assert.match(reportCall.userPrompt, /每个核心结论必须引用至少一个 Agent/);
  assert.match(reportCall.userPrompt, /agentEvidence/);
  assert.match(reportCall.userPrompt, /disagreementSummary/);
  assert.match(reportCall.userPrompt, /自然语言字段不要输出 agent id/);
});

test("agent generation prompt keeps composition and role card guards", async () => {
  const adapter = new StepwiseStubAdapter();
  const gateway = new AiGateway("test-key", { adapters: [adapter] });

  await runMultiAgentSimulation({
    gateway,
    simulationId: "sim-generation-prompt-guards",
    userInput: makeDatingInput(),
  });

  const generateAgentsCall = adapter.calls.find((call) => call.step === "generate_agents");
  assert.ok(generateAgentsCall);
  assert.match(generateAgentsCall.userPrompt, /必须严格生成以下 7 个 Agent 槽位/);
  assert.match(generateAgentsCall.userPrompt, /category=stakeholder/);
  assert.match(generateAgentsCall.userPrompt, /forbiddenBehaviors/);
  assert.match(generateAgentsCall.userPrompt, /memoryPolicy/);
});

function makeDatingInput(): UserInput {
  return {
    type: "dating",
    relationshipStatus: "暧昧期突然冷淡",
    datingDuration: "1个月",
    targetPersonality: "慢热敏感",
    chatLogOrIssue: "我发了很长一段确认关系的话，对方回复变慢。",
    proposedAction: "先道歉，再给对方一点空间。",
  };
}

function makeAgents(): Agent[] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `agent_${index + 1}`,
    name: `关系 Agent ${index + 1}`,
    role: index === 0 ? "沟通发起者" : "关系观察者",
    stance: index % 2 === 0 ? "支持" : "质疑",
    keyJudgment: `第 ${index + 1} 个角色判断`,
    objection: "需要避免情绪上头",
    score: 60 + index,
  }));
}

function makeAgentActionsResponse(request: AiCallRequest): {
  actions: AgentAction[];
  votes: AgentVote[];
} {
  const stageIndex = request.metadata.stageIndex;
  assert.equal(typeof stageIndex, "number");
  const activatedIds = extractActivatedAgentIds(request.userPrompt);
  const ids = activatedIds.length > 0 ? activatedIds : ["agent_1", "agent_2", "agent_3"];
  const actionTypes: NonNullable<SimulationStage["interactions"]>["actions"][number]["type"][] = [
    "challenge",
    "reply",
    "support",
    "warn",
    "vote",
  ];
  const actions: AgentAction[] = ids.map((agentId, index) => ({
    id: `action_${stageIndex}_${index + 1}`,
    type: actionTypes[index % actionTypes.length],
    actorAgentId: agentId,
    targetAgentId: ids[(index + 1) % ids.length],
    content: `${agentId} 对低压推进给出阶段判断。`,
    reason: "每个激活 Agent 都需要参与本轮讨论。",
    impact: index % 2 === 0 ? "positive" : "negative",
    stateDeltaHint: index % 2 === 0 ? { trafficProgress: 2, confidence: 1 } : { riskLevel: 1 },
  }));

  while (actions.length < 6) {
    const index = actions.length;
    actions.push({
      id: `action_${stageIndex}_${index + 1}`,
      type: actionTypes[index % actionTypes.length],
      actorAgentId: ids[index % ids.length],
      targetAgentId: ids[(index + 1) % ids.length],
      content: "补充一轮回应，保持多 Agent 讨论密度。",
      reason: "动作数量需要达到讨论密度要求。",
      impact: "positive",
      stateDeltaHint: { confidence: 1 },
    });
  }

  const extraVisiblePeripheralActions = [
    {
      id: `action_family_challenge_${stageIndex}`,
      type: "challenge" as const,
      actorAgentId: "family_pressure_agent",
      targetAgentId: ids[0],
      content: "现实压力没有消失，不要把短暂回复误判成稳定关系。",
      reason: "外围压力 Agent 会提醒关系推进仍受现实约束。",
      impact: "negative" as const,
      stateDeltaHint: { riskLevel: 2 },
    },
    {
      id: `action_group_support_${stageIndex}`,
      type: "support" as const,
      actorAgentId: "group_chat_agent",
      targetAgentId: ids[0],
      content: "共同社交氛围保持正常，有助于降低私下沟通压力。",
      reason: "外围社交信号能支撑低压互动策略。",
      impact: "positive" as const,
      stateDeltaHint: { trafficProgress: 2 },
    },
  ];

  return {
    actions: [...actions, ...extraVisiblePeripheralActions],
    votes: ids.map((agentId, index) => ({
      agentId,
      verdict: index % 4 === 0 ? "wait" : "continue",
      confidence: 60 + index,
      stateDeltaVote: index % 2 === 0 ? { trafficProgress: 2, confidence: 1 } : { riskLevel: 1 },
      rationale: `${agentId} 认为低压推进仍需观察。`,
    })),
  };
}

function extractActivatedAgentIds(prompt: string): string[] {
  const match = prompt.match(/votes 数组要用简短 rationale 覆盖所有激活 Agent id：([^。\n]+)/);
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function makeWorldState(day: number): WorldState {
  return {
    day,
    productClarity: 30,
    executionEnergy: 80,
    trafficProgress: 10,
    trialUsers: 10,
    paidUsers: 0,
    revenue: 10,
    riskLevel: 40,
    confidence: 50,
  };
}

function makeStage(stageIndex: number): SimulationStage {
  return {
    stageIndex,
    timeRange: `第 ${stageIndex} 阶段`,
    title: `阶段 ${stageIndex}`,
    summary: `阶段 ${stageIndex} 的关系变化`,
    events: [
      {
        type: "dating_response",
        title: "对方回应",
        description: "对方开始观察你的表达是否稳定。",
        impact: "neutral",
      },
    ],
    agentReactions: [
      {
        agentId: "agent_2",
        agentName: "关系 Agent 2",
        quote: "我需要看到你不是一时情绪。",
        interpretation: "稳定表达比解释更多重要。",
        fieldAffected: "trafficProgress",
        delta: 5,
      },
    ],
    stateAfter: {
      ...makeWorldState(stageIndex * 3),
      trafficProgress: 10 + stageIndex * 8,
      confidence: 50 + stageIndex,
    },
    keyDecision: "继续轻量联系还是立刻追问？",
    nextSuggestion: "保持低压表达，观察对方反馈。",
  };
}

function makeExtremeFallbackStage(stageIndex: number): SimulationStage {
  return {
    ...makeStage(stageIndex),
    stateAfter: {
      day: 999,
      productClarity: 999,
      executionEnergy: -999,
      trafficProgress: 999,
      trialUsers: 999,
      paidUsers: 999,
      revenue: 999,
      riskLevel: -999,
      confidence: 999,
    },
  };
}

function makeReport(): Report {
  return {
    projectName: "冷淡破冰关系推演",
    successProbability: 62,
    expectedRevenue: "关系回到可沟通状态",
    riskLevel: "medium",
    finalRecommendation: "先降低压迫感，再用稳定行动重建安全感。",
    scores: {
      demandStrength: 60,
      willingnessToPay: 55,
      acquisitionDifficulty: 68,
      competitionPressure: 40,
      executionFit: 58,
      monetizationClarity: 50,
    },
    finalOutcome: "有机会缓和，但不适合继续高压表白。",
    opportunities: ["对方仍愿意回应", "道歉动作能降低防备"],
    risks: ["继续长篇解释会加重压力", "过度追问会触发退缩"],
    pivotSuggestions: [
      {
        title: "降低表达强度",
        description: "从证明自己转为照顾对方感受。",
      },
    ],
    actionPlan7Days: Array.from({ length: 7 }, (_, index) => ({
      day: index + 1,
      title: `第 ${index + 1} 天沟通`,
      action: "保持稳定、轻量、不追问。",
    })),
    shouldDo: "test_small",
  };
}

function makeRouteComparison() {
  const state = makeWorldState(30);
  return {
    recommendedRouteId: "space",
    routes: [
      {
        id: "direct",
        label: "A",
        title: "直接问清楚",
        premise: "把关系状态一次说开。",
        stageSummaries: ["快速确认边界"],
        finalState: state,
        successProbability: 42,
        regretRisk: 65,
        upside: "节省时间",
        downside: "容易给对方压力",
        triggerToChoose: "对方已经明确释放积极信号",
      },
      {
        id: "space",
        label: "B",
        title: "低压留白",
        premise: "先恢复可沟通氛围。",
        stageSummaries: ["降低解释强度"],
        finalState: state,
        successProbability: 64,
        regretRisk: 28,
        upside: "减少防备",
        downside: "推进较慢",
        triggerToChoose: "对方仍愿意轻量回应",
      },
    ],
    tradeoffs: ["速度 vs 安全感"],
    sensitivityVariables: ["对方回复频率"],
    sevenDayProbe: ["连续 3 天低压互动"],
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
