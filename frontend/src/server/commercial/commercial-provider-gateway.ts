import { AiGateway, createUserOpenAiCompatibleGateway } from "../ai/ai-gateway.js";
import type { CommercialTaskProviderRuntime } from "./commercial-task-service.js";

export interface CommercialProviderGatewayOptions {
  createPlatformGateway?: () => AiGateway;
}

export function createCommercialSimulationGatewayForProvider(
  providerRuntime: CommercialTaskProviderRuntime,
  options: CommercialProviderGatewayOptions = {},
): AiGateway {
  if (providerRuntime.providerMode === "platform") {
    return options.createPlatformGateway?.() ?? new AiGateway();
  }

  return createUserOpenAiCompatibleGateway({
    apiKey: providerRuntime.apiKey,
    baseUrl: providerRuntime.baseUrl,
    model: providerRuntime.model,
  });
}
