import { DEFAULT_LANGUAGE, Language } from "../language";

export const START_SIMULATION_BUTTON_LABEL = "开始 30 天 Agent 博弈推演";

export function getStartSimulationButtonLabel(language: Language = DEFAULT_LANGUAGE): string {
  return language === "en-US" ? "Start 30-Day Agent Simulation" : START_SIMULATION_BUTTON_LABEL;
}
