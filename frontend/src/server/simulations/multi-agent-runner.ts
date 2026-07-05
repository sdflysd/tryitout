import { AiGateway } from "../ai/ai-gateway.js";
import type { ModelSelection } from "../ai/types.js";
import { splitAgentPool } from "./agent-pool.js";
import { emitSimulationProgress } from "./progress.js";
import { runStageInteraction } from "./stage-interaction-runner.js";
import {
  buildRouteComparisonPrompt,
  normalizeRouteComparison,
} from "./route-comparison.js";
import { updateAgentMemories } from "./agent-memory.js";
import { normalizeAgentPersonalities } from "./agent-personality.js";
import { buildStepSystemInstruction } from "./simulation-system-prompt.js";
import type {
  Agent,
  AgentAction,
  AgentRelationship,
  InteractionMode,
  Report,
  RouteComparison,
  SimulationProgressEvent,
  SimulationProgressStep,
  SimulationStage,
  SimulationType,
  UserInput,
  WorldState,
} from "../../types.js";

interface RunMultiAgentSimulationParams {
  gateway: AiGateway;
  simulationId: string;
  userInput: UserInput;
  modelSelection?: ModelSelection;
  interactionMode?: InteractionMode;
  onProgress?: (event: SimulationProgressEvent) => void;
}

interface RunStepParams {
  gateway: AiGateway;
  simulationId: string;
  type: SimulationType;
  step: SimulationProgressStep;
  userPrompt: string;
  modelSelection?: ModelSelection;
  stageIndex?: number;
  onProgress?: (event: SimulationProgressEvent) => void;
}

interface AgentsResponse {
  agents: Agent[];
}

interface WorldStateResponse {
  state: WorldState;
}

interface StageResponse {
  stage: SimulationStage;
}

interface ReportResponse {
  report: Report;
}

interface RouteComparisonResponse {
  routeComparison: RouteComparison;
}

export interface MultiAgentSimulationResult {
  agents: Agent[];
  stages: SimulationStage[];
  report: Report;
  routeComparison?: RouteComparison;
}

const STAGE_COUNT = 5;

export async function runMultiAgentSimulation({
  gateway,
  simulationId,
  userInput,
  modelSelection,
  interactionMode = "legacy",
  onProgress,
}: RunMultiAgentSimulationParams): Promise<MultiAgentSimulationResult> {
  const type = userInput.type;
  const agentsResponse = await runStep<AgentsResponse>({
    gateway,
    simulationId,
    type,
    step: "generate_agents",
    modelSelection,
    userPrompt: buildGenerateAgentsPrompt(type, userInput),
    onProgress,
  });
  const agents = normalizeAgentPersonalities(agentsResponse.agents);
  const agentPool = splitAgentPool(agents, type);
  let coreAgents = agentPool.coreAgents;
  const peripheralAgents = agentPool.peripheralAgents;

  const stateResponse = await runStep<WorldStateResponse>({
    gateway,
    simulationId,
    type,
    step: "initialize_world_state",
    modelSelection,
    userPrompt: buildInitializeWorldStatePrompt(type, userInput, coreAgents),
    onProgress,
  });

  let currentState = stateResponse.state;
  const stages: SimulationStage[] = [];
  const actionHistory = [] as AgentAction[];
  let relationships = [] as AgentRelationship[];

  const runLegacyStage = async (stageIndex: number): Promise<SimulationStage> => {
    const stageResponse = await runStep<StageResponse>({
      gateway,
      simulationId,
      type,
      step: "simulate_stage",
      modelSelection,
      stageIndex,
      userPrompt: buildSimulateStagePrompt({
        type,
        userInput,
        agents: coreAgents,
        currentState,
        previousStages: stages,
        stageIndex,
      }),
      onProgress,
    });

    return stageResponse.stage;
  };

  for (let stageIndex = 1; stageIndex <= STAGE_COUNT; stageIndex += 1) {
    if (interactionMode === "enabled") {
      const stageResult = await runStageInteraction({
        gateway,
        simulationId,
        type,
        stageIndex,
        userInput,
        currentState,
        coreAgents,
        peripheralAgents,
        actionHistory,
        relationships,
        modelSelection,
        fallbackStage: async () => runLegacyStage(stageIndex),
        onProgress,
      });
      const stage = stageResult.stage;

      stages.push(stage);
      if (stage.interactions) {
        actionHistory.push(...stage.interactions.actions);
        relationships = stage.interactions.relationships;
        coreAgents = updateAgentMemories({
          agents: coreAgents,
          actions: stage.interactions.actions,
          votes: stage.interactions.votes,
          relationships: stage.interactions.relationships,
        });
      }
      currentState = stage.stateAfter;
      continue;
    }

    const stage = await runLegacyStage(stageIndex);
    stages.push(stage);
    currentState = stage.stateAfter;
  }

  const reportResponse = await runStep<ReportResponse>({
    gateway,
    simulationId,
    type,
    step: "generate_report",
    modelSelection,
    userPrompt: buildGenerateReportPrompt(type, userInput, coreAgents, stages),
    onProgress,
  });

  let routeComparison: RouteComparison | undefined;
  try {
    const routeResponse = await runStep<RouteComparisonResponse>({
      gateway,
      simulationId,
      type,
      step: "generate_route_comparison",
      modelSelection,
      userPrompt: buildRouteComparisonPrompt({
        type,
        userInput,
        agents: coreAgents,
        stages,
      }),
      onProgress,
    });
    routeComparison = normalizeRouteComparison(
      routeResponse,
      stages.at(-1)?.stateAfter ?? currentState,
    );
  } catch {
    routeComparison = undefined;
  }

  return {
    agents: collectReportAgents(coreAgents, peripheralAgents, stages),
    stages,
    report: reportResponse.report,
    routeComparison,
  };
}

