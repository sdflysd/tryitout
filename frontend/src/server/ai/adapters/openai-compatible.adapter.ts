import type { AiCallRequest, AiCallResult } from "../types.js";
import { withRetry } from "../retry.js";
import type { AiProviderAdapter } from "./provider-adapter.js";
import {
  createTimeoutSignal,
  getCappedMaxOutputTokens,
  getRequestMaxRetries,
  getRequestTimeoutMs,
  logRetryAttempt,
  parseJsonResponse,
} from "./json-response.js";

type FetchLike = typeof fetch;

interface OpenAiCompatibleAdapterOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: FetchLike;
}

interface OpenAiCompatibleChatResponse {
  id?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenAiCompatibleAdapter implements AiProviderAdapter {
  readonly provider = "openai_compatible" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(options: OpenAiCompatibleAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchFn = options.fetch ?? fetch;
  }

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    this.assertProfileBaseUrl(request);

    const startedAt = Date.now();
    const maxTokens = getCappedMaxOutputTokens(request);
    const messages: Array<{ role: "system" | "user"; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.userPrompt });

    const response = await withRetry(
      () =>
        this.fetchFn(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: request.modelProfile.modelId,
            messages,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
          }),
          signal: createTimeoutSignal(getRequestTimeoutMs(request)),
        }),
      getRequestMaxRetries(request),
      undefined,
      {
        onAttemptFailure: (event) => logRetryAttempt(request, event),
      },
    );

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible request failed with status ${response.status} ${response.statusText}`.trim(),
      );
    }

    const payload = await response.json() as OpenAiCompatibleChatResponse;
    const rawText = payload.choices?.[0]?.message?.content ?? "";

    return {
      data: parseJsonResponse<T>(rawText),
      rawText,
      provider: this.provider,
      modelId: request.modelProfile.modelId,
      modelProfileId: request.modelProfile.id,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
      latencyMs: Date.now() - startedAt,
      requestId: payload.id,
      stopReason: payload.choices?.[0]?.finish_reason,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    if (!this.apiKey) {
      return { ok: false, message: "OpenAI-compatible API key is not configured" };
    }
    if (!this.baseUrl) {
      return { ok: false, message: "OpenAI-compatible base URL is not configured" };
    }

    return { ok: true };
  }

  private assertProfileBaseUrl(request: AiCallRequest): void {
    const profileBaseUrl = request.modelProfile.baseUrl
      ? normalizeBaseUrl(request.modelProfile.baseUrl)
      : undefined;

    if (profileBaseUrl && profileBaseUrl !== this.baseUrl) {
      throw new Error(
        `Model profile base URL does not match configured OpenAI-compatible base URL`,
      );
    }
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}
