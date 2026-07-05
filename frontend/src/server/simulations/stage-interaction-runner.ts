import { AiGateway } from "../ai/ai-gateway.js";
import type { ModelSelection } from "../ai/types.js";
import type {
  Agent,
  AgentAction,
  AgentRelationship,
  AgentVote,
  Event,
  SimulationProgressEvent,
  SimulationStage,
  SimulationType,
  UserInput,
  WorldState,
  WorldStateDelta,
} from "../../types.js";
import { selectActivatedAgents } from "./agent-activation.js";
import {
  buildAgentActionsPrompt,
  buildArbiterPrompt,
  buildWorldEventPrompt,
} from "./interaction-prompts.js";
import {
  applyStateDelta,
  clampStateDelta,
  mergeStateDeltas,
} from "./world-state.js";
import {
  validateAgentActionsResponse,
  validateArbiterResponse,
  validateWorldEventResponse,
} from "./interaction-validation.js";
import { emitSimulationProgress } from "./progress.js";
import { buildStepSystemInstruction } from "./simulation-system-prompt.js";

interface RunStageInteractionParams {
  gateway: AiGateway;
  simulationId: string;
  userInput: UserInput;
  stageIndex: number;
  currentState: WorldState;
  coreAgents: Agent[];
  peripheralAgents: Agent[];
  previousActions?: AgentAction[];
  actionHistory?: AgentAction[];
  relationships?: AgentRelationship[];
  modelSelection?: ModelSelection;
  fallbackStage?: SimulationStage | (() => SimulationStage | Promise<SimulationStage>);
  type?: SimulationType;
  onProgress?: (event: SimulationProgressEvent) => void;
}

interface WorldEventResponse {
  event: Event;
}

interface AgentActionsResponse {
  actions: AgentAction[];
  votes: AgentVote[];
}

interface ArbiterResponse {
  summary: string;
  acceptedAgentIds: string[];
  rejectedAgentIds: string[];
  finalDelta: WorldStateDelta;
  keyDecision: string;
  nextSuggestion: string;
}

type StepName = "generate_world_event" | "generate_agent_actions" | "arbitrate_stage";
type LocalInteractionTone = "positive" | "negative" | "neutral";
const MIN_DISCUSSION_ACTIONS = 6;
const REQUIRED_DISCUSSION_ACTION_TYPES: AgentAction["type"][] = [
  "challenge",
  "reply",
  "support",
  "warn",
  "vote",
];

function getRequiredActionCount(activatedAgentCount: number): number {
  return Math.max(MIN_DISCUSSION_ACTIONS, activatedAgentCount + 2);
}

export interface StageInteractionResult {
  stage: SimulationStage;
}

export async function runStageInteraction({
  gateway,
  simulationId,
  userInput,
  stageIndex,
  currentState,
  coreAgents,
  peripheralAgents,
  previousActions,
  actionHistory,
  relationships = [],
  modelSelection,
  fallbackStage,
  type = userInput.type,
  onProgress,
}: RunStageInteractionParams): Promise<StageInteractionResult> {
  try {
    return await runStageInteractionSteps({
      gateway,
      simulationId,
      userInput,
      stageIndex,
      currentState,
      coreAgents,
      peripheralAgents,
      previousActions,
      actionHistory,
      relationships,
      modelSelection,
      fallbackStage,
      type,
      onProgress,
    });
  } catch (error) {
    if (fallbackStage) {
      return {
        stage: await handleValidationFailure(
          fallbackStage,
          currentState,
          stageIndex,
        ),
      };
    }

    throw error;
  }
}