function collectReportAgents(
  coreAgents: Agent[],
  peripheralAgents: Agent[],
  stages: SimulationStage[],
): Agent[] {
  const knownAgents = new Map(
    [...coreAgents, ...peripheralAgents].map((agent) => [agent.id, agent]),
  );
  const participatedAgentIds = new Set<string>();

  for (const stage of stages) {
    const interactions = stage.interactions;
    if (!interactions) {
      continue;
    }

    for (const agentId of interactions.activatedAgentIds) {
      participatedAgentIds.add(agentId);
    }
    for (const action of interactions.actions) {
      participatedAgentIds.add(action.actorAgentId);
      if (action.targetAgentId) {
        participatedAgentIds.add(action.targetAgentId);
      }
    }
    for (const vote of interactions.votes) {
      participatedAgentIds.add(vote.agentId);
    }
    for (const relationship of interactions.relationships) {
      participatedAgentIds.add(relationship.fromAgentId);
      participatedAgentIds.add(relationship.toAgentId);
    }
  }

  const visiblePeripheralAgents = peripheralAgents.filter((agent) =>
    participatedAgentIds.has(agent.id),
  );

  return [...coreAgents, ...visiblePeripheralAgents].filter((agent, index, agents) =>
    agents.findIndex((candidate) => candidate.id === agent.id) === index &&
    knownAgents.has(agent.id),
  );
}

