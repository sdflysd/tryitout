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
import {
  createOpenAiCompatibleProviderAdapter,
  createProviderAdapters,
  createUserOpenAiCompatibleProfile,
} from "./provider-config.js";
import type {
  AiCallRequest,
  AiCallResult,
  AiProviderType,
  ModelProfile,
  ModelQuality,
  ModelSelection,
  SimulationStep,
  SimulationType,
} from "./types.js";

type ResolveModelFn = (
  selection: ModelSelection | undefined,
  scenarioType: SimulationType,
  step: SimulationStep,
) => ModelProfile;

export interface AiGatewayOptions {
  adapters?: AiProviderAdapter[];
  onLog?: (entry: AiCallLogEntry) => void;
  onDebugTrace?: AiDebugTraceWriter;
  resolveModel?: ResolveModelFn;
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
  private readonly resolveModel: ResolveModelFn;
  onLog?: (entry: AiCallLogEntry) => void;
  onDebugTrace?: AiDebugTraceWriter;

  constructor(apiKey = "", options: AiGatewayOptions = {}) {
    this.onLog = options.onLog;
    this.onDebugTrace = options.onDebugTrace;
    this.resolveModel = options.resolveModel ?? resolveModel;

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
    const profile = this.resolveModel(
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

export function createUserOpenAiCompatibleGateway(input: {
  apiKey: string;
  baseUrl: string;
  model: string | Record<ModelQuality, string>;
  adapter?: AiProviderAdapter;
}): AiGateway {
  return new AiGateway("", {
    adapters: [
      input.adapter ??
        createOpenAiCompatibleProviderAdapter({
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
        }),
    ],
    resolveModel: (selection, scenarioType, step) =>
      createUserOpenAiCompatibleProfile({
        quality: resolveUserModelQuality(selection, scenarioType, step),
        baseUrl: input.baseUrl,
        model: resolveUserModelId(input.model, selection, scenarioType, step),
      }),
  });
}

function resolveUserModelQuality(
  selection: ModelSelection | undefined,
  scenarioType: SimulationType,
  step: SimulationStep,
): ModelQuality {
  return selection?.mode ?? getPolicyForScenario(scenarioType).steps[step]?.quality ?? "balanced";
}

function resolveUserModelId(
  model: string | Record<ModelQuality, string>,
  selection: ModelSelection | undefined,
  scenarioType: SimulationType,
  step: SimulationStep,
): string {
  if (typeof model === "string") {
    return model;
  }
  const quality = resolveUserModelQuality(selection, scenarioType, step);
  return model[quality] || model.balanced || model.deep || model.fast;
}

function buildPromptHashInput(request: AiCallRequest): string {
  return [request.systemPrompt, request.userPrompt]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}
