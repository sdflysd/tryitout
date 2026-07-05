import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AiCallRequest, AiCallResult, AiProviderType } from "./types.js";

export interface AiDebugTraceEntry {
  timestamp: string;
  provider: AiProviderType;
  modelProfileId: string;
  modelId: string;
  step: AiCallRequest["step"];
  scenarioType: AiCallRequest["scenarioType"];
  simulationId?: string;
  userId?: string;
  stageIndex?: number;
  success: boolean;
  latencyMs?: number;
  requestId?: string;
  stopReason?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
  promptChars?: number;
  responseChars?: number;
  generationConfig?: AiCallRequest["generationConfig"];
  interactionMetadata?: {
    activatedAgentCount?: number;
    requiredActionCount?: number;
    previousActionCount?: number;
  };
  systemPrompt?: string;
  userPrompt: string;
  responseData?: unknown;
  rawText?: string;
}

export type AiDebugTraceWriter = (entry: AiDebugTraceEntry) => void | Promise<void>;

export function createDebugTraceEntry(
  request: AiCallRequest,
  result: AiCallResult | undefined,
  error: unknown,
): AiDebugTraceEntry {
  return {
    timestamp: new Date().toISOString(),
    provider: result?.provider ?? request.modelProfile.provider,
    modelProfileId: result?.modelProfileId ?? request.modelProfile.id,
    modelId: result?.modelId ?? request.modelProfile.modelId,
    step: request.step,
    scenarioType: request.scenarioType,
    simulationId: request.metadata.simulationId,
    userId: request.metadata.userId,
    stageIndex: getSafeStageIndex(request.metadata.stageIndex),
    success: !error,
    latencyMs: result?.latencyMs,
    requestId: result?.requestId,
    stopReason: result?.stopReason,
    errorCode: getErrorCode(error),
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage: error instanceof Error ? error.message : undefined,
    promptChars: getPromptChars(request),
    responseChars: result?.rawText?.length,
    generationConfig: request.generationConfig,
    interactionMetadata: getInteractionMetadata(request),
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    responseData: result?.data,
    rawText: result?.rawText,
  };
}

function getPromptChars(request: AiCallRequest): number {
  return [request.systemPrompt, request.userPrompt]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .length;
}

function getInteractionMetadata(
  request: AiCallRequest,
): AiDebugTraceEntry["interactionMetadata"] | undefined {
  const {
    activatedAgentCount,
    requiredActionCount,
    previousActionCount,
  } = request.metadata;

  if (
    activatedAgentCount === undefined &&
    requiredActionCount === undefined &&
    previousActionCount === undefined
  ) {
    return undefined;
  }

  return {
    activatedAgentCount,
    requiredActionCount,
    previousActionCount,
  };
}

export function isAgentDebugLoggingEnabled(
  env: { ENABLE_AGENT_DEBUG_LOGS?: string } = process.env,
): boolean {
  return env.ENABLE_AGENT_DEBUG_LOGS?.toLowerCase() === "true";
}

export function createAgentDebugTraceWriter({
  rootDir = path.join(process.cwd(), "..", "output", "agent-debug"),
}: {
  rootDir?: string;
} = {}): AiDebugTraceWriter {
  return async (entry) => {
    const simulationId = entry.simulationId ?? "no_simulation";
    const dir = path.join(rootDir, sanitizePathSegment(simulationId));
    const filePath = path.join(dir, "agent-debug.jsonl");

    await mkdir(dir, { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  };
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

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") {
    return String(code).substring(0, 80);
  }

  return undefined;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}