async function runStep<T>({
  gateway,
  simulationId,
  type,
  step,
  userPrompt,
  modelSelection,
  stageIndex,
  onProgress,
}: RunStepParams): Promise<T> {
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

function buildGenerateAgentsPrompt(type: SimulationType, userInput: UserInput): string {
  return `
${buildScenarioContext(type, userInput)}

请生成 7 个立场不同、能互相拉扯的 Agent。
只输出以下 JSON 结构：
{
  "agents": [
    {
      "id": "snake_case_id",
      "name": "角色名",
      "role": "角色职责",
      "stance": "支持/质疑/观望/拷打",
      "keyJudgment": "这个 Agent 对当前方案的一针见血判断",
      "objection": "它最担心或反对的点",
      "score": 0
    }
  ]
}
要求：agents 必须正好 7 个；id 必须稳定且能在后续阶段引用。
`;
}

function buildInitializeWorldStatePrompt(
  type: SimulationType,
  userInput: UserInput,
  agents: Agent[],
): string {
  return `
${buildScenarioContext(type, userInput)}

已生成 Agent：
${formatAgents(agents)}

请初始化推演世界状态。
只输出以下 JSON 结构：
{
  "state": {
    "day": 0,
    "productClarity": 30,
    "executionEnergy": 80,
    "trafficProgress": 10,
    "trialUsers": 0,
    "paidUsers": 0,
    "revenue": 0,
    "riskLevel": 40,
    "confidence": 50
  }
}
字段语义会随场景映射：恋爱场景中 productClarity=沟通契合度，trafficProgress=信任/亲密进展，revenue=情感默契值。
`;
}

function buildSimulateStagePrompt({
  type,
  userInput,
  agents,
  currentState,
  previousStages,
  stageIndex,
}: {
  type: SimulationType;
  userInput: UserInput;
  agents: Agent[];
  currentState: WorldState;
  previousStages: SimulationStage[];
  stageIndex: number;
}): string {
  return `
${buildScenarioContext(type, userInput)}

已生成 Agent：
${formatAgents(agents)}

当前世界状态：
${JSON.stringify(currentState, null, 2)}

${formatPreviousStages(previousStages)}

请只推演第 ${stageIndex} 阶段：${getStageBrief(type, stageIndex)}
只输出以下 JSON 结构：
{
  "stage": {
    "stageIndex": ${stageIndex},
    "timeRange": "第 X-X 天",
    "title": "阶段标题",
    "summary": "本阶段发生了什么，以及为什么合理",
    "events": [
      {
        "type": "${getDefaultEventType(type)}",
        "title": "事件标题",
        "description": "事件描述",
        "impact": "positive/negative/neutral"
      }
    ],
    "agentReactions": [
      {
        "agentId": "必须引用已生成 Agent 的 id",
        "agentName": "Agent 名称",
        "quote": "这个 Agent 的原话",
        "interpretation": "这句话背后的现实含义",
        "fieldAffected": "productClarity/executionEnergy/trafficProgress/trialUsers/paidUsers/revenue/riskLevel/confidence",
        "delta": 0
      }
    ],
    "stateAfter": {
      "day": 0,
      "productClarity": 0,
      "executionEnergy": 0,
      "trafficProgress": 0,
      "trialUsers": 0,
      "paidUsers": 0,
      "revenue": 0,
      "riskLevel": 0,
      "confidence": 0
    },
    "keyDecision": "下一步最关键的选择",
    "nextSuggestion": "下一步建议"
  }
}
要求：events 1-3 个，agentReactions 2-4 个；stateAfter 必须基于当前状态合理变化，所有分数保持 0-100。
`;
}

function buildGenerateReportPrompt(
  type: SimulationType,
  userInput: UserInput,
  agents: Agent[],
  stages: SimulationStage[],
): string {
  return `
${buildScenarioContext(type, userInput)}

Agent 列表：
${formatAgents(agents)}

5 个阶段推演结果：
${JSON.stringify(stages, null, 2)}

请基于以上分步推演生成最终评估报告。
只输出以下 JSON 结构：
{
  "report": {
    "projectName": "报告主题名",
    "successProbability": 0,
    "expectedRevenue": "最终可能结果描述",
    "riskLevel": "low/medium/high/very_high",
    "finalRecommendation": "最终建议",
    "scores": {
      "demandStrength": 0,
      "willingnessToPay": 0,
      "acquisitionDifficulty": 0,
      "competitionPressure": 0,
      "executionFit": 0,
      "monetizationClarity": 0
    },
    "finalOutcome": "30 天后的大概率结果",
    "opportunities": ["机会 1", "机会 2"],
    "risks": ["风险 1", "风险 2"],
    "pivotSuggestions": [
      {
        "title": "调整建议标题",
        "description": "调整建议说明"
      }
    ],
    "actionPlan7Days": [
      {
        "day": 1,
        "title": "第 1 天行动",
        "action": "具体动作"
      }
    ],
    "shouldDo": "strong_yes/test_small/not_directly/change_direction/not_recommended"
  }
}
要求：actionPlan7Days 必须正好 7 天；opportunities、risks、pivotSuggestions 各至少 2 条。
`;
}

function buildScenarioContext(type: SimulationType, userInput: UserInput): string {
  if (type === "side_hustle") {
    return `
场景：副业搞钱试错
副业项目想法: "${userInput.projectIdea}"
目标客户人群: "${userInput.targetUser || "未明确定义，由 AI 分析"}"
用户技能: "${userInput.skills?.join(", ") || "未填写"}"
每天能投入时间: "${userInput.dailyTime || "未填写"}"
起步资金/预算: "${userInput.budget || "未填写"}"
变现策略: "${userInput.monetization || "待推演"}"
流量渠道: "${userInput.acquisitionChannel?.join(", ") || "未填写"}"
个人状态: "${userInput.userStatus || "未填写"}"
`;
  }

  if (type === "dating") {
    return `
场景：恋爱沟通试错
恋爱状态关系: "${userInput.relationshipStatus || "暧昧纠结"}"
关系相识时长: "${userInput.datingDuration || "未指定"}"
对方性格特点: "${userInput.targetPersonality || "未指定"}"
聊天记录或核心冲突: "${userInput.chatLogOrIssue}"
打算采取的回复/沟通计划: "${userInput.proposedAction || "无"}"
`;
  }

  return `
场景：重大人生抉择试错
用户原始描述: "${userInput.decisionContext || "未填写"}"
已整理出的候选选择:
${formatLifeChoiceOptions(userInput)}
选项 A: "${userInput.optionA}"
选项 B: "${userInput.optionB}"
经济来源与安全垫: "${userInput.financialBuffer || "未指定"}"
家庭长辈支持力度: "${userInput.familySupport || "中规中矩"}"
最大恐惧担忧: "${userInput.coreFear || "未明确定义"}"
`;
}

function formatLifeChoiceOptions(userInput: UserInput): string {
  const options = userInput.lifeChoiceOptions?.filter((option) => option.title.trim());
  if (!options || options.length === 0) {
    return `A. ${userInput.optionA || "未填写"}\nB. ${userInput.optionB || "未填写"}`;
  }

  return options
    .map((option) => {
      const description = option.description ? ` - ${option.description}` : "";
      return `${option.label}. ${option.title}${description}`;
    })
    .join("\n");
}

function formatAgents(agents: Agent[]): string {
  return JSON.stringify(
    agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      stance: agent.stance,
      keyJudgment: agent.keyJudgment,
      objection: agent.objection,
    })),
    null,
    2,
  );
}

