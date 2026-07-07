import { Worker } from "bullmq";

import { AiGateway } from "../ai/ai-gateway.js";
import { getConfiguredProvider, getMissingProviderConfigMessage } from "../ai/provider-config.js";
import { runMultiAgentSimulation, type MultiAgentSimulationResult } from "../simulations/multi-agent-runner.js";
import {
  createCommercialSimulationGatewayForProvider,
} from "./commercial-provider-gateway.js";
import {
  createCommercialServices,
  type CommercialRuntimeServices,
} from "./commercial-services.js";
import type {
  CommercialSimulationTaskRecord,
} from "./types.js";
import { SIMULATION_QUEUE_NAME } from "./bullmq-simulation-queue.js";
import {
  runCommercialSimulationQueueJob,
} from "./simulation-worker.js";
import {
  WeightedConcurrencyLimiter,
  type SimulationQueueJob,
  type SimulationQueueJobData,
} from "./simulation-queue.js";
import type {
  CommercialTaskProviderRuntime,
} from "./commercial-task-service.js";
import type {
  Report,
  SimulationApiResponse,
  UserInput,
} from "../../types.js";

interface WorkerJobLike {
  id?: string;
  data: SimulationQueueJobData;
}

interface BuildRunSimulationOptions<TGateway = AiGateway> {
  getTask(taskId: string): Promise<Pick<CommercialSimulationTaskRecord, "id" | "userInput" | "interactionMode"> | undefined>;
  createGateway(providerRuntime: CommercialTaskProviderRuntime): TGateway;
  runMultiAgentSimulation(input: {
    gateway: TGateway;
    simulationId: string;
    userInput: UserInput;
    interactionMode: CommercialSimulationTaskRecord["interactionMode"];
  }): Promise<MultiAgentSimulationResult>;
}

export function parseCommercialTaskUserInput(rawUserInput: string): UserInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUserInput);
  } catch {
    throw new Error("Commercial task userInput must be valid JSON.");
  }

  if (!isUserInput(parsed)) {
    throw new Error("Commercial task userInput must include a valid type.");
  }

  return parsed;
}

export function buildRunCommercialSimulation<TGateway = AiGateway>(
  options: BuildRunSimulationOptions<TGateway>,
) {
  return async (
    job: SimulationQueueJob,
    providerRuntime: CommercialTaskProviderRuntime,
  ): Promise<SimulationApiResponse> => {
    const task = await options.getTask(job.data.taskId);
    if (!task) {
      throw new Error("commercial task not found");
    }

    const gateway = options.createGateway(providerRuntime);
    const userInput = parseCommercialTaskUserInput(task.userInput);
    const result = await options.runMultiAgentSimulation({
      gateway,
      simulationId: task.id,
      userInput,
      interactionMode: task.interactionMode,
    });

    return toSimulationApiResponse(task.id, task.interactionMode, result);
  };
}

export function createRedisConnectionFromUrl(redisUrl: string): unknown {
  const parsed = new URL(redisUrl);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: decodeURIComponent(parsed.username || ""),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

export function buildWorkerJob(job: WorkerJobLike): SimulationQueueJob {
  return {
    id: job.id ?? job.data.taskId,
    data: job.data,
  };
}

export function startCommercialWorker(
  services: CommercialRuntimeServices = requireCommercialServices(),
): Worker {
  const maxWeight = Number(process.env.MAX_WEIGHTED_CONCURRENCY ?? 6);
  const limiter = new WeightedConcurrencyLimiter(
    Number.isFinite(maxWeight) && maxWeight > 0 ? maxWeight : 6,
  );
  const runSimulation = buildRunCommercialSimulation({
    getTask: (taskId) => services.repository.getCommercialTask(taskId),
    createGateway: createPlatformAwareGateway,
    runMultiAgentSimulation: ({ gateway, simulationId, userInput, interactionMode }) =>
      runMultiAgentSimulation({
        gateway,
        simulationId,
        userInput,
        interactionMode,
      }),
  });

  return new Worker(
    SIMULATION_QUEUE_NAME,
    async (job: WorkerJobLike) =>
      runCommercialSimulationQueueJob({
        job: buildWorkerJob(job),
        taskService: services.taskService,
        limiter,
        runSimulation,
      }),
    {
      connection: createRedisConnectionFromUrl(process.env.REDIS_URL ?? "redis://localhost:6379"),
      concurrency: Math.max(1, Number(process.env.MAX_WEIGHTED_CONCURRENCY ?? 6)),
    },
  );
}

function requireCommercialServices(): CommercialRuntimeServices {
  const services = createCommercialServices();
  if (!services) {
    throw new Error("Commercial worker requires COMMERCIAL_MODE_ENABLED=true.");
  }
  return services;
}

function createPlatformAwareGateway(providerRuntime: CommercialTaskProviderRuntime): AiGateway {
  return createCommercialSimulationGatewayForProvider(providerRuntime, {
    createPlatformGateway: createPlatformGateway,
  });
}

function createPlatformGateway(): AiGateway {
  const provider = getConfiguredProvider();
  const missingConfigMessage = getMissingProviderConfigMessage(provider);
  if (missingConfigMessage) {
    throw new Error(missingConfigMessage);
  }
  return new AiGateway();
}

function toSimulationApiResponse(
  taskId: string,
  interactionMode: CommercialSimulationTaskRecord["interactionMode"],
  result: MultiAgentSimulationResult,
): SimulationApiResponse {
  return {
    id: taskId,
    status: "completed",
    agents: result.agents,
    stages: result.stages,
    report: result.report as Report,
    createdAt: new Date().toISOString(),
    interactionModeUsed: interactionMode,
    routeComparison: result.routeComparison,
  };
}

function isUserInput(value: unknown): value is UserInput {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (
      (value as { type?: unknown }).type === "side_hustle" ||
      (value as { type?: unknown }).type === "dating" ||
      (value as { type?: unknown }).type === "life_choice"
    )
  );
}