async function runStageInteractionSteps({
  gateway,
  simulationId,
  userInput,
  stageIndex,
  currentState,
  coreAgents,
  peripheralAgents,
  previousActions,
  actionHistory,
  relationships = [],
  modelSelection,
  fallbackStage,
  type = userInput.type,
  onProgress,
}: RunStageInteractionParams): Promise<StageInteractionResult> {
  const worldEventResponse = await runInteractionStep<WorldEventResponse>({
    gateway,
    simulationId,
    type,
    step: "generate_world_event",
    stageIndex,
    modelSelection,
    userPrompt: buildWorldEventPrompt({
      type,
      userInput,
      state: currentState,
      stageIndex,
    }),
    onProgress,
  });
  const eventValidation = validateWorldEventResponse(worldEventResponse);
  if (eventValidation.ok === false) {
    return {
      stage: await handleValidationFailure(
        fallbackStage,
        currentState,
        stageIndex,
      ),
    };
  }

  const event = eventValidation.value.event;
  const activatedAgents = selectActivatedAgents({
    coreAgents,
    peripheralAgents,
    event,
    state: currentState,
  });
  const priorActions = previousActions ?? actionHistory ?? [];
  const actionPromptMetadata = {
    activatedAgentCount: activatedAgents.length,
    requiredActionCount: getRequiredActionCount(activatedAgents.length),
    previousActionCount: priorActions.length,
  };

  let agentActionsResponse: AgentActionsResponse;
  try {
    agentActionsResponse = await runInteractionStep<AgentActionsResponse>({
      gateway,
      simulationId,
      type,
      step: "generate_agent_actions",
      stageIndex,
      modelSelection,
      userPrompt: buildAgentActionsPrompt({
        type,
        userInput,
        state: currentState,
        event,
        activatedAgents,
        previousActions: priorActions.slice(-20),
      }),
      metadata: actionPromptMetadata,
      onProgress,
    });
  } catch {
    return {
      stage: buildLocalInteractionStage({
        stageIndex,
        currentState,
        event,
        activatedAgents,
        relationships,
      }),
    };
  }

  const actionsValidation = validateAgentActionsResponse(agentActionsResponse);
  if (actionsValidation.ok === false) {
    return {
      stage: await handleValidationFailure(
        fallbackStage,
        currentState,
        stageIndex,
      ),
    };
  }

  const { actions, votes } = actionsValidation.value;
  const actionSetError = validateDenseActionSet(actions, activatedAgents);
  if (actionSetError) {
    return {
      stage: await handleValidationFailure(
        fallbackStage,
        currentState,
        stageIndex,
      ),
    };
  }
  const voteCoverageError = validateVoteCoverage(votes, activatedAgents);
  if (voteCoverageError) {
    return {
      stage: await handleValidationFailure(
        fallbackStage,
        currentState,
        stageIndex,
      ),
    };
  }

  const mergedVoteDelta = mergeStateDeltas(
    votes.map((vote) => vote.stateDeltaVote),
  );
  const relationshipUpdates = updateRelationshipsFromActions(relationships, actions);
  const updatedRelationships = ensureRelationships(relationshipUpdates, activatedAgents);

  const arbiterResponse = await runInteractionStep<ArbiterResponse>({
    gateway,
    simulationId,
    type,
    step: "arbitrate_stage",
    stageIndex,
    modelSelection,
    userPrompt: buildArbiterPrompt({
      type,
      state: currentState,
      event,
      actions,
      votes,
      mergedVoteDelta,
      relationships: updatedRelationships,
    }),
    onProgress,
  });
  const arbiterValidation = validateArbiterResponse(arbiterResponse);
  if (arbiterValidation.ok === false) {
    return {
      stage: await handleValidationFailure(
        fallbackStage,
        currentState,
        stageIndex,
      ),
    };
  }

  const arbiter = arbiterValidation.value;
  const arbiterDelta = clampStateDelta(arbiter.finalDelta, 10);
  const finalDelta = clampStateDelta(
    mergeStateDeltas([mergedVoteDelta, arbiterDelta]),
  );
  const stateAfter = applyStateDelta(currentState, {
    ...finalDelta,
    day: getStageEndDay(stageIndex),
  });

  return {
    stage: {
      stageIndex,
      timeRange: getStageTimeRange(stageIndex),
      title: event.title,
      summary: arbiter.summary,
      events: [event],
      agentReactions: buildAgentReactions(actions, activatedAgents, finalDelta),
      interactions: {
        activatedAgentIds: activatedAgents.map((agent) => agent.id),
        actions,
        votes,
        relationships: updatedRelationships,
        mergedVoteDelta,
        finalDelta,
        arbiterSummary: arbiter.summary,
      },
      stateAfter,
      keyDecision: arbiter.keyDecision,
      nextSuggestion: arbiter.nextSuggestion,
    },
  };
}

