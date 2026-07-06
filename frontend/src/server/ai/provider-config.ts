import { AnthropicAdapter } from "./adapters/anthropic.adapter.js";
import { GeminiAdapter } from "./adapters/gemini.adapter.js";
import { OpenAiCompatibleAdapter } from "./adapters/openai-compatible.adapter.js";
import type { AiProviderAdapter } from "./adapters/provider-adapter.js";
import type { AiProviderType, ModelProfile, ModelQuality } from "./types.js";

type Env = Record<string, string | undefined>;

export type ConfigurableProvider = Extract<
  AiProviderType,
  "gemini" | "anthropic" | "openai_compatible"
>;

export interface OpenAiCompatibleConfig {
  apiKey: string;
  baseUrl: string;
  models: Record<ModelQuality, string>;
}

const DEFAULT_OPENAI_COMPATIBLE_MODELS: Record<ModelQuality, string> = {
  fast: "gpt-4o-mini",
  balanced: "gpt-4o",
  deep: "gpt-4o",
};

let configuredProviderOverride: ConfigurableProvider | undefined;

export function getConfiguredProvider(env: Env = process.env): ConfigurableProvider {
  if (configuredProviderOverride) {
    return configuredProviderOverride;
  }

  const provider = (env.AI_PROVIDER ?? "gemini").trim();
  if (
    provider === "gemini" ||
    provider === "anthropic" ||
    provider === "openai_compatible"
  ) {
    return provider;
  }

  throw new Error("AI_PROVIDER must be gemini, anthropic, or openai_compatible");
}

export function setConfiguredProviderForTesting(
  provider: ConfigurableProvider | undefined,
): void {
  configuredProviderOverride = provider;
}

export function getProviderProfileIdForMode(
  provider: ConfigurableProvider,
  mode: ModelQuality,
): string {
  return {
    gemini: {
      fast: "gemini_flash_fast",
      balanced: "gemini_flash_balanced",
      deep: "gemini_flash_deep",
    },
    anthropic: {
      fast: "anthropic_haiku_fast",
      balanced: "anthropic_sonnet_balanced",
      deep: "anthropic_sonnet_deep",
    },
    openai_compatible: {
      fast: "openai_compatible_fast",
      balanced: "openai_compatible_balanced",
      deep: "openai_compatible_deep",
    },
  }[provider][mode];
}

export function readOpenAiCompatibleConfig(
  env: Env = process.env,
): OpenAiCompatibleConfig {
  return {
    apiKey: env.OPENAI_COMPATIBLE_API_KEY?.trim() ?? "",
    baseUrl: env.OPENAI_COMPATIBLE_BASE_URL?.trim().replace(/\/+$/, "") ?? "",
    models: {
      fast:
        env.OPENAI_COMPATIBLE_MODEL_FAST?.trim() ??
        DEFAULT_OPENAI_COMPATIBLE_MODELS.fast,
      balanced:
        env.OPENAI_COMPATIBLE_MODEL_BALANCED?.trim() ??
        DEFAULT_OPENAI_COMPATIBLE_MODELS.balanced,
      deep:
        env.OPENAI_COMPATIBLE_MODEL_DEEP?.trim() ??
        DEFAULT_OPENAI_COMPATIBLE_MODELS.deep,
    },
  };
}

export function createProviderAdapters(env: Env = process.env): AiProviderAdapter[] {
  const adapters: AiProviderAdapter[] = [];
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const openAiCompatibleConfig = readOpenAiCompatibleConfig(env);

  if (geminiKey) {
    adapters.push(new GeminiAdapter(geminiKey));
  }
  if (anthropicKey) {
    adapters.push(new AnthropicAdapter(anthropicKey));
  }
  if (openAiCompatibleConfig.apiKey && openAiCompatibleConfig.baseUrl) {
    adapters.push(
      new OpenAiCompatibleAdapter({
        apiKey: openAiCompatibleConfig.apiKey,
        baseUrl: openAiCompatibleConfig.baseUrl,
      }),
    );
  }

  return adapters;
}

export function createOpenAiCompatibleProviderAdapter(input: {
  apiKey: string;
  baseUrl: string;
}): AiProviderAdapter {
  return new OpenAiCompatibleAdapter({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
  });
}

export function createUserOpenAiCompatibleProfile(input: {
  quality: ModelQuality;
  baseUrl: string;
  model: string;
}): ModelProfile {
  const maxOutputTokens = input.quality === "fast"
    ? 4_096
    : input.quality === "balanced"
      ? 8_192
      : 16_384;
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  return {
    id: `user_openai_compatible_${input.quality}`,
    name: `User OpenAI Compatible ${input.quality}`,
    provider: "openai_compatible",
    displayName: input.quality === "fast" ? "Fast" : input.quality === "balanced" ? "Standard" : "Deep",
    modelId: input.model,
    visibleToUser: false,
    allowUserModelOverride: false,
    allowUserApiKey: true,
    allowCustomBaseUrl: true,
    allowedBaseUrls: [baseUrl],
    baseUrl,
    capabilities: {
      supportsJsonMode: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      supportsVision: false,
      supportsToolUse: false,
      supportsSystemPrompt: true,
      supportsReasoningEffort: false,
      supportsThinking: false,
      maxInputTokens: 128_000,
      maxOutputTokens,
      recommendedForLongReport: input.quality !== "fast",
      recommendedForFastTasks: input.quality === "fast",
      recommendedForDeepSimulation: input.quality === "deep",
    },
    defaults: {
      maxOutputTokens,
      quality: input.quality,
      responseFormat: "json",
      stream: true,
      timeoutMs: input.quality === "fast" ? 30_000 : 120_000,
      maxRetries: input.quality === "deep" ? 1 : 3,
    },
    limits: {
      maxInputChars: 20_000,
      maxOutputTokens,
    },
    status: "active",
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  };
}

export function getMissingProviderConfigMessage(
  provider: ConfigurableProvider,
  env: Env = process.env,
): string | undefined {
  if (provider === "gemini" && !env.GEMINI_API_KEY?.trim()) {
    return "GEMINI_API_KEY is missing. Please configure it in Settings > Secrets.";
  }
  if (provider === "anthropic" && !env.ANTHROPIC_API_KEY?.trim()) {
    return "ANTHROPIC_API_KEY is missing. Please configure it in Settings > Secrets.";
  }
  if (provider === "openai_compatible") {
    const config = readOpenAiCompatibleConfig(env);
    if (!config.apiKey) {
      return "OPENAI_COMPATIBLE_API_KEY is missing. Please configure it in Settings > Secrets.";
    }
    if (!config.baseUrl) {
      return "OPENAI_COMPATIBLE_BASE_URL is missing. Please configure it in Settings > Secrets.";
    }
  }

  return undefined;
}
