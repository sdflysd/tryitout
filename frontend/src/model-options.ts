export interface PlatformModelOption {
  id: string;
  label: string;
  providerLabel?: string;
  modelId: string;
  quality?: "fast" | "balanced" | "deep";
}

export const PLATFORM_MODEL_SETTING_KEY = "platform.models.enabled";

export const DEFAULT_PLATFORM_MODEL_PROFILE_ID = "gemini_flash_balanced";

export const PLATFORM_MODEL_OPTIONS: PlatformModelOption[] = [
  {
    id: "gemini_flash_fast",
    label: "Gemini Flash Fast",
    providerLabel: "Gemini",
    modelId: "gemini-3.5-flash",
    quality: "fast",
  },
  {
    id: "gemini_flash_balanced",
    label: "Gemini Flash Balanced",
    providerLabel: "Gemini",
    modelId: "gemini-3.5-flash",
    quality: "balanced",
  },
  {
    id: "gemini_flash_deep",
    label: "Gemini Flash Deep",
    providerLabel: "Gemini",
    modelId: "gemini-3.5-flash",
    quality: "deep",
  },
  {
    id: "anthropic_haiku_fast",
    label: "Claude Haiku Fast",
    providerLabel: "Anthropic",
    modelId: "claude-3-5-haiku-latest",
    quality: "fast",
  },
  {
    id: "anthropic_sonnet_balanced",
    label: "Claude Sonnet Balanced",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-4-20250514",
    quality: "balanced",
  },
  {
    id: "anthropic_sonnet_deep",
    label: "Claude Sonnet Deep",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-4-20250514",
    quality: "deep",
  },
  {
    id: "openai_compatible_fast",
    label: "OpenAI Compatible Fast",
    providerLabel: "OpenAI Compatible",
    modelId: "configured fast model",
    quality: "fast",
  },
  {
    id: "openai_compatible_balanced",
    label: "OpenAI Compatible Balanced",
    providerLabel: "OpenAI Compatible",
    modelId: "configured balanced model",
    quality: "balanced",
  },
  {
    id: "openai_compatible_deep",
    label: "OpenAI Compatible Deep",
    providerLabel: "OpenAI Compatible",
    modelId: "configured deep model",
    quality: "deep",
  },
];

export function filterPlatformModelOptions(
  enabledModelProfileIds: string[],
): PlatformModelOption[] {
  const enabled = new Set(enabledModelProfileIds);
  return PLATFORM_MODEL_OPTIONS.filter((model) => enabled.has(model.id));
}

export function normalizePlatformModelProfileIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const knownIds = new Set(PLATFORM_MODEL_OPTIONS.map((model) => model.id));
  const normalized: string[] = [];
  for (const item of value) {
    if (
      typeof item === "string" &&
      knownIds.has(item) &&
      !normalized.includes(item)
    ) {
      normalized.push(item);
    }
  }
  return normalized;
}

export function isKnownPlatformModelProfileId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    PLATFORM_MODEL_OPTIONS.some((model) => model.id === value)
  );
}
