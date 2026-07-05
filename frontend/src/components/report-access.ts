import type { Report, Simulation } from "../types";

export function hasAgentInteractions(simulation: Simulation): boolean {
  return simulation.stages.some((stage) => Boolean(stage.interactions));
}

export function shouldShowDeepSection(
  simulation: Simulation,
  deepReportUnlocked: boolean,
): boolean {
  return deepReportUnlocked && hasAgentInteractions(simulation);
}

export function getVisibleActionPlan(
  plan: Report["actionPlan7Days"],
  deepReportUnlocked: boolean,
): Report["actionPlan7Days"] {
  return deepReportUnlocked ? plan : plan.slice(0, 3);
}
