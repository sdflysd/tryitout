import type { Agent, SimulationType } from "../../types.js";

export function assessAgentRoleCardQuality(
  agent: Agent,
  _type: SimulationType,
): { ok: boolean; reasons: string[] } {
  const roleCard = agent.roleCard;
  const reasons: string[] = [];

  if (!roleCard?.category) reasons.push("category_missing");
  if (!roleCard?.goal || isVagueGoal(roleCard.goal)) {
    reasons.push("goal_too_vague");
  }
  if (
    !roleCard?.triggerConditions?.length ||
    roleCard.triggerConditions.some((item) => /需要时|适当|情况/.test(item))
  ) {
    reasons.push("trigger_too_vague");
  }
  if (!roleCard?.decisionModel || roleCard.decisionModel.length < 12) {
    reasons.push("decision_model_too_short");
  }
  if (
    !roleCard?.forbiddenBehaviors?.some((item) =>
      /违法|操控|隐私|编造/.test(item),
    )
  ) {
    reasons.push("forbidden_behaviors_missing_safety");
  }

  return { ok: reasons.length === 0, reasons };
}

function isVagueGoal(goal: string): boolean {
  if (/分析问题|综合判断|帮助用户/.test(goal)) {
    return true;
  }

  return goal.length < 12 && !/案例|证据|边界|风险|最坏|成本|付费|信任|交付|投入|互动|继续|执行|后悔|机会/.test(goal);
}
