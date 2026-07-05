import type { SimulationApiResponse, SimulationType } from "./types";
import type { ClientValidationEvent } from "./validation-events";

export function hasDeepInteractions(response: Pick<SimulationApiResponse, "stages">): boolean {
  return response.stages.some((stage) => Boolean(stage.interactions));
}

export function buildSimulationCompletedEvent({
  response,
  scenarioType,
  durationMs,
  deepModeRequested,
}: {
  response: SimulationApiResponse;
  scenarioType: SimulationType;
  durationMs: number;
  deepModeRequested: boolean;
}): ClientValidationEvent {
  const event: ClientValidationEvent = {
    type: "simulation_completed",
    simulationId: response.id,
    scenarioType,
    durationMs,
    deepModeRequested,
    deepModeAvailable: hasDeepInteractions(response),
  };

  if (response.runtimeDiagnostics?.fallbackStageCount !== undefined) {
    event.fallbackStageCount = response.runtimeDiagnostics.fallbackStageCount;
  }

  return event;
}

export function buildSimulationFailedEvent({
  scenarioType,
  durationMs,
  deepModeRequested,
  error,
}: {
  scenarioType: SimulationType;
  durationMs: number;
  deepModeRequested: boolean;
  error: unknown;
}): ClientValidationEvent {
  return {
    type: "simulation_failed",
    scenarioType,
    durationMs,
    deepModeRequested,
    errorCode: error instanceof Error ? error.message : "unknown_error",
  };
}
