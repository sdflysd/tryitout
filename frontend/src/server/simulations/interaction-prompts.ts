import type {
  Agent,
  AgentAction,
  AgentRelationship,
  AgentVote,
  Event,
  SimulationType,
  UserInput,
  WorldState,
  WorldStateDelta,
} from "../../types.js";

interface WorldEventPromptParams {
  type: SimulationType;
  userInput: UserInput;
  state: WorldState;
  stageIndex: number;
}

interface AgentActionsPromptParams {
  type: SimulationType;
  userInput: UserInput;
  state: WorldState;
  event: Event;
  activatedAgents: Agent[];
  previousActions: AgentAction[];
}

interface ArbiterPromptParams {
  type: SimulationType;
  state: WorldState;
  event: Event;
  actions: AgentAction[];
  votes: AgentVote[];
  mergedVoteDelta: WorldStateDelta;
  relationships: AgentRelationship[];
}

function scenarioLabel(type: SimulationType): string {
  if (type === "dating") return "恋爱沟通";
  if (type === "life_choice") return "人生抉择";
  return "副业搞钱";
}

function eventTypeLabels(type: SimulationType): string {
  if (type === "dating") {
    return "dating_response/emotional_clash/external_influence/reality_check";
  }
  if (type === "life_choice") {
    return "execution/external_influence/reality_check";
  }
  return "execution/customer_feedback/competitor_pressure/platform_traffic/external_influence/monetization_attempt/reality_check";
}

function scenarioCaveat(type: SimulationType): string {
  if (type === "dating") {
    return "注意：trialUsers/paidUsers/revenue 等复用世界状态键只是固定 JSON 字段名；所有 content/reason/rationale 文本必须保持恋爱/关系语言，不要写成商业、客户、付费、产品。";
  }
  if (type === "life_choice") {
    return "注意：trialUsers/paidUsers/revenue 等复用世界状态键只是固定 JSON 字段名；所有 content/reason/rationale 文本必须保持人生抉择、机会成本、现实压力语言。";
  }
  return "";
}

