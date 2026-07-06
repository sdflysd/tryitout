import type { Agent, Event, WorldState } from "../../types.js";

interface SelectActivatedAgentsParams {
  coreAgents: Agent[];
  peripheralAgents: Agent[];
  event: Event;
  state: WorldState;
}

const DEFAULT_CORE_ACTIVATION_LIMIT = 3;
const DEFAULT_PERIPHERAL_ACTIVATION_LIMIT = 2;

function eventKeywordScore(agent: Agent, event: Event): number {
  const text = `${agent.id} ${agent.name} ${agent.role} ${agent.keyJudgment}`.toLowerCase();
  const eventText = `${event.type} ${event.title} ${event.description}`.toLowerCase();
  const keywords = ["客户", "customer", "竞品", "competitor", "平台", "traffic", "父母", "family", "情绪", "dating", "现金", "risk"];

  return keywords.reduce((score, keyword) => {
    return score + (text.includes(keyword) && eventText.includes(keyword) ? 10 : 0);
  }, 0);
}

function stanceScore(agent: Agent, state: WorldState): number {
  if (state.riskLevel >= 55 && /质疑|拷打/.test(agent.stance)) {
    return 8;
  }
  if (state.confidence <= 45 && /支持/.test(agent.stance)) {
    return 4;
  }
  return 0;
}

function memoryScore(agent: Agent, event: Event, state: WorldState): number {
  const memory = agent.memory;
  if (!memory) {
    return 0;
  }

  let score = 0;
  if (memory.lastPosition && state.riskLevel >= 55) {
    score += 12;
  }

  const eventText = `${event.type} ${event.title} ${event.description}`.toLowerCase();
  for (const claim of memory.claimsRemembered) {
    const words = claim
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((word) => word.length >= 2);
    if (words.some((word) => eventText.includes(word))) {
      score += 12;
      break;
    }
  }

  for (const [agentId, trust] of Object.entries(memory.trustByAgentId)) {
    if (trust < 35 && eventText.includes(agentId.toLowerCase())) {
      score += 14;
      break;
    }
  }

  return score;
}

function roleCardTriggerScore(agent: Agent, event: Event): number {
  const eventText = `${event.title} ${event.description}`.toLowerCase();
  const triggers = agent.roleCard?.triggerConditions ?? [];
  return triggers.some((trigger) => {
    const normalized = trigger.trim().toLowerCase();
    return normalized.length >= 2 && eventText.includes(normalized);
  })
    ? 30
    : 0;
}

function roleCardCategoryScore(agent: Agent, event: Event): number {
  const category = agent.roleCard?.category;
  if (!category) {
    return 0;
  }

  if (event.type === "customer_feedback" && category === "stakeholder") {
    return 15;
  }
  if (event.type === "competitor_pressure" && category === "opposition_competition") {
    return 15;
  }
  if (
    ["platform_traffic", "external_influence", "reality_check"].includes(event.type) &&
    category === "environment_system"
  ) {
    return 15;
  }
  if (
    ["emotional_clash", "dating_response"].includes(event.type) &&
    (category === "stakeholder" || category === "user_inner_system")
  ) {
    return 15;
  }

  return 0;
}

function stateInfluenceScore(agent: Agent, state: WorldState): number {
  const influences = agent.roleCard?.stateInfluence ?? [];
  return influences.some((field) => isStateFieldUnderPressure(field, state)) ? 10 : 0;
}

function isStateFieldUnderPressure(field: string, state: WorldState): boolean {
  if (field === "riskLevel") {
    return state.riskLevel >= 70;
  }
  if (field === "confidence") {
    return state.confidence <= 35;
  }
  if (field === "executionEnergy") {
    return state.executionEnergy <= 35;
  }
  if (field === "productClarity") {
    return state.productClarity < 25;
  }
  if (field === "trafficProgress") {
    return state.trafficProgress < 25;
  }

  return false;
}

function scoreAgent(agent: Agent, event: Event, state: WorldState): number {
  return (
    eventKeywordScore(agent, event) +
    stanceScore(agent, state) +
    memoryScore(agent, event, state) +
    roleCardTriggerScore(agent, event) +
    roleCardCategoryScore(agent, event) +
    stateInfluenceScore(agent, state)
  );
}

function topByScore(agents: Agent[], event: Event, state: WorldState, limit: number): Agent[] {
  return [...agents]
    .sort((a, b) => scoreAgent(b, event, state) - scoreAgent(a, event, state) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function selectActivatedAgents({
  coreAgents,
  peripheralAgents,
  event,
  state,
}: SelectActivatedAgentsParams): Agent[] {
  const core = topByScore(coreAgents, event, state, DEFAULT_CORE_ACTIVATION_LIMIT);
  const peripheral = topByScore(peripheralAgents, event, state, DEFAULT_PERIPHERAL_ACTIVATION_LIMIT);
  return [...core, ...peripheral];
}
