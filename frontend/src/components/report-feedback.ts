import type { Simulation } from "../types";
import type { ClientValidationEvent } from "../validation-events";

export function buildReportViewedEvent(simulation: Simulation): ClientValidationEvent {
  return {
    type: "report_viewed",
    simulationId: simulation.id,
    scenarioType: simulation.type || simulation.userInput.type,
  };
}

export function createReportViewedTracker(): {
  shouldPost: (simulation: Simulation) => boolean;
} {
  const viewedSimulationIds = new Set<string>();
  return {
    shouldPost: (simulation: Simulation) => {
      if (viewedSimulationIds.has(simulation.id)) {
        return false;
      }

      viewedSimulationIds.add(simulation.id);
      return true;
    },
  };
}

export function buildFeedbackEvent(
  simulation: Simulation,
  input: { rating: string; usefulness: string; price: string; text: string },
): ClientValidationEvent {
  return {
    type: "feedback_submitted",
    simulationId: simulation.id,
    scenarioType: simulation.type || simulation.userInput.type,
    rating: input.rating,
    usefulness: input.usefulness,
    priceIntent: input.price,
    text: input.text,
  };
}
