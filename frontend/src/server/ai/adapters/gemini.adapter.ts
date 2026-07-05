import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";

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

type GeminiClient = {
  models: {
    generateContent(
      params: GenerateContentParameters,
    ): Promise<GenerateContentResponse>;
  };
};

interface GeminiAdapterOptions {
  client?: GeminiClient;
  clientFactory?: (apiKey: string) => GeminiClient;
}

export class GeminiAdapter implements AiProviderAdapter {
  readonly provider = "gemini" as const;

  private client?: GeminiClient;

  constructor(
    private readonly apiKey: string,
    private readonly options: GeminiAdapterOptions = {},
  ) {
    this.client = options.client;
  }

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    const startedAt = Date.now();
    const { modelProfile } = request;
    const maxOutputTokens = getCappedMaxOutputTokens(request);

    const response = await withRetry(
      () =>
        this.getClient().models.generateContent({
          model: modelProfile.modelId,
          contents: request.userPrompt,
          config: {
            abortSignal: createTimeoutSignal(getRequestTimeoutMs(request)),
            systemInstruction: request.systemPrompt,
            responseMimeType: "application/json",
            maxOutputTokens,
          },
        }),
      getRequestMaxRetries(request),
      undefined,
      {
        onAttemptFailure: (event) => logRetryAttempt(request, event),
      },
    );

    const rawText = response.text ?? "";

    return {
      data: parseJsonResponse<T>(rawText),
      rawText,
      provider: this.provider,
      modelId: modelProfile.modelId,
      modelProfileId: modelProfile.id,
      usage: buildUsage(response),
      latencyMs: Date.now() - startedAt,
      requestId: response.responseId,
      stopReason: response.candidates?.[0]?.finishReason,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    return this.apiKey
      ? { ok: true }
      : { ok: false, message: "Gemini API key is not configured" };
  }

  private getClient(): GeminiClient {
    this.client ??=
      this.options.clientFactory?.(this.apiKey) ?? new GoogleGenAI({ apiKey: this.apiKey });

    return this.client;
  }
}

function buildUsage(response: GenerateContentResponse): AiCallResult["usage"] {
  const usageMetadata = response.usageMetadata;
  if (!usageMetadata) {
    return undefined;
  }

  return {
    inputTokens: usageMetadata.promptTokenCount,
    outputTokens: usageMetadata.candidatesTokenCount,
    totalTokens: usageMetadata.totalTokenCount,
    cacheReadTokens: usageMetadata.cachedContentTokenCount,
  };
}
