export function parseJsonResponse<T>(rawText: string): T {
  const cleaned = cleanJsonText(rawText);
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      Object.assign(error, {
        code: "ai_json_parse_error",
        rawText: cleaned,
        parserMessage: error.message,
      });
    }
    throw error;
  }
}

export function cleanJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fencedJson?.[1]?.trim() ?? trimmed;
}

export function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }

  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (typeof timeoutId === "object" && "unref" in timeoutId) {
    (timeoutId as { unref(): void }).unref();
  }

  return controller.signal;
}

export function getCappedMaxOutputTokens(
  request: {
    generationConfig?: {
      maxOutputTokens: number;
    };
    modelProfile: {
      defaults: { maxOutputTokens: number };
      limits: { maxOutputTokens: number };
      capabilities: { maxOutputTokens: number };
    };
  },
): number {
  const { modelProfile } = request;
  const requestedMaxOutputTokens =
    request.generationConfig?.maxOutputTokens ?? modelProfile.defaults.maxOutputTokens;

  return Math.min(
    requestedMaxOutputTokens,
    modelProfile.limits.maxOutputTokens,
    modelProfile.capabilities.maxOutputTokens,
  );
}

export function getRequestTimeoutMs(
  request: {
    generationConfig?: {
      timeoutMs: number;
    };
    modelProfile: {
      defaults: { timeoutMs: number };
    };
  },
): number {
  return request.generationConfig?.timeoutMs ?? request.modelProfile.defaults.timeoutMs;
}

export function getRequestMaxRetries(
  request: {
    generationConfig?: {
      maxRetries: number;
    };
    modelProfile: {
      defaults: { maxRetries: number };
    };
  },
): number {
  return request.generationConfig?.maxRetries ?? request.modelProfile.defaults.maxRetries;
}

export function logRetryAttempt(
  request: {
    step: string;
    scenarioType: string;
    metadata?: {
      stageIndex?: number;
    };
    modelProfile: {
      provider: string;
      id: string;
      modelId: string;
    };
  },
  event: {
    attempt: number;
    maxAttempts: number;
    elapsedMs: number;
    willRetry: boolean;
    nextDelayMs?: number;
    error: unknown;
  },
): void {
  const error = event.error;
  const errorRecord =
    error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const errorName =
    error instanceof Error
      ? error.name
      : typeof errorRecord.name === "string"
        ? errorRecord.name
        : undefined;
  const errorCode =
    typeof errorRecord.code === "string" || typeof errorRecord.code === "number"
      ? String(errorRecord.code).slice(0, 40)
      : undefined;

  console.warn("[AI_RETRY]", JSON.stringify({
    provider: request.modelProfile.provider,
    modelProfileId: request.modelProfile.id,
    modelId: request.modelProfile.modelId,
    step: request.step,
    stageIndex: request.metadata?.stageIndex,
    scenarioType: request.scenarioType,
    attempt: event.attempt,
    maxAttempts: event.maxAttempts,
    elapsedMs: event.elapsedMs,
    willRetry: event.willRetry,
    nextDelayMs:
      event.nextDelayMs === undefined
        ? undefined
        : Math.round(event.nextDelayMs),
    errorName,
    errorCode,
  }));
}
