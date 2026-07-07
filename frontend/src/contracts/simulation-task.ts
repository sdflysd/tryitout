import type {
  InteractionMode,
  SimulationApiResponse,
  SimulationProgressEvent,
  SimulationType,
  UserInput,
} from "../types.js";
import type { ProviderMode } from "./commercial.js";

export const SIMULATION_TASK_STATUSES = [
  "queued",
  "running",
  "paused",
  "recoverable_failed",
  "failed",
  "completed",
  "cancelled",
] as const;

export type SimulationTaskStatus = typeof SIMULATION_TASK_STATUSES[number];
export type SimulationExecutionMode = InteractionMode;

export interface CreateSimulationTaskRequest {
  userInput: UserInput;
  interactionMode?: SimulationExecutionMode;
  providerMode?: ProviderMode;
  priority?: number;
  queueWeight?: number;
  idempotencyKey?: string;
}

export interface CreateSimulationTaskResponse {
  simulationId: string;
  status: SimulationTaskStatus;
}

export interface SimulationTaskStatusResponse {
  simulationId: string;
  scenarioType: SimulationType;
  mode: SimulationExecutionMode;
  status: SimulationTaskStatus;
  currentStageIndex?: number;
  currentStepName?: string;
  progressPercent: number;
  recoverable: boolean;
  errorCode?: string;
  updatedAt: string;
}

export interface SimulationTaskEvent {
  type:
    | "task_started"
    | "step_started"
    | "step_completed"
    | "stage_completed"
    | "recoverable_failed"
    | "resumed"
    | "completed"
    | "cancelled";
  simulationId: string;
  progress?: SimulationProgressEvent;
  status?: SimulationTaskStatusResponse;
  report?: SimulationApiResponse;
}

export interface SimulationReportResponse {
  simulationId: string;
  status: SimulationTaskStatus;
  report?: SimulationApiResponse;
  error?: string;
}

export function isRecoverableTaskStatus(status: SimulationTaskStatus): boolean {
  return status === "recoverable_failed";
}
