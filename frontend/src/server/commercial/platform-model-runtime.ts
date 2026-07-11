import { AiGateway } from "../ai/ai-gateway.js";
import { AnthropicAdapter } from "../ai/adapters/anthropic.adapter.js";
import { GeminiAdapter } from "../ai/adapters/gemini.adapter.js";
import { OpenAiCompatibleAdapter } from "../ai/adapters/openai-compatible.adapter.js";
import type { AiProviderAdapter } from "../ai/adapters/provider-adapter.js";
import { getPolicyForScenario } from "../ai/model-policy.js";
import { getModelProfile } from "../ai/model-profiles.js";
import { ModelResolutionError } from "../ai/model-router.js";
import { validateModelSelection } from "../ai/model-selection.schema.js";
import { getProviderProfileIdForMode } from "../ai/provider-config.js";
import type {
  AiCallRequest,
  AiCallResult,
  ModelCapabilities,
  ModelLimits,
  ModelProfile,
  ModelQuality,
  ModelSelection,
  SimulationStep,
  SimulationType,
} from "../ai/types.js";
import type { PlatformModelOption } from "../../model-options.js";
import {
  PLATFORM_MODEL_SETTING_KEY,
  normalizePlatformModelProfileIds,
} from "../../model-options.js";
import { decryptSecret } from "./secrets.js";
import type { CommercialRepository } from "./repository.js";
import type {
  PlatformModelProfileRecord,
  PlatformModelProviderRecord,
} from "./types.js";

type PlatformProvider = PlatformModelProviderRecord["provider"];

export interface PlatformModelCatalog {
  source: "admin";
  options: PlatformModelOption[];
  profiles: ModelProfile[];
}

export async function loadRepositoryPlatformModelCatalog(
  repository: CommercialRepository,
): Promise<PlatformModelCatalog | undefined> {
  const [providers, profileRecords] = await Promise.all([
    repository.listPlatformModelProviders(),
    repository.listPlatformModelProfiles(),
  ]);
  if (profileRecords.length === 0) {
    return undefined;
  }

  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const activeProfiles = profileRecords
    .map((profile) => {
      const provider = providersById.get(profile.providerConfigId);
      if (
        provider === undefined ||
        provider.status !== "active" ||
        profile.status !== "active"
      ) {
        return undefined;
      }
      return toModelProfile(profile, provider);
    })
    .filter((profile): profile is ModelProfile => profile !== undefined);
  const visibleProfileIds = activeProfiles
    .filter((profile) => profile.visibleToUser)
    .map((profile) => profile.id);
  const setting = await repository.getSystemSetting(PLATFORM_MODEL_SETTING_KEY);
  const enabledModelProfileIds = new Set(
    normalizePlatformModelProfileIds(setting?.value, visibleProfileIds),
  );
  const publishedProfiles = activeProfiles.filter(
    (profile) => profile.visibleToUser && enabledModelProfileIds.has(profile.id),
  );

  return {
    source: "admin",
    profiles: publishedProfiles,
    options: publishedProfiles
      .map((profile) => {
        const record = profileRecords.find((item) => item.id === profile.id);
        const provider = record
          ? providersById.get(record.providerConfigId)
          : undefined;
        return {
          id: profile.id,
          label: profile.name,
          providerLabel: record?.providerLabel ?? provider?.displayName,
          modelId: profile.modelId,
          quality: profile.defaults.quality,
        };
      }),
  };
}

export async function createRepositoryPlatformGateway(input: {
  repository: CommercialRepository;
  secretEncryptionKey: Buffer | Uint8Array;
  createAdapter?: (
    provider: PlatformModelProviderRecord,
    secretEncryptionKey: Buffer | Uint8Array,
  ) => AiProviderAdapter | undefined;
}): Promise<AiGateway | undefined> {
  const catalog = await loadRepositoryPlatformModelCatalog(input.repository);
  if (catalog === undefined) {
    return undefined;
  }

  const [providers, profiles] = await Promise.all([
    input.repository.listPlatformModelProviders(),
    input.repository.listPlatformModelProfiles(),
  ]);
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const adaptersByProviderId = new Map<string, AiProviderAdapter>();
  const profileRoutesByProvider = new Map<PlatformProvider, Map<string, AiProviderAdapter>>();

  for (const profile of profiles) {
    const provider = providersById.get(profile.providerConfigId);
    if (
      provider === undefined ||
      provider.status !== "active" ||
      profile.status !== "active"
    ) {
      continue;
    }

    let adapter = adaptersByProviderId.get(provider.id);
    if (adapter === undefined) {
      adapter = (input.createAdapter ?? createAdapter)(provider, input.secretEncryptionKey);
      if (adapter === undefined) {
        continue;
      }
      adaptersByProviderId.set(provider.id, adapter);
    }

    let routes = profileRoutesByProvider.get(provider.provider);
    if (routes === undefined) {
      routes = new Map();
      profileRoutesByProvider.set(provider.provider, routes);
    }
    routes.set(profile.id, adapter);
  }

  const adapters = [...profileRoutesByProvider.entries()].map(
    ([provider, routes]) => new ProfileRoutedProviderAdapter(provider, routes),
  );

  return new AiGateway("", {
    adapters,
    resolveModel: createRepositoryModelResolver(catalog.profiles),
  });
}

