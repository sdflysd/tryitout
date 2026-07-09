import type {
  AgentModelPolicy,
  ModelQuality,
  SimulationType,
  StepModelConfig,
} from "./types.js";
import {
  getConfiguredProvider,
  getProviderProfileIdForMode,
} from "./provider-config.js";

function defaultStep(
  profileId: string,
  quality: ModelQuality,
  maxOutputTokens: number,
  timeoutMs: number,
  maxRetries = 3,
): StepModelConfig {
  return {
    modelProfileId: profileId,
    allowUserOverride: true,
    quality,
    requiredCapabilities: { maxOutputTokens },
    maxOutputTokens,
    timeoutMs,
    maxRetries,
  };
}

function createPolicySteps(): AgentModelPolicy["steps"] {
  const provider = getConfiguredProvider();
  const fastProfileId = getProviderProfileIdForMode(provider, "fast");
  const balancedProfileId = getProviderProfileIdForMode(provider, "balanced");
  const deepProfileId = getProviderProfileIdForMode(provider, "deep");

  return {
    full_simulation: defaultStep(
      deepProfileId,
      "deep",
      16_384,
      120_000,
      1,
    ),
    parse_scenario: defaultStep(fastProfileId, "fast", 4_096, 30_000),
    generate_agents: defaultStep(
      balancedProfileId,
      "balanced",
      8_192,
      120_000,
    ),
    initialize_world_state: defaultStep(fastProfileId, "fast", 4_096, 30_000),
    simulate_stage: defaultStep(
      balancedProfileId,
      "balanced",
      8_192,
      60_000,
    ),
    generate_world_event: defaultStep(fastProfileId, "fast", 2_048, 30_000),
    generate_agent_actions: defaultStep(
      balancedProfileId,
      "balanced",
      8_192,
      150_000,
      1,
    ),
    arbitrate_stage: defaultStep(
      balancedProfileId,
      "balanced",
      4_096,
      45_000,
    ),
    generate_report: defaultStep(
      deepProfileId,
      "deep",
      16_384,
      120_000,
      1,
    ),
    generate_route_comparison: defaultStep(
      balancedProfileId,
      "balanced",
      8_192,
      60_000,
      1,
    ),
    generate_share_card: defaultStep(fastProfileId, "fast", 4_096, 30_000),
    json_repair: defaultStep(fastProfileId, "fast", 4_096, 30_000),
    safety_check: defaultStep(fastProfileId, "fast", 2_048, 20_000),
  };
}

export function getPolicyForScenario(type: SimulationType): AgentModelPolicy {
  return {
    scenarioType: type,
    steps: createPolicySteps(),
  };
}