async function runInteractionStep<T>({
  gateway,
  simulationId,
  type,
  step,
  stageIndex,
  modelSelection,
  userPrompt,
  metadata,
  onProgress,
}: {
  gateway: AiGateway;
  simulationId: string;
  type: SimulationType;
  step: StepName;
  stageIndex: number;
  modelSelection?: ModelSelection;
  userPrompt: string;
  metadata?: {
    activatedAgentCount?: number;
    requiredActionCount?: number;
    previousActionCount?: number;
  };
  onProgress?: (event: SimulationProgressEvent) => void;
}): Promise<T> {
  emitSimulationProgress({
    simulationId,
    step,
    stageIndex,
    status: "started",
    onProgress,
  });

  const request = gateway.createRequest({
    step,
    scenarioType: type,
    modelSelection,
    systemPrompt: buildStepSystemInstruction(type),
    userPrompt,
    metadata: {
      simulationId,
      stageIndex,
      ...metadata,
    },
  });
  try {
    const result = await gateway.generateJson<T>(request);

    emitSimulationProgress({
      simulationId,
      step,
      stageIndex,
      status: "completed",
      onProgress,
    });

    return result.data;
  } catch (error) {
    emitSimulationProgress({
      simulationId,
      step,
      stageIndex,
      status: "failed",
      onProgress,
    });
    throw error;
  }
}

function buildLocalInteractionStage({
  stageIndex,
  currentState,
  event,
  activatedAgents,
  relationships,
}: {
  stageIndex: number;
  currentState: WorldState;
  event: Event;
  activatedAgents: Agent[];
  relationships: AgentRelationship[];
}): SimulationStage {
  const agents = ensureLocalAgents(activatedAgents);
  const actions = buildLocalActions(stageIndex, event, agents);
  const votes = buildLocalVotes(event, agents);
  const mergedVoteDelta = mergeStateDeltas(
    votes.map((vote) => vote.stateDeltaVote),
  );
  const finalDelta = clampStateDelta(mergedVoteDelta);
  const updatedRelationships = ensureRelationships(
    updateRelationshipsFromActions(relationships, actions),
    agents,
  );
  const stateAfter = applyStateDelta(currentState, {
    ...finalDelta,
    day: getStageEndDay(stageIndex),
  });

  return {
    stageIndex,
    timeRange: getStageTimeRange(stageIndex),
    title: event.title,
    summary: `本地保底互动：${event.title} 触发 ${agents.length} 个 Agent 形成压缩动作链，系统先按投票均值继续推进。`,
    events: [event],
    agentReactions: buildAgentReactions(actions, agents, finalDelta),
    interactions: {
      activatedAgentIds: agents.map((agent) => agent.id),
      actions,
      votes,
      relationships: updatedRelationships,
      mergedVoteDelta,
      finalDelta,
      arbiterSummary: `本地保底互动：动作生成超时或中断，已用事件、Agent 立场和当前状态生成可追踪的最小互动链。`,
    },
    stateAfter,
    keyDecision: getLocalKeyDecision(event),
    nextSuggestion: getLocalNextSuggestion(event),
  };
}

function ensureLocalAgents(agents: Agent[]): Agent[] {
  if (agents.length > 0) {
    return agents;
  }

  return [
    {
      id: "local_arbiter_agent",
      name: "本地裁判 Agent",
      role: "后端保底互动生成",
      layer: "arbiter",
      stance: "观望",
      keyJudgment: "先保留事件信号，用最小动作链继续推演。",
    },
  ];
}

