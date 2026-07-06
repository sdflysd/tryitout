import assert from "node:assert/strict";
import test from "node:test";

import { AiGateway } from "../ai/ai-gateway.js";
import { createCommercialSimulationGatewayForProvider } from "./commercial-provider-gateway.js";

test("platform provider runtime uses the platform gateway factory", () => {
  const platformGateway = new AiGateway("test-key", { adapters: [] });

  const gateway = createCommercialSimulationGatewayForProvider(
    { providerMode: "platform" },
    { createPlatformGateway: () => platformGateway },
  );

  assert.equal(gateway, platformGateway);
});

test("BYOK provider runtime creates an OpenAI-compatible user gateway", () => {
  const gateway = createCommercialSimulationGatewayForProvider({
    providerMode: "byok",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-user-secret",
  });

  const request = gateway.createRequest({
    step: "parse_scenario",
    scenarioType: "side_hustle",
    modelSelection: { mode: "balanced" },
    userPrompt: "private prompt",
  });

  assert.equal(request.modelProfile.provider, "openai_compatible");
  assert.equal(request.modelProfile.modelId, "gpt-4.1-mini");
  assert.equal(request.modelProfile.baseUrl, "https://api.openai.com/v1");
});
