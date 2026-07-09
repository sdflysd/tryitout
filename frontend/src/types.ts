export type SimulationType = 'side_hustle' | 'dating' | 'life_choice';
export type ModelSelectionMode = 'fast' | 'balanced' | 'deep';

export type SimulationProgressStep =
  | "safety_check"
  | "generate_agents"
  | "initialize_world_state"
  | "simulate_stage"
  | "generate_world_event"
  | "generate_agent_actions"
  | "arbitrate_stage"
  | "generate_report"
  | "generate_route_comparison";

export type SimulationProgressStatus = "queued" | "started" | "completed" | "failed";

export interface SimulationProgressEvent {
  simulationId: string;
  step: SimulationProgressStep;
  status: SimulationProgressStatus;
  percent: number;
  message: string;
  stageIndex?: number;
  createdAt?: string;
}

export interface ModelSelection {
  mode?: ModelSelectionMode;
  modelProfileId?: string;
  userCredentialId?: string;
}

export interface SimulationRequest {
  userInput: UserInput;
  modelSelection?: ModelSelection;
  interactionMode?: InteractionMode;
}

export type InteractionMode = "legacy" | "enabled";

export interface AgentRuntimeCapabilities {
  deepModeAvailable: boolean;
  defaultInteractionMode: InteractionMode;
  fallbackPolicy: "safe_stage_fallback";
  providerConfigured: boolean;
  reason: string;
}

export interface LifeChoiceOption {
  label: string;
  title: string;
  description?: string;
}

export interface UserInput {
  type: SimulationType;
  
  // Side Hustle Specific
  projectIdea?: string;
  targetUser?: string;
  skills?: string[];
  dailyTime?: string;
  budget?: string;
  monetization?: string;
  acquisitionChannel?: string[];
  userStatus?: string;

  // Dating Specific
  relationshipStatus?: string;
  datingDuration?: string;
  targetPersonality?: string;
  chatLogOrIssue?: string;
  proposedAction?: string;

  // Life Choice Specific
  decisionContext?: string;
  lifeChoiceOptions?: LifeChoiceOption[];
  optionA?: string;
  optionB?: string;
  financialBuffer?: string;
  familySupport?: string;
  coreFear?: string;
}

export type AgentLayer = "core" | "peripheral" | "temporary" | "arbiter";

export type MbtiType =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

export interface AgentPersonalityKernel {
  mbtiType: MbtiType;
  riskTolerance: number;
  conflictStyle: "direct" | "diplomatic" | "avoidant" | "probing" | "provocative";
  evidencePreference: "data" | "emotion" | "experience" | "authority" | "social_proof";
  emotionalSensitivity: number;
  persuasionThreshold: number;
  memoryBias: "trust_building" | "risk_anchored" | "status_sensitive" | "novelty_seeking" | "loss_averse";
}

export type AgentVerdict = "continue" | "pivot" | "stop" | "wait" | "escalate";

export interface AgentMemory {
  trustByAgentId: Record<string, number>;
  claimsRemembered: string[];
  lastPosition?: AgentVerdict;
}

export type AgentRoleCardCategory =
  | "user_inner_system"
  | "stakeholder"
  | "opposition_competition"
  | "environment_system"
  | "expert_arbiter"
  | "counterfactual_system";

export interface AgentRoleCard {
  category: AgentRoleCardCategory;
  identity: string;
  realWorldArchetype: string;
  relationshipToUser: string;
  goal: string;
  fears: string[];
  knownInfo: string[];
  unknownInfo: string[];
  capabilities: string[];
  triggerConditions: string[];
  decisionModel: string;
  stateInfluence: string[];
  speakingStyle: string;
  forbiddenBehaviors: string[];
  memoryPolicy: string;
}

export type AgentRoleCardDraft = Partial<AgentRoleCard>;

export type AgentActionType =
  | "like"
  | "dislike"
  | "reply"
  | "challenge"
  | "support"
  | "warn"
  | "vote"
  | "update_memory";

export interface WorldStateDelta {
  day?: number;
  productClarity?: number;
  executionEnergy?: number;
  trafficProgress?: number;
  trialUsers?: number;
  paidUsers?: number;
  revenue?: number;
  riskLevel?: number;
  confidence?: number;
}

export interface AgentAction {
  id: string;
  type: AgentActionType;
  actorAgentId: string;
  targetAgentId?: string;
  content: string;
  reason: string;
  impact: "positive" | "negative" | "neutral";
  stateDeltaHint?: WorldStateDelta;
}

export interface AgentVote {
  agentId: string;
  verdict: AgentVerdict;
  confidence: number;
  stateDeltaVote: WorldStateDelta;
  rationale: string;
}

export interface AgentRelationship {
  fromAgentId: string;
  toAgentId: string;
  trust: number;
  alignment: number;
}

