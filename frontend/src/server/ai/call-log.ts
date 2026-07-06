import { createHash } from "node:crypto";

import type { AiCallRequest, AiCallResult, AiProviderType } from "./types.js";

export interface AiCallLogEntry {
  timestamp: string;
  provider: AiProviderType;
  modelProfileId: string;
  modelId: string;
  step: AiCallRequest["step"];
  scenarioType: AiCallRequest["scenarioType"];
  promptHash: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  transport?: AiCallResult["transport"];
  firstByteLatencyMs?: number;
  streamChunkCount?: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  simulationId?: string;
  userId?: string;
  stageIndex?: number;
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").substring(0, 16);
}

export function createLogEntry(
  request: AiCallRequest,
  result: AiCallResult | undefined,
  error: unknown,
  promptText: string,
): AiCallLogEntry {
  return {
    timestamp: new Date().toISOString(),
    provider: result?.provider ?? request.modelProfile.provider,
    modelProfileId: result?.modelProfileId ?? request.modelProfile.id,
    modelId: result?.modelId ?? request.modelProfile.modelId,
    step: request.step,
    scenarioType: request.scenarioType,
    promptHash: hashPrompt(promptText),
    inputTokens: result?.usage?.inputTokens,
    outputTokens: result?.usage?.outputTokens,
    latencyMs: result?.latencyMs,
    transport: result?.transport,
    firstByteLatencyMs: result?.firstByteLatencyMs,
    streamChunkCount: result?.streamChunkCount,
    success: !error,
    errorCode: getSafeErrorCode(error),
    errorMessage: getSafeErrorMessage(error),
    requestId: result?.requestId,
    simulationId: getSafeMetadataId(request.metadata.simulationId),
    userId: getSafeMetadataId(request.metadata.userId),
    stageIndex: getSafeStageIndex(request.metadata.stageIndex),
  };
}

function getSafeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") {
    const normalized = String(code).substring(0, 80);
    if (/^(sk|pk|api)[_-]/i.test(normalized)) {
      return undefined;
    }

    return /^[A-Z0-9_:-]+$/i.test(normalized) ? normalized : undefined;
  }

  return undefined;
}

function getSafeErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }

  const sourceText = getErrorClassificationText(error);

  if (/\b(rate[_ -]?limit|too many requests|quota|429)\b/i.test(sourceText)) {
    return "AI provider rate limited";
  }

  if (/\b(timeout|timed out|etimedout|deadline|abort)\b/i.test(sourceText)) {
    return "AI provider timeout";
  }

  if (
    /\b(unavailable|econnrefused|econnreset|enotfound|service unavailable|503|502|504)\b/i
      .test(sourceText)
  ) {
    return "AI provider unavailable";
  }

  if (
    /\b(bad request|invalid request|validation|400|401|403|404|422)\b/i
      .test(sourceText)
  ) {
    return "AI provider request failed";
  }

  return "AI provider error";
}

function getErrorClassificationText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${getSafeErrorCode(error) ?? ""}`;
  }

  if (typeof error === "string") {
    return error;
  }

  const code = getSafeErrorCode(error);
  return code ?? "";
}

function getSafeMetadataId(id: string | undefined): string | undefined {
  return id ? hashPrompt(id) : undefined;
}

function getSafeStageIndex(stageIndex: number | undefined): number | undefined {
  if (
    typeof stageIndex !== "number" ||
    !Number.isInteger(stageIndex) ||
    stageIndex < 1 ||
    stageIndex > 99
  ) {
    return undefined;
  }

  return stageIndex;
}
