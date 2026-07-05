import type {
  Agent,
  AgentAction,
  AgentMemory,
  AgentRelationship,
  AgentVote,
} from "../../types.js";

const MAX_CLAIMS_REMEMBERED = 5;

export function updateAgentMemories({
  agents,
  actions,
  votes,
  relationships,
}: {
  agents: Agent[];
  actions: AgentAction[];
  votes: AgentVote[];
  relationships: AgentRelationship[];
}): Agent[] {
  return agents.map((agent) => {
    const memory = cloneMemory(agent.memory);

    for (const vote of votes) {
      if (vote.agentId === agent.id) {
        memory.lastPosition = vote.verdict;
      }
    }

    for (const action of actions) {
      if (action.actorAgentId !== agent.id) {
        continue;
      }

      memory.claimsRemembered = addClaim(memory.claimsRemembered, action.content);
      if (action.targetAgentId) {
        const shift = getTrustShift(action.type);
        if (shift !== 0) {
          memory.trustByAgentId[action.targetAgentId] = clampTrust(
            (memory.trustByAgentId[action.targetAgentId] ?? 50) + shift,
          );
        }
      }
    }

    for (const relationship of relationships) {
      if (relationship.fromAgentId === agent.id) {
        memory.trustByAgentId[relationship.toAgentId] = clampTrust(relationship.trust);
      }
    }

    return {
      ...agent,
      memory,
    };
  });
}

function cloneMemory(memory: AgentMemory | undefined): AgentMemory {
  return {
    trustByAgentId: { ...(memory?.trustByAgentId ?? {}) },
    claimsRemembered: [...(memory?.claimsRemembered ?? [])].slice(-MAX_CLAIMS_REMEMBERED),
    lastPosition: memory?.lastPosition,
  };
}

function addClaim(claims: string[], claim: string): string[] {
  const compact = claim.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!compact) {
    return claims.slice(-MAX_CLAIMS_REMEMBERED);
  }

  return [...claims.filter((item) => item !== compact), compact].slice(-MAX_CLAIMS_REMEMBERED);
}

function getTrustShift(type: AgentAction["type"]): number {
  if (type === "support" || type === "like") {
    return 6;
  }
  if (type === "challenge" || type === "warn" || type === "dislike") {
    return -6;
  }
  return 0;
}

function clampTrust(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