export interface StageInteractions {
  activatedAgentIds: string[];
  actions: AgentAction[];
  votes: AgentVote[];
  relationships: AgentRelationship[];
  mergedVoteDelta: WorldStateDelta;
  finalDelta: WorldStateDelta;
  arbiterSummary: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  layer?: AgentLayer;
  stance: string; // '支持' | '质疑' | '观望' | '拷打'
  personality?: string;
  personalityKernel?: AgentPersonalityKernel;
  roleCard?: AgentRoleCardDraft;
  memory?: AgentMemory;
  keyJudgment: string;
  objection?: string;
  score?: number;
}

export interface WorldState {
  day: number;
  // Generic numeric attributes that map perfectly across types
  productClarity: number; // 0-100 (or RelationshipClarity / DecisionClarity)
  executionEnergy: number; // 0-100 (or Energy/Motivation)
  trafficProgress: number; // 0-100 (or TrustProgress / OptionAProgress)
  trialUsers: number; // side_hustle specific or can be general stat
  paidUsers: number; // side_hustle specific or can be general stat
  revenue: number; // side_hustle specific or can be general stat
  riskLevel: number; // 0-100
  confidence: number; // 0-100
}

export interface Event {
  type: 'execution' | 'customer_feedback' | 'competitor_pressure' | 'platform_traffic' | 'external_influence' | 'monetization_attempt' | 'dating_response' | 'emotional_clash' | 'reality_check';
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface AgentReaction {
  agentId: string;
  agentName: string;
  quote: string;
  interpretation: string;
  fieldAffected: string;
  delta: number;
}

export interface SimulationStage {
  stageIndex: number;
  timeRange: string;
  title: string;
  summary: string;
  events: Event[];
  agentReactions: AgentReaction[];
  interactions?: StageInteractions;
  stateAfter: WorldState;
  keyDecision: string;
  nextSuggestion: string;
}

export type StageRuntimeMode = "legacy" | "interactive" | "fallback";

export interface StageRuntimeDiagnostic {
  stageIndex: number;
  mode: StageRuntimeMode;
  activatedAgentCount: number;
  actionCount: number;
  voteCount: number;
  relationshipCount: number;
}

export interface SimulationRuntimeDiagnostics {
  requestedInteractionMode: InteractionMode;
  interactionModeUsed: InteractionMode;
  deepModeAvailable: boolean;
  fallbackStageCount: number;
  stages: StageRuntimeDiagnostic[];
}

export interface Report {
  projectName: string;
  disclaimer?: string;
  successProbability: number;
  expectedRevenue: string; // (or DatingOutcome/ChoiceOutcome description)
  riskLevel: 'low' | 'medium' | 'high' | 'very_high';
  finalRecommendation: string;
  scores: {
    demandStrength: number; // For Dating: 好感度/吸引力. For Choice: A收益潜力
    willingnessToPay: number; // For Dating: 信任深度/包容度. For Choice: B收益潜力
    acquisitionDifficulty: number; // For Dating: 沟通阻力/雷区. For Choice: A阻力
    competitionPressure: number; // For Dating: 竞对威胁/情绪内耗. For Choice: B阻力
    executionFit: number; // 执行匹配度 / 自身抗压能力
    monetizationClarity: number; // 变现清晰度 / 现实面包保障 (Dating: 现实面包度, Choice: 长远成长性)
  };
  finalOutcome: string;
  opportunities: string[];
  risks: string[];
  pivotSuggestions: {
    title: string;
    description: string;
  }[];
  agentEvidence?: {
    conclusion: string;
    supportingAgentIds: string[];
    opposingAgentIds: string[];
    evidence: string;
  }[];
  disagreementSummary?: string;
  actionPlan7Days: {
    day: number;
    title: string;
    action: string;
  }[];
  shouldDo: 'strong_yes' | 'test_small' | 'not_directly' | 'change_direction' | 'not_recommended';
}

export interface SimulationRoute {
  id: string;
  label: string;
  title: string;
  premise: string;
  stageSummaries: string[];
  finalState: WorldState;
  successProbability: number;
  regretRisk: number;
  upside: string;
  downside: string;
  triggerToChoose: string;
}

export interface RouteComparison {
  recommendedRouteId: string;
  routes: SimulationRoute[];
  tradeoffs: string[];
  sensitivityVariables: string[];
  sevenDayProbe: string[];
}

export interface Simulation {
  id: string;
  type: SimulationType;
  userInput: UserInput;
  agents: Agent[];
  stages: SimulationStage[];
  report: Report;
  createdAt: string;
  interactionModeUsed?: InteractionMode;
  runtimeDiagnostics?: SimulationRuntimeDiagnostics;
  routeComparison?: RouteComparison;
}

export interface SimulationApiResponse {
  id: string;
  status: "completed";
  agents: Agent[];
  stages: SimulationStage[];
  report: Report;
  createdAt: string;
  interactionModeUsed?: InteractionMode;
  runtimeDiagnostics?: SimulationRuntimeDiagnostics;
  routeComparison?: RouteComparison;
}
