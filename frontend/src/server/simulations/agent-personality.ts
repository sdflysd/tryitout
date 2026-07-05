import type { Agent, AgentPersonalityKernel, MbtiType } from "../../types.js";

const DEFAULT_MBTI_BY_STANCE: Record<string, MbtiType> = {
  支持: "ENFJ",
  质疑: "INTJ",
  观望: "ISTJ",
  拷打: "ENTP",
};

export function normalizeAgentPersonality(agent: Agent): Agent {
  const existing = agent.personalityKernel;
  const fallback = buildFallbackKernel(agent);

  return {
    ...agent,
    personalityKernel: {
      mbtiType: existing?.mbtiType ?? fallback.mbtiType,
      riskTolerance: clampScore(existing?.riskTolerance ?? fallback.riskTolerance),
      conflictStyle: existing?.conflictStyle ?? fallback.conflictStyle,
      evidencePreference: existing?.evidencePreference ?? fallback.evidencePreference,
      emotionalSensitivity: clampScore(existing?.emotionalSensitivity ?? fallback.emotionalSensitivity),
      persuasionThreshold: clampScore(existing?.persuasionThreshold ?? fallback.persuasionThreshold),
      memoryBias: existing?.memoryBias ?? fallback.memoryBias,
    },
  };
}

export function normalizeAgentPersonalities(agents: Agent[]): Agent[] {
  return agents.map((agent) => normalizeAgentPersonality(agent));
}

function buildFallbackKernel(agent: Agent): AgentPersonalityKernel {
  const roleText = `${agent.role} ${agent.name} ${agent.keyJudgment}`;
  const riskAnchored = /风险|质疑|拷打|压力|安全|失败|竞品|防备/.test(roleText);
  const customerLike = /客户|用户|TA|伴侣|父母|家人/.test(roleText);

  return {
    mbtiType: DEFAULT_MBTI_BY_STANCE[agent.stance] ?? "ISTJ",
    riskTolerance: /支持/.test(agent.stance) ? 68 : /质疑|拷打/.test(agent.stance) ? 34 : 50,
    conflictStyle: /拷打/.test(agent.stance)
      ? "provocative"
      : /质疑/.test(agent.stance)
        ? "probing"
        : /支持/.test(agent.stance)
          ? "diplomatic"
          : "avoidant",
    evidencePreference: riskAnchored ? "data" : customerLike ? "experience" : "social_proof",
    emotionalSensitivity: customerLike ? 72 : /拷打/.test(agent.stance) ? 38 : 55,
    persuasionThreshold: /质疑|拷打/.test(agent.stance) ? 72 : 55,
    memoryBias: riskAnchored ? "risk_anchored" : customerLike ? "trust_building" : "loss_averse",
  };
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
