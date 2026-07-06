export type SimulationType = "side_hustle" | "dating" | "life_choice";

export type SimulationStep =
  | "full_simulation"
  | "parse_scenario"
  | "generate_agents"
  | "initialize_world_state"
  | "simulate_stage"
  | "generate_world_event"
  | "generate_agent_actions"
  | "arbitrate_stage"
  | "generate_report"
  | "generate_route_comparison"
  | "generate_share_card"
  | "json_repair"
  | "safety_check";

export type AiProviderType =
  | "gemini"
  | "anthropic"
  | "openai_compatible"
  | "ollama";

export type ModelQuality = "fast" | "balanced" | "deep";

export interface ModelCapabilities {
  supportsJsonMode: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolUse: boolean;
  supportsSystemPrompt: boolean;
  supportsReasoningEffort: boolean;
  supportsThinking: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  recommendedForLongReport: boolean;
  recommendedForFastTasks: boolean;
  recommendedForDeepSimulation: boolean;
}

export interface ModelGenerationDefaults {
  maxOutputTokens: number;
  quality: ModelQuality;
  responseFormat: "text" | "json" | "json_schema";
  stream: boolean;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  thinkingMode?: "off" | "adaptive";
  timeoutMs: number;
  maxRetries: number;
}

export interface ModelLimits {
  maxInputChars: number;
  maxOutputTokens: number;
  maxRequestsPerMinute?: number;
  maxRequestsPerUserPerDay?: number;
  maxCostUsdPerRequest?: number;
  maxCostUsdPerUserPerDay?: number;
}

export interface ModelProfile {
  id: string;
  name: string;
  description?: string;
  provider: AiProviderType;
  displayName: string;
  modelId: string;
  visibleToUser: boolean;
  allowUserModelOverride: boolean;
  allowUserApiKey: boolean;
  allowCustomBaseUrl: boolean;
  allowedBaseUrls?: string[];
  baseUrl?: string;
  capabilities: ModelCapabilities;
  defaults: ModelGenerationDefaults;
  limits: ModelLimits;
  status: "active" | "disabled" | "deprecated";
  createdAt: string;
  updatedAt: string;
}

export interface StepModelConfig {
  modelProfileId: string;
  allowUserOverride: boolean;
  allowedUserProfileIds?: string[];
  quality: ModelQuality;
  requiredCapabilities: Partial<ModelCapabilities>;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface AgentModelPolicy {
  scenarioType: SimulationType;
  steps: {
    full_simulation: StepModelConfig;
    parse_scenario: StepModelConfig;
    generate_agents: StepModelConfig;
    initialize_world_state: StepModelConfig;
    simulate_stage: StepModelConfig;
    generate_world_event: StepModelConfig;
    generate_agent_actions: StepModelConfig;
    arbitrate_stage: StepModelConfig;
    generate_report: StepModelConfig;
    generate_route_comparison: StepModelConfig;
    generate_share_card: StepModelConfig;
    json_repair: StepModelConfig;
    safety_check: StepModelConfig;
  };
}

export interface ModelSelection {
  mode?: ModelQuality;
  modelProfileId?: string;
  userCredentialId?: string;
  modelIdOverride?: string;
}

export interface AiCallRequest {
  step: SimulationStep;
  scenarioType: SimulationType;
  modelProfile: ModelProfile;
  generationConfig: {
    maxOutputTokens: number;
    timeoutMs: number;
    maxRetries: number;
  };
  systemPrompt?: string;
  userPrompt: string;
  responseFormat: "text" | "json" | "json_schema";
  jsonSchema?: Record<string, unknown>;
  metadata: {
    simulationId?: string;
    userId?: string;
    stageIndex?: number;
    activatedAgentCount?: number;
    requiredActionCount?: number;
    previousActionCount?: number;
  };
}

export interface AiCallResult<T = unknown> {
  data: T;
  rawText?: string;
  provider: AiProviderType;
  modelId: string;
  modelProfileId: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  latencyMs: number;
  requestId?: string;
  stopReason?: string;
  transport?: "single_response" | "stream";
  firstByteLatencyMs?: number;
  streamChunkCount?: number;
}