function buildLocalActions(
  stageIndex: number,
  event: Event,
  agents: Agent[],
): AgentAction[] {
  const tone = getLocalInteractionTone(event);
  const delta = getLocalDeltaForTone(tone);
  const neutralDelta = { productClarity: 1, confidence: 1 };
  const actor = (index: number) => agents[index % agents.length];
  const target = (index: number, fallbackOffset = 1) => {
    if (agents.length === 1) {
      return `${agents[0].id}_self_check`;
    }
    return agents[(index + fallbackOffset) % agents.length].id;
  };

  return [
    {
      id: `local_like_${stageIndex}`,
      type: "like",
      actorAgentId: actor(0).id,
      targetAgentId: target(0),
      content: "先承认这个现实事件暴露出的有效信号。",
      reason: "本地互动需要保留模型已生成的世界事件，不直接丢弃本阶段。",
      impact: "positive",
      stateDeltaHint: {},
    },
    {
      id: `local_challenge_${stageIndex}`,
      type: "challenge",
      actorAgentId: actor(1).id,
      targetAgentId: target(1),
      content: `${event.title} 不能被轻描淡写，必须先看它对下一步选择的阻力。`,
      reason: event.description,
      impact: tone === "positive" ? "neutral" : "negative",
      stateDeltaHint: delta,
    },
    {
      id: `local_reply_${stageIndex}`,
      type: "reply",
      actorAgentId: actor(2).id,
      targetAgentId: target(2),
      content: "把争议收束成一个可验证动作，再决定是否继续放大投入。",
      reason: "回复质疑时优先形成低成本验证，而不是扩大承诺。",
      impact: "neutral",
      stateDeltaHint: neutralDelta,
    },
    {
      id: `local_support_${stageIndex}`,
      type: "support",
      actorAgentId: actor(3).id,
      targetAgentId: target(1, 2),
      content: "支持先用小样本反馈校准判断，避免一轮事件就过度反应。",
      reason: "互动链需要保留支持方与质疑方的拉扯。",
      impact: "positive",
      stateDeltaHint: { confidence: 1 },
    },
    {
      id: `local_warn_${stageIndex}`,
      type: "warn",
      actorAgentId: actor(4).id,
      targetAgentId: target(0),
      content: "当前结论来自压缩互动，需要在下一阶段继续观察真实反馈。",
      reason: "本地保底互动只承担继续推演和记录证据，不替代完整模型仲裁。",
      impact: "neutral",
      stateDeltaHint: { riskLevel: 1 },
    },
    {
      id: `local_vote_${stageIndex}`,
      type: "vote",
      actorAgentId: actor(5).id,
      content: "先按保守权重继续，并把下一步限定为低成本验证。",
      reason: "投票用于形成阶段状态变化，避免推演中断。",
      impact: tone,
      stateDeltaHint: delta,
    },
  ];
}

function buildLocalVotes(event: Event, agents: Agent[]): AgentVote[] {
  const tone = getLocalInteractionTone(event);

  return agents.map((agent, index) => {
    const cautious = /质疑|拷打/.test(agent.stance);
    const supportive = /支持/.test(agent.stance);
    const verdict: AgentVote["verdict"] =
      tone === "negative"
        ? cautious
          ? "pivot"
          : "wait"
        : tone === "positive" && supportive
          ? "continue"
          : "wait";

    return {
      agentId: agent.id,
      verdict,
      confidence: Math.max(52, Math.min(78, 64 + (supportive ? 6 : 0) - (cautious ? 4 : 0) + index)),
      stateDeltaVote: getLocalDeltaForAgentTone(tone, agent),
      rationale: `${agent.name} 基于“${event.title}”给出本地保底投票：先保守推进，并等待下一轮真实反馈。`,
    };
  });
}

function getLocalInteractionTone(event: Event): LocalInteractionTone {
  if (event.impact === "positive") {
    return "positive";
  }
  if (event.impact === "negative") {
    return "negative";
  }
  return "neutral";
}

