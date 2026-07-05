import { SimulationRequest, UserInput } from "./types";

export function buildSimulationRequestBody(
  userInput: UserInput,
  options: { deepAgentMode?: boolean } = {},
): SimulationRequest {
  return {
    userInput,
    interactionMode: options.deepAgentMode ? "enabled" : "legacy",
  };
}
