import type { Simulation, WorldStateDelta } from "../types";
import { formatWorldStateDelta } from "./simulation-variable-labels";

export interface AgentVoteRow {
  stageIndex: number;
  agentName: string;
  verdict: string;
  confidence: number;
  rationale: string;
}

export interface AgentEvidenceRow {
  stageIndex: number;
  agentName: string;
  verdict?: string;
  confidence?: number;
  rationale: string;
}

export interface AgentEvidenceRows {
  kind: "votes" | "reactions" | "empty";
  title: string;
  rows: AgentEvidenceRow[];
}

export interface ReportModeSummary {
  label: string;
  detail: string;
  tone: "deep" | "basic";
}

function formatDelta(simulation: Simulation, delta: WorldStateDelta): string {
  return formatWorldStateDelta(delta, simulation.type);
}

export function buildAgentVoteRows(simulation: Simulation): AgentVoteRow[] {
  const agentNameById = new Map(simulation.agents.map((agent) => [agent.id, agent.name]));
  return simulation.stages.flatMap((stage) =>
    (stage.interactions?.votes ?? []).map((vote) => ({
      stageIndex: stage.stageIndex,
      agentName: agentNameById.get(vote.agentId) ?? vote.agentId,
      verdict: vote.verdict,
      confidence: vote.confidence,
      rationale: vote.rationale,
    })),
  );
}

export function buildAgentEvidenceRows(simulation: Simulation): AgentEvidenceRows {
  const voteRows = buildAgentVoteRows(simulation);
  if (voteRows.length > 0) {
    return {
      kind: "votes",
      title: "Agent 投票",
      rows: voteRows,
    };
  }

  const reactionRows = simulation.stages.flatMap((stage) =>
    stage.agentReactions.map((reaction) => ({
      stageIndex: stage.stageIndex,
      agentName: reaction.agentName,
      rationale: `${reaction.quote} ${reaction.interpretation}`,
    })),
  );

  if (reactionRows.length > 0) {
    return {
      kind: "reactions",
      title: "Agent 观点",
      rows: reactionRows,
    };
  }

  return {
    kind: "empty",
    title: "Agent 观点",
    rows: [],
  };
}

export function getReportModeSummary(simulation: Simulation): ReportModeSummary {
  const fallbackStageCount = simulation.runtimeDiagnostics?.fallbackStageCount ?? 0;
  if (simulation.interactionModeUsed === "enabled" && fallbackStageCount > 0) {
    return {
      label: "深度 Agent 部分降级",
      detail: `${fallbackStageCount} 个阶段使用了保守备用推演，其余部分仍保留 Agent 动作与仲裁证据。`,
      tone: "basic",
    };
  }

  if (simulation.interactionModeUsed === "enabled" && simulation.stages.some((stage) => stage.interactions)) {
    return {
      label: "深度 Agent 已生效",
      detail: "本次报告包含 Agent 动作、投票和裁判仲裁。",
      tone: "deep",
    };
  }

  return {
    label: "基础推演报告",
    detail: "本次报告使用分步推演和 Agent 观点，不包含逐 Agent 投票。",
    tone: "basic",
  };
}

export function buildArbiterEvidence(simulation: Simulation): string[] {
  const interactiveEvidence = simulation.stages.flatMap((stage) => {
    if (!stage.interactions) {
      return [];
    }
    return [
      `第 ${stage.stageIndex} 阶段裁判：${stage.interactions.arbiterSummary}`,
      `第 ${stage.stageIndex} 阶段状态变化：${formatDelta(simulation, stage.interactions.finalDelta)}`,
    ];
  });

  if (interactiveEvidence.length > 0) {
    return interactiveEvidence.slice(0, 6);
  }

  return [
    ...simulation.report.opportunities.slice(0, 2).map((item) => `机会证据：${item}`),
    ...simulation.report.risks.slice(0, 2).map((item) => `风险证据：${item}`),
    ...simulation.stages.slice(0, 2).map((stage) => `阶段证据：${stage.summary}`),
  ].slice(0, 5);
}

export function buildKeyVariables(simulation: Simulation): string[] {
  const { scores } = simulation.report;
  const finalState = simulation.stages.at(-1)?.stateAfter;

  if (simulation.type === "dating") {
    return [
      `好感与信任：当前好感 ${scores.demandStrength}/100，信任 ${scores.willingnessToPay}/100，决定关系是否还能继续升温。`,
      `沟通阻力与雷区：当前评分 ${scores.acquisitionDifficulty}/100，阻力越高越需要放慢节奏、减少解释冲动。`,
      `外部阻力与情绪压力：当前评分 ${scores.competitionPressure}/100，会影响对方投入度和你的情绪稳定。`,
      finalState
        ? `关系风险与信心：最终彻底凉凉风险 ${finalState.riskLevel}/100，信心指数 ${finalState.confidence}/100，是是否继续推进的关键阈值。`
        : "关系风险与信心：缺少阶段状态，需要谨慎参考。",
    ];
  }

  if (simulation.type === "life_choice") {
    return [
      `主推方向潜力：当前评分 ${scores.demandStrength}/100，代表最想走那条路的长期想象空间。`,
      `备选方向潜力：当前评分 ${scores.willingnessToPay}/100，代表更稳或更现实选项的兜底价值。`,
      `现实阻力：主推阻力 ${scores.acquisitionDifficulty}/100，备选阻力 ${scores.competitionPressure}/100，决定是否需要组合策略。`,
      finalState
        ? `面包保障、悔恨与信心指数：最终面包保障 ${finalState.paidUsers}/100，悔恨与断粮风险 ${finalState.riskLevel}/100，信心指数 ${finalState.confidence}/100。`
        : "面包保障、悔恨与信心指数：缺少阶段状态，需要谨慎参考。",
    ];
  }

  return [
    `付费/接受意愿：当前评分 ${scores.willingnessToPay}/100，若真实反馈更强，结论会明显上调。`,
    `获客/破冰阻力：当前评分 ${scores.acquisitionDifficulty}/100，阻力越高越需要低成本测试。`,
    `竞争/外部压力：当前评分 ${scores.competitionPressure}/100，决定是否需要换定位。`,
    finalState
      ? `风险与信心：最终风险 ${finalState.riskLevel}/100，信心 ${finalState.confidence}/100，是是否继续的关键阈值。`
      : "风险与信心：缺少阶段状态，需要谨慎参考。",
  ];
}

export function buildAgentMemoryEvidence(simulation: Simulation): string[] {
  return simulation.agents
    .flatMap((agent) => {
      const memory = agent.memory;
      if (!memory || memory.claimsRemembered.length === 0) {
        return [];
      }

      const claim = memory.claimsRemembered.at(-1);
      if (!claim) {
        return [];
      }

      const position = memory.lastPosition ?? "继续观望";
      return `${agent.name} 记住了“${claim}”，因此后续判断转向 ${position}。`;
    })
    .slice(0, 4);
}