function getLocalDeltaForAgentTone(
  tone: LocalInteractionTone,
  agent: Agent,
): WorldStateDelta {
  const cautious = /质疑|拷打/.test(agent.stance);
  const supportive = /支持/.test(agent.stance);

  if (tone === "positive") {
    return {
      productClarity: supportive ? 3 : 2,
      trafficProgress: 2,
      confidence: supportive ? 4 : 2,
      riskLevel: cautious ? 0 : -2,
    };
  }

  if (tone === "negative") {
    return {
      productClarity: cautious ? 2 : 1,
      executionEnergy: -2,
      confidence: cautious ? -5 : -3,
      riskLevel: cautious ? 5 : 3,
    };
  }

  return {
    productClarity: 2,
    confidence: supportive ? 2 : 1,
    riskLevel: cautious ? 2 : 0,
  };
}

function getLocalDeltaForTone(tone: LocalInteractionTone): WorldStateDelta {
  if (tone === "positive") {
    return { productClarity: 2, trafficProgress: 2, confidence: 3, riskLevel: -2 };
  }
  if (tone === "negative") {
    return { productClarity: 1, executionEnergy: -2, confidence: -4, riskLevel: 4 };
  }
  return { productClarity: 2, confidence: 1 };
}

function getLocalKeyDecision(event: Event): string {
  return `围绕“${event.title}”，是否先做低成本验证再继续投入？`;
}

function getLocalNextSuggestion(event: Event): string {
  return `下一阶段先记录“${event.title}”带来的真实反馈，用一个最小动作验证风险或机会是否持续存在。`;
}

async function handleValidationFailure(
  fallbackStage: RunStageInteractionParams["fallbackStage"],
  currentState: WorldState,
  stageIndex: number,
): Promise<SimulationStage> {
  let stage: SimulationStage | undefined;

  if (typeof fallbackStage === "function") {
    try {
      stage = await fallbackStage();
    } catch {
      return buildSafeMinimalFallbackStage({
        currentState,
        stageIndex,
      });
    }
  } else if (fallbackStage) {
    stage = fallbackStage;
  }

  if (!stage) {
    return buildSafeMinimalFallbackStage({
      currentState,
      stageIndex,
    });
  }

  return ensureFallbackInteractions(stage, currentState, stageIndex);
}

function ensureFallbackInteractions(
  stage: SimulationStage,
  currentState: WorldState,
  stageIndex: number,
): SimulationStage {
  if (stage.interactions) {
    return {
      ...stage,
      stateAfter: applyStateDelta(currentState, {
        ...clampStateDelta(stage.interactions.finalDelta),
        day: getStageEndDay(stageIndex),
      }),
      interactions: {
        ...stage.interactions,
        relationships: ensureRelationships(
          stage.interactions.relationships,
          [],
          getSafeFallbackAgentId(stage),
        ),
      },
    };
  }

  const fallbackDelta = deriveDeltaFromFallbackStage(currentState, stage);
  const finalDelta = clampStateDelta(fallbackDelta);
  const stateAfter = applyStateDelta(currentState, {
    ...finalDelta,
    day: getStageEndDay(stageIndex),
  });
  const primaryReaction = stage.agentReactions[0];
  const actorAgentId = primaryReaction?.agentId ?? "fallback_arbiter_agent";
  const actionContent =
    primaryReaction?.quote || stage.summary || "互动步骤失败，使用保守备用推演。";
  const actionReason =
    primaryReaction?.interpretation ||
    "互动输出不可用，改用 legacy 阶段结果生成最小安全互动。";
  const fallbackActions = buildFallbackActions({
    stageIndex,
    actorAgentId,
    content: actionContent,
    reason: actionReason,
    impact: getDeltaImpact(finalDelta),
    finalDelta,
  });

  return {
    ...stage,
    stateAfter,
    interactions: {
      activatedAgentIds: [actorAgentId],
      actions: fallbackActions,
      votes: [
        {
          agentId: actorAgentId,
          verdict: getFallbackVerdict(finalDelta),
          confidence: 50,
          stateDeltaVote: finalDelta,
          rationale: actionReason,
        },
      ],
      relationships: buildFallbackRelationships(actorAgentId),
      mergedVoteDelta: finalDelta,
      finalDelta,
      arbiterSummary: `互动步骤失败，已使用保守备用推演：${stage.summary}`,
    },
  };
}

