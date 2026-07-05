import type { ModelProfile, ModelQuality } from "./types.js";
import {
  getConfiguredProvider,
  getProviderProfileIdForMode,
  readOpenAiCompatibleConfig,
} from "./provider-config.js";

const PROFILE_TIMESTAMP = "2026-06-26T00:00:00.000Z";

const GEMINI_BALANCED: ModelProfile = {
  id: "gemini_flash_balanced",
  name: "Gemini Flash Balanced",
  provider: "gemini",
  displayName: "Standard",
  modelId: "gemini-3.5-flash",
  visibleToUser: true,
  allowUserModelOverride: false,
  allowUserApiKey: false,
  allowCustomBaseUrl: false,
  capabilities: {
    supportsJsonMode: true,
    supportsStructuredOutput: true,
    supportsStreaming: false,
    supportsVision: false,
    supportsToolUse: false,
    supportsSystemPrompt: true,
    supportsReasoningEffort: false,
    supportsThinking: false,
    maxInputTokens: 1_048_576,
    maxOutputTokens: 16_384,
    recommendedForLongReport: true,
    recommendedForFastTasks: true,
    recommendedForDeepSimulation: false,
  },
  defaults: {
    maxOutputTokens: 8_192,
    quality: "balanced",
    responseFormat: "json",
    stream: false,
    timeoutMs: 120_000,
    maxRetries: 3,
  },
  limits: {
    maxInputChars: 20_000,
    maxOutputTokens: 16_384,
    maxRequestsPerUserPerDay: 20,
    maxCostUsdPerRequest: 0.01,
  },
  status: "active",
  createdAt: PROFILE_TIMESTAMP,
  updatedAt: PROFILE_TIMESTAMP,
};

const GEMINI_FAST: ModelProfile = {
  ...GEMINI_BALANCED,
  id: "gemini_flash_fast",
  name: "Gemini Flash Fast",
  displayName: "Fast",
  defaults: {
    ...GEMINI_BALANCED.defaults,
    quality: "fast",
    maxOutputTokens: 4_096,
  },
  capabilities: {
    ...GEMINI_BALANCED.capabilities,
    maxOutputTokens: 4_096,
    recommendedForLongReport: false,
    recommendedForFastTasks: true,
    recommendedForDeepSimulation: false,
  },
  limits: {
    ...GEMINI_BALANCED.limits,
    maxOutputTokens: 4_096,
  },
};

const GEMINI_DEEP: ModelProfile = {
  ...GEMINI_BALANCED,
  id: "gemini_flash_deep",
  name: "Gemini Flash Deep",
  displayName: "Deep",
  defaults: {
    ...GEMINI_BALANCED.defaults,
    quality: "deep",
    maxOutputTokens: 16_384,
  },
  capabilities: {
    ...GEMINI_BALANCED.capabilities,
    maxOutputTokens: 16_384,
    recommendedForFastTasks: false,
    recommendedForDeepSimulation: true,
  },
  limits: {
    ...GEMINI_BALANCED.limits,
    maxOutputTokens: 16_384,
  },
};

const ANTHROPIC_HAIKU_FAST: ModelProfile = {
  ...GEMINI_FAST,
  id: "anthropic_haiku_fast",
  name: "Claude Haiku Fast",
  provider: "anthropic",
  displayName: "Fast",
  modelId: "claude-3-5-haiku-latest",
  capabilities: {
    ...GEMINI_FAST.capabilities,
    supportsStructuredOutput: false,
    maxInputTokens: 200_000,
    maxOutputTokens: 4_096,
  },
};

const ANTHROPIC_SONNET_BALANCED: ModelProfile = {
  ...GEMINI_BALANCED,
  id: "anthropic_sonnet_balanced",
  name: "Claude Sonnet Balanced",
  provider: "anthropic",
  displayName: "Standard",
  modelId: "claude-sonnet-4-20250514",
  capabilities: {
    ...GEMINI_BALANCED.capabilities,
    supportsStructuredOutput: false,
    maxInputTokens: 200_000,
    maxOutputTokens: 8_192,
  },
  limits: {
    ...GEMINI_BALANCED.limits,
    maxOutputTokens: 8_192,
  },
};

