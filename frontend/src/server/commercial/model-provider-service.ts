import { randomUUID } from "node:crypto";

import { hasCommercialFeature } from "../../contracts/commercial.js";
import type { CommercialRepository } from "./repository.js";
import {
  assertSafeProviderRedirects,
  type FetchHead,
  ProviderUrlSafetyError,
  validateProviderBaseUrl,
} from "./provider-url-safety.js";
import { decryptSecret, encryptSecret } from "./secrets.js";

export interface PublicUserModelProvider {
  provider: "openai_compatible";
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  keyPreview: string;
}

export interface ResolvedUserModelProvider {
  provider: "openai_compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type ProviderTestFetch = (
  url: string,
  init: {
    method: "GET";
    headers: Record<string, string>;
    signal: AbortSignal;
  },
  signal: AbortSignal,
) => Promise<{ ok: boolean; status?: number }>;

export interface ModelProviderServiceOptions {
  masterKey: string;
  now?: () => Date;
  allowedHosts?: string[];
  testTimeoutMs?: number;
  fetchJson?: ProviderTestFetch;
  fetchHead?: FetchHead;
}

export class ModelProviderServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ModelProviderServiceError";
  }
}

export class ModelProviderService {
  private readonly now: () => Date;
  private readonly testTimeoutMs: number;
  private readonly fetchJson: ProviderTestFetch;

  constructor(
    private readonly repository: CommercialRepository,
    private readonly options: ModelProviderServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.testTimeoutMs = options.testTimeoutMs ?? 5000;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  async saveProvider(input: {
    userId: string;
    provider: "openai_compatible";
    baseUrl: string;
    model: string;
    apiKey: string;
  }): Promise<PublicUserModelProvider> {
    await this.requireCustomProviderEntitlement(input.userId);
    if (input.provider !== "openai_compatible") {
      throw new ModelProviderServiceError("provider_not_supported", "Provider is not supported.");
    }

    const baseUrl = this.safeValidateUrl(input.baseUrl);
    const existing = await this.repository.getUserModelProvider(input.userId);
    const timestamp = this.now();
    const record = {
      id: existing?.id ?? `provider_${randomUUID()}`,
      userId: input.userId,
      provider: input.provider,
      baseUrl,
      encryptedApiKey: encryptSecret(input.apiKey, this.options.masterKey),
      model: input.model.trim(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.repository.saveUserModelProvider(record);
    return toPublicProvider(record, this.options.masterKey);
  }

  async getPublicProvider(userId: string): Promise<PublicUserModelProvider | undefined> {
    const record = await this.repository.getUserModelProvider(userId);
    return record ? toPublicProvider(record, this.options.masterKey) : undefined;
  }

  async resolveProvider(userId: string): Promise<ResolvedUserModelProvider | undefined> {
    const record = await this.repository.getUserModelProvider(userId);
    if (!record) {
      return undefined;
    }
    return {
      provider: record.provider,
      baseUrl: record.baseUrl,
      model: record.model,
      apiKey: decryptSecret(record.encryptedApiKey, this.options.masterKey),
    };
  }

  async deleteProvider(userId: string): Promise<void> {
    await this.repository.deleteUserModelProvider(userId);
  }

  async testProviderConnection(userId: string): Promise<{ ok: true }> {
    const provider = await this.resolveProvider(userId);
    if (!provider) {
      throw new ModelProviderServiceError("provider_not_found", "Provider was not found.");
    }
    await this.safeAssertRedirects(provider.baseUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.testTimeoutMs);
    try {
      const response = await this.fetchJson(
        `${provider.baseUrl}/models`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${provider.apiKey}` },
          signal: controller.signal,
        },
        controller.signal,
      );
      if (!response.ok) {
        throw new ModelProviderServiceError(
          "provider_test_failed",
          `Provider test failed with status ${response.status ?? "unknown"}.`,
        );
      }
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new ModelProviderServiceError("provider_test_timeout", "Provider test timed out.");
      }
      if (error instanceof ModelProviderServiceError) {
        throw error;
      }
      throw new ModelProviderServiceError("provider_test_failed", "Provider test failed.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requireCustomProviderEntitlement(userId: string): Promise<void> {
    const user = await this.repository.getUser(userId);
    if (!user || user.disabledAt || !hasCommercialFeature(user, "custom_model_provider")) {
      throw new ModelProviderServiceError(
        "custom_provider_not_allowed",
        "User is not entitled to custom model providers.",
      );
    }
  }

  private safeValidateUrl(rawUrl: string): string {
    try {
      return validateProviderBaseUrl(rawUrl, {
        allowedHosts: this.options.allowedHosts,
      });
    } catch (error) {
      throw mapUrlSafetyError(error);
    }
  }

  private async safeAssertRedirects(rawUrl: string): Promise<void> {
    try {
      await assertSafeProviderRedirects(rawUrl, {
        allowedHosts: this.options.allowedHosts,
        fetchHead: this.options.fetchHead,
      });
    } catch (error) {
      throw mapUrlSafetyError(error);
    }
  }
}

function toPublicProvider(
  record: {
    provider: "openai_compatible";
    baseUrl: string;
    encryptedApiKey: string;
    model: string;
  },
  masterKey: string,
): PublicUserModelProvider {
  const apiKey = decryptSecret(record.encryptedApiKey, masterKey);
  return {
    provider: record.provider,
    baseUrl: record.baseUrl,
    model: record.model,
    hasApiKey: apiKey.length > 0,
    keyPreview: maskApiKey(apiKey),
  };
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function defaultFetchJson(
  url: string,
  init: {
    method: "GET";
    headers: Record<string, string>;
    signal: AbortSignal;
  },
): Promise<{ ok: boolean; status?: number }> {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status };
}

function mapUrlSafetyError(error: unknown): ModelProviderServiceError {
  if (error instanceof ProviderUrlSafetyError) {
    return new ModelProviderServiceError(error.code, error.message);
  }
  if (error instanceof ModelProviderServiceError) {
    return error;
  }
  return new ModelProviderServiceError("invalid_provider_url", "Provider URL is invalid.");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
