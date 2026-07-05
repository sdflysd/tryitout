import { GeminiAdapter } from "./adapters/gemini.adapter.js";
import type { AiProviderAdapter } from "./adapters/provider-adapter.js";
import { createLogEntry, type AiCallLogEntry } from "./call-log.js";
import {
  createDebugTraceEntry,
  type AiDebugTraceEntry,
  type AiDebugTraceWriter,
} from "./debug-trace.js";
import { getPolicyForScenario } from "./model-policy.js";
import { assertCapabilities, resolveModel } from "./model-router.js";
import { createProviderAdapters } from "./provider-config.js";
import type {
  AiCallRequest,
  AiCallResult,
  AiProviderType,
  ModelSelection,
  SimulationStep,
  SimulationType,
} from "./types.js";

export interface AiGatewayOptions {
  adapters?: AiProviderAdapter[];
  onLog?: (entry: AiCallLogEntry) => void;
  onDebugTrace?: AiDebugTraceWriter;
}

export interface CreateAiCallRequestParams {
  step: SimulationStep;
  scenarioType: SimulationType;
  modelSelection?: ModelSelection;
  systemPrompt?: string;
  userPrompt: string;
  jsonSchema?: Record<string, unknown>;
  metadata?: AiCallRequest["metadata"];
}

export class AiGateway {
  private readonly adapters = new Map<AiProviderType, AiProviderAdapter>();
  onLog?: (entry: AiCallLogEntry) => void;
  onDebugTrace?: AiDebugTraceWriter;

  constructor(apiKey = "", options: AiGatewayOptions = {}) {
    this.onLog = options.onLog;
    this.onDebugTrace = options.onDebugTrace;

    const adapters =
      options.adapters ??
      (apiKey ? [new GeminiAdapter(apiKey)] : createProviderAdapters());

    for (const adapter of adapters) {
      this.registerAdapter(adapter);
    }
  }

  registerAdapter(adapter: AiProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  async generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>> {
    const adapter = this.adapters.get(request.modelProfile.provider);
    if (!adapter) {
      throw new Error(
        `No AI provider adapter registered for provider: ${request.modelProfile.provider}`,
      );
    }

    let result: AiCallResult<T> | undefined;
    let error: unknown;

    try {
      result = await adapter.generateJson<T>(request);
      return result;
    } catch (caughtError) {
      error = caughtError;
      throw caughtError;
    } finally {
      this.emitLog(
        createLogEntry(
          request,
          result,
          error,
          buildPromptHashInput(request),
        ),
      );
      this.emitDebugTrace(createDebugTraceEntry(request, result, error));
    }
  }

  private emitLog(entry: AiCallLogEntry): void {
    try {
      this.onLog?.(entry);
    } catch {
      // Logging must not affect provider call outcomes.
    }
  }

  private emitDebugTrace(entry: AiDebugTraceEntry): void {
    try {
      const write = this.onDebugTrace?.(entry);
      if (write && typeof (write as Promise<void>).catch === "function") {
        void (write as Promise<void>).catch(() => undefined);
      }
    } catch {
      // Debug tracing must not affect provider call outcomes.
    }
  }

  createRequest(params: CreateAiCallRequestParams): AiCallRequest {
    const profile = resolveModel(
      params.modelSelection,
      params.scenarioType,
      params.step,
    );
    const stepConfig = getPolicyForScenario(params.scenarioType).steps[params.step];

    assertCapabilities(profile, stepConfig.requiredCapabilities);

    return {
      step: params.step,
      scenarioType: params.scenarioType,
      modelProfile: profile,
      generationConfig: {
        maxOutputTokens: stepConfig.maxOutputTokens,
        timeoutMs: stepConfig.timeoutMs,
        maxRetries: stepConfig.maxRetries,
      },
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      responseFormat: params.jsonSchema ? "json_schema" : "json",
      jsonSchema: params.jsonSchema,
      metadata: params.metadata ?? {},
    };
  }
}

function buildPromptHashInput(request: AiCallRequest): string {
  return [request.systemPrompt, request.userPrompt]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}
