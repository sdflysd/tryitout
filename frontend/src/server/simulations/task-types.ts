import type {
  SimulationExecutionMode,
  SimulationTaskStatus,
} from "../../contracts/simulation-task.js";
import type {
  Agent,
  AgentAction,
  AgentRelationship,
  SimulationApiResponse,
  SimulationProgressEvent,
  SimulationProgressStep,
  SimulationStage,
  SimulationType,
  UserInput,
  WorldState,
} from "../../types.js";

export interface SimulationTaskRecord {
  id: string;
  userInput: UserInput;
  scenarioType: SimulationType;
  mode: SimulationExecutionMode;
  status: SimulationTaskStatus;
  currentStageIndex?: number;
  currentStepName?: string;
  progressPercent: number;
  recoverable: boolean;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationCheckpointRecord {
  id: string;
  simulationId: string;
  stageIndex?: number;
  stepName: string;
  checkpoint: SimulationCheckpointPayload;
  createdAt: string;
}

export interface SimulationCheckpointPayload {
  userInput: UserInput;
  mode: SimulationExecutionMode;
  safetyChecked?: boolean;
  agents?: Agent[];
  worldState?: WorldState;
  completedStages?: SimulationStage[];
  actionHistory?: AgentAction[];
  relationships?: AgentRelationship[];
  completedReport?: SimulationApiResponse;
  nextStep?: SimulationProgressStep | string;
  publicEvents?: SimulationProgressEvent[];
}

export type SimulationStepRunStatus = "started" | "completed" | "failed";

export interface SimulationStepRunRecord {
  id: string;
  simulationId: string;
  stageIndex?: number;
  stepName: string;
  roundIndex?: number;
  agentId?: string;
  provider?: string;
  modelId?: string;
  modelProfileId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  estimatedCost?: number;
  latencyMs?: number;
  retryCount?: number;
  status: SimulationStepRunStatus;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
}

export interface SimulationReportRecord {
  simulationId: string;
  publicReport?: SimulationApiResponse;
  deepReport?: unknown;
  shareCard?: unknown;
  unlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createInitialSimulationTask({
  simulationId,
  userInput,
  mode,
  now,
}: {
  simulationId: string;
  userInput: UserInput;
  mode: SimulationExecutionMode;
  now: string;
}): SimulationTaskRecord {
  return {
    id: simulationId,
    userInput,
    scenarioType: userInput.type,
    mode,
    status: "queued",
    progressPercent: 0,
    recoverable: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createStepRunId({
  simulationId,
  stageIndex,
  stepName,
  roundIndex,
  agentId,
}: {
  simulationId: string;
  stageIndex?: number;
  stepName: string;
  roundIndex?: number;
  agentId?: string;
}): string {
  return [
    simulationId,
    stageIndex ?? "global",
    stepName,
    roundIndex ?? "none",
    agentId ?? "world",
  ].join(":");
}
