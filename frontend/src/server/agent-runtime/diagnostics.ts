import type {
  InteractionMode,
  SimulationRuntimeDiagnostics,
  SimulationStage,
  StageRuntimeMode,
} from "../../types.js";

interface BuildRuntimeDiagnosticsParams {
  requestedInteractionMode: InteractionMode;
  interactionModeUsed: InteractionMode;
  deepModeAvailable: boolean;
  stages: SimulationStage[];
}

export function buildRuntimeDiagnostics({
  requestedInteractionMode,
  interactionModeUsed,
  deepModeAvailable,
  stages,
}: BuildRuntimeDiagnosticsParams): SimulationRuntimeDiagnostics {
  const stageDiagnostics = stages.map((stage) => {
    const interactions = stage.interactions;
    const arbiterSummary = interactions?.arbiterSummary ?? "";
    const mode: StageRuntimeMode = !interactions
      ? "legacy"
      : /备用|fallback|不可用|失败/.test(arbiterSummary) ||
          interactions.activatedAgentIds.includes("fallback_arbiter_agent")
        ? "fallback"
        : "interactive";

    return {
      stageIndex: stage.stageIndex,
      mode,
      activatedAgentCount: interactions?.activatedAgentIds.length ?? 0,
      actionCount: interactions?.actions.length ?? 0,
      voteCount: interactions?.votes.length ?? 0,
      relationshipCount: interactions?.relationships.length ?? 0,
    };
  });

  return {
    requestedInteractionMode,
    interactionModeUsed,
    deepModeAvailable,
    fallbackStageCount: stageDiagnostics.filter((stage) => stage.mode === "fallback").length,
    stages: stageDiagnostics,
  };
}