export function createRepositoryModelResolver(
  profiles: ModelProfile[],
): (
  selection: ModelSelection | undefined,
  scenarioType: SimulationType,
  step: SimulationStep,
) => ModelProfile {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return (selection, scenarioType, step) => {
    const validated = validateModelSelection(selection);
    if (validated.ok === false) {
      throw new ModelResolutionError(validated.error);
    }

    const policy = getPolicyForScenario(scenarioType);
    const stepConfig = policy.steps[step];
    if (!stepConfig) {
      throw new ModelResolutionError(`Unknown simulation step: ${String(step)}`);
    }

    const selected = validated.value;
    if (selected.modelProfileId) {
      if (!stepConfig.allowUserOverride) {
        throw new ModelResolutionError("Model override not allowed for this step");
      }
      if (
        stepConfig.allowedUserProfileIds &&
        !stepConfig.allowedUserProfileIds.includes(selected.modelProfileId)
      ) {
        throw new ModelResolutionError("Model profile not allowed for this step");
      }

      const profile = profilesById.get(selected.modelProfileId);
      if (!profile) {
        throw new ModelResolutionError(`Unknown model profile: ${selected.modelProfileId}`);
      }
      if (profile.status !== "active") {
        throw new ModelResolutionError(
          `Model profile is not active: ${selected.modelProfileId}`,
        );
      }
      if (!profile.visibleToUser) {
        throw new ModelResolutionError(
          `Model profile not available to users: ${selected.modelProfileId}`,
        );
      }
      return profile;
    }

    return requireProfileForQuality(profiles, selected.mode ?? stepConfig.quality);
  };
}

function createAdapter(
  provider: PlatformModelProviderRecord,
  secretEncryptionKey: Buffer | Uint8Array,
): AiProviderAdapter | undefined {
  const apiKey = decryptSecret(provider.encryptedApiKey, secretEncryptionKey);
  if (provider.provider === "gemini") {
    return new GeminiAdapter(apiKey);
  }
  if (provider.provider === "anthropic") {
    return new AnthropicAdapter(apiKey, {
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
    });
  }
  if (provider.provider === "openai_compatible") {
    return new OpenAiCompatibleAdapter({
      apiKey,
      baseUrl: provider.baseUrl ?? "",
    });
  }
  return undefined;
}

class ProfileRoutedProviderAdapter implements AiProviderAdapter {
  readonly provider: PlatformProvider;

  private readonly routes: Map<string, AiProviderAdapter>;

  constructor(provider: PlatformProvider, routes: Map<string, AiProviderAdapter>) {
    this.provider = provider;
    this.routes = routes;
  }

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    const adapter = this.routes.get(request.modelProfile.id);
    if (adapter === undefined) {
      throw new Error(
        `No platform model provider configured for profile: ${request.modelProfile.id}`,
      );
    }
    return adapter.generateJson<T>(request);
  }
}

function toModelProfile(
  record: PlatformModelProfileRecord,
  provider: PlatformModelProviderRecord,
): ModelProfile {
  const baseProfile = getBaseProfile(provider.provider, record.quality);
  const capabilities: ModelCapabilities = {
    ...baseProfile.capabilities,
    ...(record.capabilities ?? {}),
  };
  const limits: ModelLimits = {
    ...baseProfile.limits,
    ...(record.limits ?? {}),
    maxOutputTokens:
      record.limits?.maxOutputTokens ??
      record.capabilities?.maxOutputTokens ??
      baseProfile.limits.maxOutputTokens,
  };
  const maxOutputTokens = capabilities.maxOutputTokens;
  const baseUrl = provider.baseUrl?.trim().replace(/\/+$/, "");

  return {
    ...baseProfile,
    id: record.id,
    name: record.label,
    provider: provider.provider,
    displayName: record.label,
    modelId: record.modelId,
    visibleToUser: record.visibleToUser,
    allowUserModelOverride: true,
    allowUserApiKey: false,
    allowCustomBaseUrl: false,
    ...(baseUrl ? { baseUrl, allowedBaseUrls: [baseUrl] } : {}),
    capabilities,
    defaults: {
      ...baseProfile.defaults,
      quality: record.quality,
      maxOutputTokens,
    },
    limits,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function getBaseProfile(
  provider: PlatformProvider,
  quality: ModelQuality,
): ModelProfile {
  const profile = getModelProfile(getProviderProfileIdForMode(provider, quality));
  if (!profile) {
    throw new ModelResolutionError(`Default model profile not found for ${provider}/${quality}`);
  }
  return profile;
}

function requireProfileForQuality(
  profiles: ModelProfile[],
  quality: ModelQuality,
): ModelProfile {
  const profile = profiles.find(
    (item) =>
      item.defaults.quality === quality &&
      item.status === "active" &&
      item.visibleToUser,
  );
  if (!profile) {
    throw new ModelResolutionError(`No active platform model profile for ${quality}`);
  }
  return profile;
}
