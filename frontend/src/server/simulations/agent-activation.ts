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

function scoreAgent(agent: Agent, event: Event, state: WorldState): number {
  return eventKeywordScore(agent, event) + stanceScore(agent, state) + memoryScore(agent, event, state);
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