function buildSafeMinimalFallbackStage({
  currentState,
  stageIndex,
}: {
  currentState: WorldState;
  stageIndex: number;
}): SimulationStage {
  const actorAgentId = "fallback_arbiter_agent";
  const finalDelta = clampStateDelta({ confidence: -2, riskLevel: 2 });
  const fallbackMessage = "互动输出不可用，系统已使用最小安全结果继续推演。";
  const stateAfter = applyStateDelta(currentState, {
    ...finalDelta,
    day: getStageEndDay(stageIndex),
  });
  const actions = buildFallbackActions({
    stageIndex,
    actorAgentId,
    content: "互动与备用推演均不可用，本阶段采用后端最小安全结果。",
    reason: fallbackMessage,
    impact: "negative",
    finalDelta,
  });

  return {
    stageIndex,
    timeRange: getStageTimeRange(stageIndex),
    title: "安全备用阶段",
    summary: "互动阶段输出不可用，系统生成最小安全阶段以保持推演继续。",
    events: [],
    agentReactions: buildAgentReactions(actions, [], finalDelta),
    interactions: {
      activatedAgentIds: [actorAgentId],
      actions,
      votes: [
        {
          agentId: actorAgentId,
          verdict: "wait",
          confidence: 50,
          stateDeltaVote: finalDelta,
          rationale: fallbackMessage,
        },
      ],
      relationships: buildFallbackRelationships(actorAgentId),
      mergedVoteDelta: finalDelta,
      finalDelta,
      arbiterSummary: fallbackMessage,
    },
    stateAfter,
    keyDecision: "保持保守推进，等待可用互动输出。",
    nextSuggestion: "使用当前状态继续下一阶段，并复查互动模型输出格式。",
  };
}

function buildFallbackActions({
  stageIndex,
  actorAgentId,
  content,
  reason,
  impact,
  finalDelta,
}: {
  stageIndex: number;
  actorAgentId: string;
  content: string;
  reason: string;
  impact: AgentAction["impact"];
  finalDelta: WorldStateDelta;
}): AgentAction[] {
  return [
    {
      id: `fallback_like_${stageIndex}`,
      type: "like",
      actorAgentId,
      content: "保留已有阶段推演中相对稳妥的部分。",
      reason,
      impact: "positive",
      stateDeltaHint: {},
    },
    {
      id: `fallback_reply_${stageIndex}`,
      type: "reply",
      actorAgentId,
      targetAgentId: `${actorAgentId}_self_check`,
      content: "先把争议点收束成一个可验证动作，再继续推进。",
      reason,
      impact: "neutral",
      stateDeltaHint: {},
    },
    {
      id: `fallback_support_${stageIndex}`,
      type: "support",
      actorAgentId,
      targetAgentId: `${actorAgentId}_self_check`,
      content: "保留当前阶段里仍有执行价值的路径。",
      reason: "即使互动输出不可用，也需要保留可执行部分，避免整轮推演失真。",
      impact: "positive",
      stateDeltaHint: {},
    },
    {
      id: `fallback_challenge_${stageIndex}`,
      type: "challenge",
      actorAgentId,
      content,
      reason,
      impact,
      stateDeltaHint: finalDelta,
    },
    {
      id: `fallback_warn_${stageIndex}`,
      type: "warn",
      actorAgentId,
      content: "互动模型输出不可用，本阶段结论需要按保守权重理解。",
      reason: "避免把备用推演误读为完整多 Agent 共识。",
      impact: "neutral",
      stateDeltaHint: {},
    },
    {
      id: `fallback_vote_${stageIndex}`,
      type: "vote",
      actorAgentId,
      content: "使用后端计算的保守 delta 作为本阶段投票结果。",
      reason,
      impact,
      stateDeltaHint: finalDelta,
    },
  ];
}

