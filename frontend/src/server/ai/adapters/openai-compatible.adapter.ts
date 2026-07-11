import type { AiCallRequest, AiCallResult } from "../types.js";
import type { AiProviderAdapter } from "./provider-adapter.js";
import {
  getCappedMaxOutputTokens,
  getRequestTimeoutMs,
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

interface OpenAiCompatibleChatStreamChunk {
  id?: string;
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
    };
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

interface StreamReadResult {
  rawText: string;
  requestId?: string;
  stopReason?: string;
  usage?: AiCallResult["usage"];
  firstByteLatencyMs?: number;
  streamChunkCount: number;
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
    const timeoutMs = getRequestTimeoutMs(request);
    const maxTokens = getCappedMaxOutputTokens(request);
    const shouldStream = shouldStreamOpenAiCompatibleRequest(request);
    const messages: Array<{ role: "system" | "user"; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.userPrompt });

    const response = await fetchWithTimeout(
      this.fetchFn,
      `${this.baseUrl}/chat/completions`,
      {
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
          stream: shouldStream,
          ...(shouldStream ? { stream_options: { include_usage: true } } : {}),
        }),
      },
      timeoutMs,
    );

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible request failed with status ${response.status} ${response.statusText}`.trim(),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const streamResult = response.body && contentType.includes("text/event-stream")
      ? await readOpenAiCompatibleStream(response.body, {
        startedAt,
        idleTimeoutMs: timeoutMs,
      })
      : parseSingleResponseAsStreamResult(
        await response.json() as OpenAiCompatibleChatResponse,
      );

    return {
      data: parseJsonResponse<T>(streamResult.rawText),
      rawText: streamResult.rawText,
      provider: this.provider,
      modelId: request.modelProfile.modelId,
      modelProfileId: request.modelProfile.id,
      usage: streamResult.usage,
      latencyMs: Date.now() - startedAt,
      requestId: streamResult.requestId,
      stopReason: streamResult.stopReason,
      transport: shouldStream ? "stream" : "single_response",
      firstByteLatencyMs: streamResult.firstByteLatencyMs,
      streamChunkCount: streamResult.streamChunkCount,
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

function shouldStreamOpenAiCompatibleRequest(request: AiCallRequest): boolean {
  return request.modelProfile.defaults.stream &&
    request.modelProfile.capabilities.supportsStreaming;
}

async function fetchWithTimeout(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = createAbortTimer(controller, timeoutMs);

  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readOpenAiCompatibleStream(
  body: ReadableStream<Uint8Array>,
  {
    startedAt,
    idleTimeoutMs,
  }: {
    startedAt: number;
    idleTimeoutMs: number;
  },
): Promise<StreamReadResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawText = "";
  let requestId: string | undefined;
  let stopReason: string | undefined;
  let usage: AiCallResult["usage"];
  let firstByteLatencyMs: number | undefined;
  let streamChunkCount = 0;

  try {
    while (true) {
      const readResult = await readStreamChunkWithIdleTimeout(reader, idleTimeoutMs);
      if (readResult.done) {
        break;
      }

      firstByteLatencyMs ??= Date.now() - startedAt;
      streamChunkCount += 1;
      buffer += decoder.decode(readResult.value, { stream: true });
      const parsed = consumeSseBuffer(buffer);
      buffer = parsed.remainder;

      for (const eventData of parsed.events) {
        if (eventData === "[DONE]") {
          continue;
        }

        const chunk = JSON.parse(eventData) as OpenAiCompatibleChatStreamChunk;
        requestId = chunk.id ?? requestId;
        usage = normalizeUsage(chunk.usage) ?? usage;

        for (const choice of chunk.choices ?? []) {
          rawText += choice.delta?.content ?? choice.message?.content ?? "";
          stopReason = choice.finish_reason ?? stopReason;
        }
      }
    }

    const finalText = decoder.decode();
    if (finalText) {
      buffer += finalText;
    }
    const parsed = consumeSseBuffer(buffer, true);
    for (const eventData of parsed.events) {
      if (eventData === "[DONE]") {
        continue;
      }

      const chunk = JSON.parse(eventData) as OpenAiCompatibleChatStreamChunk;
      requestId = chunk.id ?? requestId;
      usage = normalizeUsage(chunk.usage) ?? usage;

      for (const choice of chunk.choices ?? []) {
        rawText += choice.delta?.content ?? choice.message?.content ?? "";
        stopReason = choice.finish_reason ?? stopReason;
      }
    }

    return {
      rawText,
      requestId,
      stopReason,
      usage,
      firstByteLatencyMs,
      streamChunkCount,
    };
  } finally {
    reader.releaseLock();
  }
}

function consumeSseBuffer(
  buffer: string,
  flush = false,
): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const completeParts = flush ? parts : parts.slice(0, -1);
  const remainder = flush ? "" : (parts.at(-1) ?? "");
  const events = completeParts
    .map(parseSseEvent)
    .filter((event): event is string => event !== undefined);

  return { events, remainder };
}

function parseSseEvent(rawEvent: string): string | undefined {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return dataLines.join("\n").trim();
}

async function readStreamChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return reader.read();
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createTimeoutError("OpenAI-compatible stream idle timeout"));
    }, timeoutMs);
    unrefTimer(timeoutId);
  });

  try {
    return await Promise.race([reader.read(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parseSingleResponseAsStreamResult(
  payload: OpenAiCompatibleChatResponse,
): StreamReadResult {
  return {
    rawText: payload.choices?.[0]?.message?.content ?? "",
    requestId: payload.id,
    stopReason: payload.choices?.[0]?.finish_reason,
    usage: normalizeUsage(payload.usage),
    streamChunkCount: 0,
  };
}

function normalizeUsage(
  usage: OpenAiCompatibleChatResponse["usage"] | null | undefined,
): AiCallResult["usage"] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function createAbortTimer(
  controller: AbortController,
  timeoutMs: number,
): ReturnType<typeof setTimeout> | undefined {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }

  const timeoutId = setTimeout(() => {
    controller.abort(createTimeoutError("OpenAI-compatible request start timeout"));
  }, timeoutMs);
  unrefTimer(timeoutId);

  return timeoutId;
}

function createTimeoutError(message: string): Error {
  const error = new Error(message);
  error.name = "TimeoutError";
  Object.assign(error, { code: "ETIMEDOUT" });

  return error;
}

function unrefTimer(timeoutId: ReturnType<typeof setTimeout> | undefined): void {
  if (timeoutId && typeof timeoutId === "object" && "unref" in timeoutId) {
    (timeoutId as { unref(): void }).unref();
  }
}