const ANTHROPIC_SONNET_DEEP: ModelProfile = {
  ...ANTHROPIC_SONNET_BALANCED,
  id: "anthropic_sonnet_deep",
  name: "Claude Sonnet Deep",
  displayName: "Deep",
  defaults: {
    ...ANTHROPIC_SONNET_BALANCED.defaults,
    quality: "deep",
    maxOutputTokens: 16_384,
  },
  capabilities: {
    ...ANTHROPIC_SONNET_BALANCED.capabilities,
    maxOutputTokens: 16_384,
    recommendedForFastTasks: false,
    recommendedForDeepSimulation: true,
  },
  limits: {
    ...ANTHROPIC_SONNET_BALANCED.limits,
    maxOutputTokens: 16_384,
  },
};

function createOpenAiCompatibleProfile(
  id: string,
  quality: ModelQuality,
  modelId: string,
  baseUrl: string,
  maxOutputTokens: number,
): ModelProfile {
  return {
    ...GEMINI_BALANCED,
    id,
    name: `OpenAI Compatible ${quality}`,
    provider: "openai_compatible",
    displayName:
      quality === "fast" ? "Fast" : quality === "balanced" ? "Standard" : "Deep",
    modelId,
    allowCustomBaseUrl: false,
    allowedBaseUrls: baseUrl ? [baseUrl] : [],
    baseUrl,
    defaults: {
      ...GEMINI_BALANCED.defaults,
      quality,
      maxOutputTokens,
    },
    capabilities: {
      ...GEMINI_BALANCED.capabilities,
      maxInputTokens: 128_000,
      maxOutputTokens,
      recommendedForLongReport: quality !== "fast",
      recommendedForFastTasks: quality === "fast",
      recommendedForDeepSimulation: quality === "deep",
    },
    limits: {
      ...GEMINI_BALANCED.limits,
      maxOutputTokens,
    },
  };
}

function getOpenAiCompatibleProfiles(): Record<string, ModelProfile> {
  const config = readOpenAiCompatibleConfig();

  return {
    openai_compatible_fast: createOpenAiCompatibleProfile(
      "openai_compatible_fast",
      "fast",
      config.models.fast,
      config.baseUrl,
      4_096,
    ),
    openai_compatible_balanced: createOpenAiCompatibleProfile(
      "openai_compatible_balanced",
      "balanced",
      config.models.balanced,
      config.baseUrl,
      8_192,
    ),
    openai_compatible_deep: createOpenAiCompatibleProfile(
      "openai_compatible_deep",
      "deep",
      config.models.deep,
      config.baseUrl,
      16_384,
    ),
  };
}

function getProfiles(): Record<string, ModelProfile> {
  return {
    [GEMINI_BALANCED.id]: GEMINI_BALANCED,
    [GEMINI_FAST.id]: GEMINI_FAST,
    [GEMINI_DEEP.id]: GEMINI_DEEP,
    [ANTHROPIC_HAIKU_FAST.id]: ANTHROPIC_HAIKU_FAST,
    [ANTHROPIC_SONNET_BALANCED.id]: ANTHROPIC_SONNET_BALANCED,
    [ANTHROPIC_SONNET_DEEP.id]: ANTHROPIC_SONNET_DEEP,
    ...getOpenAiCompatibleProfiles(),
  };
}

export function getModelProfile(id: string): ModelProfile | undefined {
  return getProfiles()[id];
}

export function listVisibleModelProfiles(): ModelProfile[] {
  return Object.values(getProfiles()).filter(
    (profile) => profile.visibleToUser && profile.status === "active",
  );
}

export function getDefaultProfileForMode(mode: ModelQuality): ModelProfile {
  const provider = getConfiguredProvider();
  const profile = getModelProfile(getProviderProfileIdForMode(provider, mode));
  if (!profile) {
    throw new Error(`Default model profile not found for ${provider}/${mode}`);
  }

  return profile;
}