function validateDenseActionSet(actions: AgentAction[], activatedAgents: Agent[]): string | undefined {
  const actionTypes = actions.map((action) => action.type);
  const counts = new Map<AgentAction["type"], number>();

  for (const type of actionTypes) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const missingTypes = REQUIRED_DISCUSSION_ACTION_TYPES.filter((type) => !counts.has(type));
  const speakingAgentIds = new Set(actions.map((action) => action.actorAgentId));
  const silentAgentIds = activatedAgents
    .map((agent) => agent.id)
    .filter((agentId) => !speakingAgentIds.has(agentId));
  const targetedActionCount = actions.filter((action) => action.targetAgentId).length;

  if (actions.length >= MIN_DISCUSSION_ACTIONS && missingTypes.length === 0 && silentAgentIds.length === 0 && targetedActionCount >= 3) {
    return undefined;
  }

  return [
    `generate_agent_actions must contain at least ${MIN_DISCUSSION_ACTIONS} multi-agent discussion actions`,
    missingTypes.length > 0 ? `missing: ${missingTypes.join(", ")}` : undefined,
    silentAgentIds.length > 0 ? `silent activated agents: ${silentAgentIds.join(", ")}` : undefined,
    targetedActionCount < 3 ? `targeted actions: ${targetedActionCount}` : undefined,
    `received count: ${actions.length}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function validateVoteCoverage(votes: AgentVote[], activatedAgents: Agent[]): string | undefined {
  if (votes.length === 0) {
    return "generate_agent_actions must include at least one vote";
  }

  const votedAgentIds = new Set(votes.map((vote) => vote.agentId));
  const missingAgentIds = activatedAgents
    .map((agent) => agent.id)
    .filter((agentId) => !votedAgentIds.has(agentId));

  if (missingAgentIds.length === 0) {
    return undefined;
  }

  return `generate_agent_actions votes must cover activated agents; missing: ${missingAgentIds.join(", ")}`;
}

function ensureRelationships(
  relationships: AgentRelationship[],
  activatedAgents: Agent[],
  fallbackAgentId = "fallback_arbiter_agent",
): AgentRelationship[] {
  if (relationships.length > 0) {
    return relationships;
  }

  const [fromAgent, toAgent] = activatedAgents;
  if (fromAgent && toAgent) {
    return buildFallbackRelationships(fromAgent.id, toAgent.id);
  }

  const agentId = fromAgent?.id ?? fallbackAgentId;
  return buildFallbackRelationships(agentId);
}

function buildFallbackRelationships(
  fromAgentId: string,
  toAgentId = `${fromAgentId}_self_check`,
): AgentRelationship[] {
  return [
    {
      fromAgentId,
      toAgentId: toAgentId === fromAgentId ? `${fromAgentId}_self_check` : toAgentId,
      trust: 50,
      alignment: 0,
    },
  ];
}

function getSafeFallbackAgentId(stage: SimulationStage): string {
  return (
    stage.interactions?.activatedAgentIds[0] ??
    stage.interactions?.votes[0]?.agentId ??
    stage.interactions?.actions[0]?.actorAgentId ??
    stage.agentReactions[0]?.agentId ??
    "fallback_arbiter_agent"
  );
}

function deriveDeltaFromFallbackStage(
  currentState: WorldState,
  stage: SimulationStage,
): WorldStateDelta {
  return {
    productClarity: stage.stateAfter.productClarity - currentState.productClarity,
    executionEnergy: stage.stateAfter.executionEnergy - currentState.executionEnergy,
    trafficProgress: stage.stateAfter.trafficProgress - currentState.trafficProgress,
    trialUsers: stage.stateAfter.trialUsers - currentState.trialUsers,
    paidUsers: stage.stateAfter.paidUsers - currentState.paidUsers,
    revenue: stage.stateAfter.revenue - currentState.revenue,
    riskLevel: stage.stateAfter.riskLevel - currentState.riskLevel,
    confidence: stage.stateAfter.confidence - currentState.confidence,
  };
}

function getDeltaImpact(delta: WorldStateDelta): "positive" | "negative" | "neutral" {
  const confidence = delta.confidence ?? 0;
  const progress = delta.trafficProgress ?? 0;
  const risk = delta.riskLevel ?? 0;
  const score = confidence + progress - risk;

  if (score > 0) {
    return "positive";
  }
  if (score < 0) {
    return "negative";
  }

  return "neutral";
}

function getFallbackVerdict(delta: WorldStateDelta): AgentVote["verdict"] {
  const confidence = delta.confidence ?? 0;
  const progress = delta.trafficProgress ?? 0;
  const risk = delta.riskLevel ?? 0;

  if (risk >= 10 || confidence <= -10) {
    return "pivot";
  }
  if (confidence + progress > 0) {
    return "continue";
  }

  return "wait";
}

function buildAgentReactions(
  actions: AgentAction[],
  activatedAgents: Agent[],
  finalDelta: WorldStateDelta,
): SimulationStage["agentReactions"] {
  return actions
    .filter((action) =>
      action.type === "challenge" ||
      action.type === "warn" ||
      action.type === "support" ||
      action.type === "reply"
    )
    .slice(0, 4)
    .map((action) => {
      const delta = action.stateDeltaHint ?? finalDelta;
      const field = Object.keys(delta)[0] ?? "confidence";
      const deltaValue = Object.values(delta)[0] ?? 0;

      return {
        agentId: action.actorAgentId,
        agentName:
          activatedAgents.find((agent) => agent.id === action.actorAgentId)
            ?.name ?? action.actorAgentId,
        quote: action.content,
        interpretation: action.reason,
        fieldAffected: field,
        delta: deltaValue,
      };
    });
}

function updateRelationshipsFromActions(
  relationships: AgentRelationship[],
  actions: AgentAction[],
): AgentRelationship[] {
  const relationshipMap = new Map<string, AgentRelationship>();

  for (const relationship of relationships) {
    relationshipMap.set(relationshipKey(relationship), { ...relationship });
  }

  for (const action of actions) {
    if (!action.targetAgentId) {
      continue;
    }

    const key = `${action.actorAgentId}->${action.targetAgentId}`;
    const current =
      relationshipMap.get(key) ??
      {
        fromAgentId: action.actorAgentId,
        toAgentId: action.targetAgentId,
        trust: 50,
        alignment: 0,
      };
    const shift = getRelationshipShift(action);

    relationshipMap.set(key, {
      ...current,
      trust: clampRelationship(current.trust + shift.trust),
      alignment: clampRelationship(current.alignment + shift.alignment, -100, 100),
    });
  }

  return Array.from(relationshipMap.values());
}

function relationshipKey(relationship: AgentRelationship): string {
  return `${relationship.fromAgentId}->${relationship.toAgentId}`;
}

function getRelationshipShift(
  action: AgentAction,
): { trust: number; alignment: number } {
  if (action.type === "support" || action.type === "like") {
    return { trust: 4, alignment: 8 };
  }
  if (action.type === "challenge" || action.type === "warn") {
    return { trust: -3, alignment: -8 };
  }
  if (action.type === "dislike") {
    return { trust: -5, alignment: -10 };
  }

  return { trust: 0, alignment: 0 };
}

function clampRelationship(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getStageTimeRange(stageIndex: number): string {
  return (
    ["第 1-3 天", "第 4-7 天", "第 8-15 天", "第 16-23 天", "第 24-30 天"][
      stageIndex - 1
    ] ?? `第 ${stageIndex} 阶段`
  );
}

function getStageEndDay(stageIndex: number): number {
  return [3, 7, 15, 23, 30][stageIndex - 1] ?? stageIndex;
}
