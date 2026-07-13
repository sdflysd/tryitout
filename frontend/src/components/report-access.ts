import type { Report, Simulation } from "../types";

export function hasAgentInteractions(simulation: Simulation): boolean {
  return simulation.stages.some((stage) => Boolean(stage.interactions));
}

export function shouldShowDeepSection(
  simulation: Simulation,
  _deepReportUnlocked?: boolean,
): boolean {
  return hasAgentInteractions(simulation);
}

export function getVisibleActionPlan(
  plan: Report["actionPlan7Days"],
  _deepReportUnlocked?: boolean,
): Report["actionPlan7Days"] {
  return plan;
}