function compactUserInput(input: UserInput): string {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${compactValue(value)}`)
    .join("; ");
}

function compactValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => compactValue(item)).join(" / ");
  }
  if (typeof value === "object" && value !== null) {
    if (isLifeChoiceOptionLike(value)) {
      const label = String(value.label ?? "").trim();
      const title = String(value.title ?? "").trim();
      const description = String(value.description ?? "").trim();
      return `${label ? `${label}. ` : ""}${title}${description ? ` - ${description}` : ""}`;
    }
    return JSON.stringify(value);
  }

  return String(value);
}

function isLifeChoiceOptionLike(value: object): value is {
  label?: unknown;
  title?: unknown;
  description?: unknown;
} {
  return "title" in value && "label" in value;
}

function compactState(state: WorldState): string {
  return Object.entries(state)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function compactEvent(event: Event): string {
  return `${event.type} | ${event.title} | ${event.impact} | ${event.description}`;
}

function compactAgents(agents: Agent[]): string {
  return agents
    .map((agent) =>
      `${agent.id}(${agent.name}; role=${agent.role}; stance=${agent.stance ?? "n/a"}; judgment=${agent.keyJudgment ?? "n/a"}; ${compactPersonality(agent)}; ${compactMemory(agent)})`,
    )
    .join(" | ");
}

function compactPersonality(agent: Agent): string {
  const kernel = agent.personalityKernel;
  if (!kernel) {
    return "personality=n/a";
  }

  return [
    `personality=${kernel.mbtiType}`,
    `risk:${kernel.riskTolerance}`,
    `conflict:${kernel.conflictStyle}`,
    `evidence:${kernel.evidencePreference}`,
  ].join("; ");
}

function compactMemory(agent: Agent): string {
  const memory = agent.memory;
  if (!memory) {
    return "memory=none";
  }

  const lowTrustIds = Object.entries(memory.trustByAgentId)
    .filter(([, trust]) => trust < 35)
    .map(([agentId]) => agentId)
    .slice(0, 2);
  const claims = memory.claimsRemembered.slice(-2);

  return [
    `memory=last:${memory.lastPosition ?? "none"}`,
    `claims:${claims.length}`,
    lowTrustIds.length > 0 ? `trustLow:${lowTrustIds.join("/")}` : "trustLow:none",
  ].join("; ");
}

function compactPreviousActions(actions: AgentAction[]): string {
  if (actions.length === 0) {
    return "none";
  }

  return actions
    .slice(-20)
    .map((action) =>
      `${action.id}:${action.type} ${action.actorAgentId}->${action.targetAgentId ?? "world"} impact=${action.impact}`,
    )
    .join(" | ");
}

export function buildWorldEventPrompt({ type, userInput, state, stageIndex }: WorldEventPromptParams): string {
  return `
你是 TryItOut 沙盘的世界事件生成器。
场景：${scenarioLabel(type)}
第 ${stageIndex} 阶段。
用户输入：
${JSON.stringify(userInput, null, 2)}
当前世界状态：
${JSON.stringify(state, null, 2)}

请生成本阶段最可能触发 Agent 冲突的 1 个现实事件。
只输出合法 JSON，不要输出 Markdown，不要输出代码块：
{
  "event": {
    "type": "${eventTypeLabels(type)}",
    "title": "事件标题",
    "description": "事件描述",
    "impact": "positive/negative/neutral"
  }
}
`;
}

export function buildAgentActionsPrompt({
  type,
  userInput,
  state,
  event,
  activatedAgents,
  previousActions,
}: AgentActionsPromptParams): string {
  const requiredActionCount = Math.max(6, activatedAgents.length + 2);
  return `
你是 TryItOut 的多 Agent 交互引擎。
场景：${scenarioLabel(type)}
用户输入摘要：${compactUserInput(userInput)}
当前世界状态：${compactState(state)}
本轮事件：${compactEvent(event)}
本轮激活 Agent：${compactAgents(activatedAgents)}
此前动作摘要：${compactPreviousActions(previousActions)}

请输出至少 ${requiredActionCount} 个动作，必须像一次真实多 Agent 讨论，而不是静态标签。
动作类型必须覆盖：challenge, reply, support, warn, vote；可以额外使用 like/dislike/update_memory。
每个激活 Agent 至少要作为 actorAgentId 发声一次；至少 3 个动作必须填写 targetAgentId，展示谁正在回应、支持或质疑谁。
reply/support/challenge/warn 要形成来回交互链路；vote 动作代表阶段性判断。
votes 数组要用简短 rationale 覆盖所有激活 Agent id：${activatedAgents.map((agent) => agent.id).join(", ")}。
stateDeltaVote 只能包含 day/productClarity/executionEnergy/trafficProgress/trialUsers/paidUsers/revenue/riskLevel/confidence。
${scenarioCaveat(type)}
只输出合法 JSON，不要输出 Markdown，不要输出代码块：
{
  "actions": [
    {
      "id": "act_stage_agent_index",
      "type": "challenge/reply/support/warn/vote/like/dislike/update_memory",
      "actorAgentId": "agent_id",
      "targetAgentId": "被回应、支持或质疑的 agent_id；vote 可省略",
      "content": "一句话动作内容",
      "reason": "一句话原因",
      "impact": "positive/negative/neutral",
      "stateDeltaHint": { "confidence": -5 }
    }
  ],
  "votes": [
    {
      "agentId": "agent_id",
      "verdict": "continue/pivot/stop/wait/escalate",
      "confidence": 0,
      "stateDeltaVote": { "riskLevel": 5, "confidence": -3 },
      "rationale": "一句话投票理由"
    }
  ]
}
`;
}

export function buildArbiterPrompt({
  type,
  state,
  event,
  actions,
  votes,
  mergedVoteDelta,
  relationships,
}: ArbiterPromptParams): string {
  return `
你是 TryItOut 的裁判 Agent，负责裁决多 Agent 冲突。
场景：${scenarioLabel(type)}
当前世界状态：
${JSON.stringify(state, null, 2)}
本轮事件：
${JSON.stringify(event, null, 2)}
Agent 动作：
${JSON.stringify(actions, null, 2)}
Agent 投票：
${JSON.stringify(votes, null, 2)}
后端已合并的投票 delta：
${JSON.stringify(mergedVoteDelta, null, 2)}
当前关系图：
${JSON.stringify(relationships, null, 2)}

请判断哪些观点成立，哪些观点被反驳，并给出裁判权重 delta。
注意：最终状态由后端根据 Agent 投票合并值和你的权重 delta 共同计算。你的 finalDelta 是裁判对投票倾向的权重建议，不要重复抄写全部投票结果；单项不要超过 10 分。
只输出合法 JSON，不要输出 Markdown，不要输出代码块：
{
  "summary": "裁判总结",
  "acceptedAgentIds": ["agent_id"],
  "rejectedAgentIds": ["agent_id"],
  "finalDelta": { "confidence": -5, "riskLevel": 8 },
  "keyDecision": "下一步关键选择",
  "nextSuggestion": "下一步建议"
}
`;
}
