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

interface AnthropicAdapterOptions {
  fetch?: FetchLike;
  baseUrl?: string;
}

interface AnthropicMessageResponse {
  id?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

export class AnthropicAdapter implements AiProviderAdapter {
  readonly provider = "anthropic" as const;

  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    options: AnthropicAdapterOptions = {},
  ) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://api.anthropic.com");
  }

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    const startedAt = Date.now();
    const maxTokens = getCappedMaxOutputTokens(request);

    const response = await withRetry(
      () =>
        this.fetchFn(`${this.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify({
            model: request.modelProfile.modelId,
            max_tokens: maxTokens,
            system: request.systemPrompt,
            messages: [
              {
                role: "user",
                content: request.userPrompt,
              },
            ],
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
        `Anthropic request failed with status ${response.status} ${response.statusText}`.trim(),
      );
    }

    const payload = await response.json() as AnthropicMessageResponse;
    const rawText = getTextContent(payload);
    const inputTokens = payload.usage?.input_tokens;
    const outputTokens = payload.usage?.output_tokens;

    return {
      data: parseJsonResponse<T>(rawText),
      rawText,
      provider: this.provider,
      modelId: request.modelProfile.modelId,
      modelProfileId: request.modelProfile.id,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens:
          inputTokens === undefined && outputTokens === undefined
            ? undefined
            : (inputTokens ?? 0) + (outputTokens ?? 0),
      },
      latencyMs: Date.now() - startedAt,
      requestId: payload.id,
      stopReason: payload.stop_reason,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    return this.apiKey
      ? { ok: true }
      : { ok: false, message: "Anthropic API key is not configured" };
  }
}

function getTextContent(payload: AnthropicMessageResponse): string {
  return payload.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n") ?? "";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
