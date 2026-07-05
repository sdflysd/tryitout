const TRANSIENT_MESSAGE_PATTERNS = [
  "unavailable",
  "rate limit",
  "high demand",
  "exhausted",
  "temporary",
  "fetch failed",
  "network",
  "timeout",
  "timed out",
  "abort",
  "aborted",
  "connection reset",
  "connection refused",
];

const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ABORT_ERR",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const TRANSIENT_ERROR_NAMES = new Set(["AbortError", "TimeoutError"]);

function getErrorRecord(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return error as Record<string, unknown>;
}

function getErrorStatus(error: unknown): number | undefined {
  const record = getErrorRecord(error);
  if (!record) {
    return undefined;
  }

  const status =
    record.status ??
    record.statusCode ??
    (typeof record.code === "number" ? record.code : undefined);

  if (typeof status === "string") {
    const parsedStatus = Number(status);
    return Number.isInteger(parsedStatus) ? parsedStatus : undefined;
  }

  return typeof status === "number" ? status : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  const record = getErrorRecord(error);
  const code = record?.code;

  return typeof code === "string" ? code.toUpperCase() : undefined;
}

function getErrorName(error: unknown): string | undefined {
  const record = getErrorRecord(error);
  const name = record?.name;

  return typeof name === "string" ? name : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const causeMessage =
      error.cause instanceof Error ? ` ${error.cause.message}` : "";

    return `${error.message}${causeMessage}`;
  }

  return String(error);
}

function isTransientError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (
    status === 408 ||
    status === 429 ||
    status === 503 ||
    (status !== undefined && status >= 500)
  ) {
    return true;
  }

  const code = getErrorCode(error);
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  const name = getErrorName(error);
  if (name && TRANSIENT_ERROR_NAMES.has(name)) {
    return true;
  }

  const message = getErrorMessage(error);
  const normalizedMessage = message.toLowerCase();

  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface RetryAttemptFailureEvent {
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  willRetry: boolean;
  nextDelayMs?: number;
  error: unknown;
}

export interface RetryOptions {
  onAttemptFailure?: (event: RetryAttemptFailureEvent) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1500,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, maxRetries);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();

    try {
      return await fn();
    } catch (error) {
      const shouldRetry = isTransientError(error) && attempt < maxAttempts;
      const nextDelayMs = shouldRetry
        ? baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs
        : undefined;

      options.onAttemptFailure?.({
        attempt,
        maxAttempts,
        elapsedMs: Date.now() - attemptStartedAt,
        willRetry: shouldRetry,
        nextDelayMs,
        error,
      });

      if (!shouldRetry) {
        throw error;
      }

      await delay(nextDelayMs);
    }
  }

  throw new Error("Retry loop exhausted unexpectedly");
}
