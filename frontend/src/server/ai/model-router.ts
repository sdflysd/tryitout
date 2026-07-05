import type {
  ModelCapabilities,
  ModelProfile,
  ModelSelection,
  SimulationStep,
  SimulationType,
} from "./types.js";
import { getDefaultProfileForMode, getModelProfile } from "./model-profiles.js";
import { getPolicyForScenario } from "./model-policy.js";
import { validateModelSelection } from "./model-selection.schema.js";

export class ModelResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelResolutionError";
  }
}

export function resolveModel(
  selection: ModelSelection | undefined,
  scenarioType: SimulationType,
  step: SimulationStep,
): ModelProfile {
  const validated = validateModelSelection(selection);

  if (validated.ok === false) {
    throw new ModelResolutionError(validated.error);
  }

  const sel = validated.value;
  const policy = getPolicyForScenario(scenarioType);
  const stepConfig = policy.steps[step];

  if (!stepConfig) {
    throw new ModelResolutionError(`Unknown simulation step: ${String(step)}`);
  }

  if (sel.modelProfileId) {
    if (!stepConfig.allowUserOverride) {
      throw new ModelResolutionError("Model override not allowed for this step");
    }

    if (
      stepConfig.allowedUserProfileIds &&
      !stepConfig.allowedUserProfileIds.includes(sel.modelProfileId)
    ) {
      throw new ModelResolutionError("Model profile not allowed for this step");
    }

    const profile = getModelProfile(sel.modelProfileId);
    if (!profile) {
      throw new ModelResolutionError(`Unknown model profile: ${sel.modelProfileId}`);
    }
    if (profile.status !== "active") {
      throw new ModelResolutionError(
        `Model profile is not active: ${sel.modelProfileId}`,
      );
    }
    if (!profile.visibleToUser) {
      throw new ModelResolutionError(
        `Model profile not available to users: ${sel.modelProfileId}`,
      );
    }

    return profile;
  }

  if (sel.mode) {
    return getDefaultProfileForMode(sel.mode);
  }

  const profile = getModelProfile(stepConfig.modelProfileId);
  if (!profile) {
    throw new ModelResolutionError(
      `Policy default model profile not found: ${stepConfig.modelProfileId}`,
    );
  }

  return profile;
}

export function assertCapabilities(
  profile: ModelProfile,
  required: Partial<ModelCapabilities>,
): void {
  for (const [key, requiredValue] of Object.entries(required) as [
    keyof ModelCapabilities,
    ModelCapabilities[keyof ModelCapabilities],
  ][]) {
    const profileValue = profile.capabilities[key];

    if (
      typeof requiredValue === "number"
        ? typeof profileValue !== "number" || profileValue < requiredValue
        : profileValue !== requiredValue
    ) {
      throw new ModelResolutionError(
        `Model ${profile.id} does not meet capability requirement: ${key}=${String(requiredValue)}`,
      );
    }
  }
}
