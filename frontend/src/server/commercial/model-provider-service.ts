import { randomUUID } from "node:crypto";

import {
  hasCommercialFeature,
  type ProviderMode,
} from "../../contracts/commercial.js";
import { OpenAiCompatibleAdapter } from "../ai/adapters/openai-compatible.adapter.js";
import { createUserOpenAiCompatibleProfile } from "../ai/provider-config.js";
import type { ModelQuality } from "../ai/types.js";
import {
  assertSafeProviderUrl,
  type ProviderUrlSafetyOptions,
} from "./provider-url-safety.js";
import type { CommercialRepository } from "./repository.js";
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "./secrets.js";
import type { UserModelProviderRecord } from "./types.js";

export type ModelProviderServiceErrorCode =
  | "provider_not_allowed"
  | "provider_not_found"
  | "unsafe_provider_url"
  | "provider_test_failed"
  | "invalid_provider_input";

export class ModelProviderServiceError extends Error {
  readonly code: ModelProviderServiceErrorCode;

  constructor(code: ModelProviderServiceErrorCode, message: string) {
    super(message);
    this.name = "ModelProviderServiceError";
    this.code = code;
  }
}

export interface ModelProviderServiceOptions extends ProviderUrlSafetyOptions {
  repository: CommercialRepository;
  encryptionKey: Buffer | Uint8Array;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
  randomBytes?: (length: number) => Buffer;
  testProviderConnection?: (input: {
    baseUrl: string;
    apiKey: string;
    provider: string;
    models: Record<ModelQuality, string>;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export interface SaveModelProviderInput {
  userId: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  modelFast?: string;
  modelBalanced?: string;
  modelDeep?: string;
}

export interface PublicModelProviderDto {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKeyMask: string;
  modelFast?: string;
  modelBalanced?: string;
  modelDeep?: string;
  status: UserModelProviderRecord["status"];
  lastTestedAt?: string;
  lastTestStatus?: UserModelProviderRecord["lastTestStatus"];
  lastTestError?: string;
  createdAt: string;
  updatedAt: string;
}

export type ResolvedProviderForTask =
  | { mode: "platform" }
  | {
      mode: "byok";
      provider: string;
      baseUrl: string;
      apiKey: string;
      modelFast?: string;
      modelBalanced?: string;
      modelDeep?: string;
    };

const DEFAULT_TEST_TIMEOUT_MS = 10_000;

export class ModelProviderService {
  private readonly repository: CommercialRepository;
  private readonly encryptionKey: Buffer | Uint8Array;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;
  private readonly randomBytes?: (length: number) => Buffer;
  private readonly urlSafetyOptions: ProviderUrlSafetyOptions;
  private readonly testConnection?: ModelProviderServiceOptions["testProviderConnection"];

  constructor(options: ModelProviderServiceOptions) {
    this.repository = options.repository;
    this.encryptionKey = options.encryptionKey;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
    this.randomBytes = options.randomBytes;
    this.urlSafetyOptions = {
      resolveHostname: options.resolveHostname,
      followRedirect: options.followRedirect,
      allowedHostnames: options.allowedHostnames,
    };
    this.testConnection = options.testProviderConnection;
  }

  async saveProvider(input: SaveModelProviderInput): Promise<PublicModelProviderDto> {
    await this.assertAllowed(input.userId);
    await this.assertSafeUrl(input.baseUrl);
    const existing = await this.findProvider(input.userId, { includeDisabled: true });
    const now = this.currentIso();
    const record: UserModelProviderRecord = {
      id: existing?.id ?? this.createId("model_provider"),
      userId: input.userId,
      provider: requireString(input.provider, "Provider"),
      displayName: requireString(input.displayName, "Display name"),
      baseUrl: new URL(input.baseUrl).toString(),
      encryptedApiKey: encryptSecret(input.apiKey, this.encryptionKey, {
        randomBytes: this.randomBytes,
      }),
      apiKeyMask: maskSecret(input.apiKey),
      status: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const modelFast = trimmedOptional(input.modelFast);
    if (modelFast !== undefined) record.modelFast = modelFast;
    const modelBalanced = trimmedOptional(input.modelBalanced);
    if (modelBalanced !== undefined) record.modelBalanced = modelBalanced;
    const modelDeep = trimmedOptional(input.modelDeep);
    if (modelDeep !== undefined) record.modelDeep = modelDeep;
    await this.repository.saveUserModelProvider(record);
    return toPublicProvider(record);
  }

  async getPublicProvider(userId: string): Promise<PublicModelProviderDto | undefined> {
    const provider = await this.findProvider(userId);
    return provider === undefined ? undefined : toPublicProvider(provider);
  }

  async deleteProvider(userId: string): Promise<PublicModelProviderDto> {
    const provider = await this.requireProvider(userId, { includeDisabled: true });
    const updated: UserModelProviderRecord = {
      ...provider,
      status: "disabled",
      updatedAt: this.currentIso(),
    };
    await this.repository.saveUserModelProvider(updated);
    return toPublicProvider(updated);
  }

  async testProviderConnection(
    userId: string,
    input: { timeoutMs?: number } = {},
  ): Promise<PublicModelProviderDto> {
    const provider = await this.requireProvider(userId);
    await this.assertSafeUrl(provider.baseUrl);
    const apiKey = decryptSecret(provider.encryptedApiKey, this.encryptionKey);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
    const result = await withTimeout(
      this.runProviderTest({
        baseUrl: provider.baseUrl,
        apiKey,
        provider: provider.provider,
        models: resolveByokTestModels(provider),
      }),
      timeoutMs,
    );
    const now = this.currentIso();
    const updated: UserModelProviderRecord = {
      ...provider,
      lastTestedAt: now,
      lastTestStatus: result.ok ? "passed" : "failed",
      lastTestError: result.ok ? undefined : sanitizeProviderTestError(result.error),
      updatedAt: now,
    };
    await this.repository.saveUserModelProvider(updated);
    return toPublicProvider(updated);
  }

  async resolveProviderForTask(
    userId: string,
    providerMode: ProviderMode,
  ): Promise<ResolvedProviderForTask> {
    if (providerMode !== "byok") {
      return { mode: "platform" };
    }
    const provider = await this.findProvider(userId);
    if (provider === undefined) {
      return { mode: "platform" };
    }
    return {
      mode: "byok",
      provider: provider.provider,
      baseUrl: provider.baseUrl,
      apiKey: decryptSecret(provider.encryptedApiKey, this.encryptionKey),
      ...(provider.modelFast !== undefined ? { modelFast: provider.modelFast } : {}),
      ...(provider.modelBalanced !== undefined ? { modelBalanced: provider.modelBalanced } : {}),
      ...(provider.modelDeep !== undefined ? { modelDeep: provider.modelDeep } : {}),
    };
  }

  private async assertAllowed(userId: string): Promise<void> {
    const user = await this.repository.getEffectiveUser(userId, this.currentIso());
    if (
      !user ||
      user.status !== "active" ||
      !hasCommercialFeature(user, "custom_model_provider")
    ) {
      throw new ModelProviderServiceError(
        "provider_not_allowed",
        "Custom model providers require BYOK access from an access code",
      );
    }
  }

  private async assertSafeUrl(baseUrl: string): Promise<void> {
    try {
      await assertSafeProviderUrl(baseUrl, this.urlSafetyOptions);
    } catch (error) {
      throw new ModelProviderServiceError(
        "unsafe_provider_url",
        error instanceof Error ? error.message : "Provider URL is unsafe",
      );
    }
  }

  private async findProvider(
    userId: string,
    options: { includeDisabled?: boolean } = {},
  ): Promise<UserModelProviderRecord | undefined> {
    return (await this.repository.listUserModelProviders(userId)).find(
      (provider) => options.includeDisabled === true || provider.status === "active",
    );
  }

  private async requireProvider(
    userId: string,
    options: { includeDisabled?: boolean } = {},
  ): Promise<UserModelProviderRecord> {
    const provider = await this.findProvider(userId, options);
    if (provider === undefined) {
      throw new ModelProviderServiceError("provider_not_found", "Model provider not found");
    }
    return provider;
  }

  private async runProviderTest(input: {
    baseUrl: string;
    apiKey: string;
    provider: string;
    models: Record<ModelQuality, string>;
  }): Promise<{ ok: boolean; error?: string }> {
    if (this.testConnection !== undefined) {
      return this.testConnection(input);
    }
    return testOpenAiCompatibleConnection(input);
  }

  private currentIso(): string {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new ModelProviderServiceError(
        "invalid_provider_input",
        "Invalid current time",
      );
    }
    return date.toISOString();
  }
}

function toPublicProvider(record: UserModelProviderRecord): PublicModelProviderDto {
  const dto: PublicModelProviderDto = {
    id: record.id,
    provider: record.provider,
    displayName: record.displayName,
    baseUrl: record.baseUrl,
    apiKeyMask: record.apiKeyMask,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (record.modelFast !== undefined) dto.modelFast = record.modelFast;
  if (record.modelBalanced !== undefined) dto.modelBalanced = record.modelBalanced;
  if (record.modelDeep !== undefined) dto.modelDeep = record.modelDeep;
  if (record.lastTestedAt !== undefined) dto.lastTestedAt = record.lastTestedAt;
  if (record.lastTestStatus !== undefined) dto.lastTestStatus = record.lastTestStatus;
  if (record.lastTestError !== undefined) dto.lastTestError = record.lastTestError;
  return dto;
}

async function testOpenAiCompatibleConnection(input: {
  baseUrl: string;
  apiKey: string;
  provider: string;
  models: Record<ModelQuality, string>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.apiKey.trim()) {
    return { ok: false, error: "API key is required." };
  }

  const adapter = new OpenAiCompatibleAdapter({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
  });
  const qualities: ModelQuality[] = ["fast", "balanced", "deep"];
  const testedModels = new Set<string>();

  for (const quality of qualities) {
    const model = input.models[quality].trim();
    if (!model || testedModels.has(model)) {
      continue;
    }
    testedModels.add(model);
    try {
      await adapter.generateJson<{ ok: boolean }>({
        step: "safety_check",
        scenarioType: "life_choice",
        modelProfile: createUserOpenAiCompatibleProfile({
          quality,
          baseUrl: input.baseUrl,
          model,
        }),
        generationConfig: {
          maxOutputTokens: 32,
          timeoutMs: 10_000,
          maxRetries: 0,
        },
        systemPrompt: "Return only valid JSON.",
        userPrompt: "Reply with exactly this JSON object: {\"ok\":true}",
        responseFormat: "json",
        metadata: {},
      });
    } catch (error) {
      return {
        ok: false,
        error: `Model ${model} failed: ${error instanceof Error ? error.message : "request failed"}`,
      };
    }
  }

  if (testedModels.size === 0) {
    return { ok: false, error: "At least one model id is required." };
  }

  return { ok: true };
}

function resolveByokTestModels(
  provider: UserModelProviderRecord,
): Record<ModelQuality, string> {
  const balanced = provider.modelBalanced ?? provider.modelDeep ?? provider.modelFast ?? "gpt-4o";
  return {
    fast: provider.modelFast ?? balanced,
    balanced,
    deep: provider.modelDeep ?? balanced,
  };
}

function sanitizeProviderTestError(error: string | undefined): string {
  const message = error?.trim() || "Provider test failed";
  return message.slice(0, 500);
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          resolve({ ok: false, error: "provider_test_timeout" } as T);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function requireString(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ModelProviderServiceError(
      "invalid_provider_input",
      `${label} is required`,
    );
  }
  return value.trim();
}

function trimmedOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