function formatPreviousStages(stages: SimulationStage[]): string {
  if (stages.length === 0) {
    return "已完成阶段：无。";
  }

  return `已完成阶段：
${JSON.stringify(
  stages.map((stage) => ({
    stageIndex: stage.stageIndex,
    title: stage.title,
    summary: stage.summary,
    stateAfter: stage.stateAfter,
    keyDecision: stage.keyDecision,
    nextSuggestion: stage.nextSuggestion,
  })),
  null,
  2,
)}`;
}

function getStageBrief(type: SimulationType, stageIndex: number): string {
  const briefs: Record<SimulationType, string[]> = {
    side_hustle: [
      "第 1-3 天，想法落地与最小验证",
      "第 4-7 天，第一波用户反馈与执行阻力",
      "第 8-15 天，流量、竞争和付费意愿检验",
      "第 16-23 天，成本、心态和现金流压力",
      "第 24-30 天，结果收束与是否继续判断",
    ],
    dating: [
      "第 1-3 天，破冰与回应测试",
      "第 4-7 天，关系暧昧与拉扯",
      "第 8-15 天，核心矛盾逼近",
      "第 16-23 天，信任重建或继续降温",
      "第 24-30 天，关系结局判定",
    ],
    life_choice: [
      "第 1-3 天，抉择撕裂期",
      "第 4-7 天，模拟尝试与沉没",
      "第 8-15 天，痛点爆发期",
      "第 16-23 天，机会成本怨念",
      "第 24-30 天，结果收束",
    ],
  };

  return briefs[type][stageIndex - 1] ?? `第 ${stageIndex} 阶段`;
}

function getDefaultEventType(type: SimulationType): string {
  if (type === "dating") {
    return "dating_response";
  }

  if (type === "life_choice") {
    return "reality_check";
  }

  return "execution";
}
