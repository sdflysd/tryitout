import { randomUUID } from "node:crypto";

import { AiGateway, createUserOpenAiCompatibleGateway } from "../ai/ai-gateway.js";
import type { AiCallLogEntry } from "../ai/call-log.js";
import { estimateCostForModel } from "../simulations/cost-ledger.js";
import { addSimulationAiCallLogListener } from "../simulations/token-usage-log.js";
import type { MultiAgentSimulationResult } from "../simulations/multi-agent-runner.js";
import type { SimulationCheckpointSnapshot } from "../simulations/multi-agent-runner.js";
import { runMultiAgentSimulation } from "../simulations/multi-agent-runner.js";
import type {
  AgentRuntimeCapabilities,
  SimulationApiResponse,
  SimulationProgressEvent,
  UserInput,
} from "../../types.js";
import type { ModelQuality } from "../ai/types.js";
import { resolveInteractionMode } from "../interaction-mode.js";
import { resolveAgentRuntimeCapabilities } from "../agent-runtime/capabilities.js";
import type { ResolvedProviderForTask } from "./model-provider-service.js";
import { createRepositoryPlatformGateway } from "./platform-model-runtime.js";
import type { CommercialRepository } from "./repository.js";
import type { SimulationQueueJob } from "./simulation-queue.js";
import type {
  SimulationWorkerRunSimulation,
  SimulationWorkerStepRunInput,
} from "./simulation-worker.js";

type RunCommercialSimulation = (input: {
  gateway: AiGateway;
  simulationId: string;
  userInput: UserInput;
  interactionMode: SimulationQueueJob["interactionMode"];
  modelSelection?: SimulationQueueJob["modelSelection"];
  resumeFrom?: SimulationCheckpointSnapshot;
  onCheckpoint?: Parameters<typeof runMultiAgentSimulation>[0]["onCheckpoint"];
  onProgress: Parameters<typeof runMultiAgentSimulation>[0]["onProgress"];
}) => Promise<MultiAgentSimulationResult>;

export interface CommercialWorkerRuntimeOptions {
  job: SimulationQueueJob;
  services: {
    modelProviderService: {
      resolveProviderForTask: (
        userId: string,
        providerMode: SimulationQueueJob["providerMode"],
      ) => Promise<ResolvedProviderForTask>;
    };
    repository?: CommercialRepository;
  };
  getPlatformGateway?: () => AiGateway;
  platformSecretEncryptionKey?: Buffer | Uint8Array;
  resolveCapabilities?: () => AgentRuntimeCapabilities;
  runSimulation?: RunCommercialSimulation;
}

export function createCommercialWorkerRunSimulation(
  options: CommercialWorkerRuntimeOptions,
): SimulationWorkerRunSimulation {
  return async ({ recordStepRun }) => {
    const gateway = await resolveGateway(options);
    const latestCheckpoint = await options.services.repository
      ?.getLatestCommercialCheckpoint(options.job.taskId);
    const pendingStepWrites: Promise<void>[] = [];
    const pendingCheckpointWrites: Promise<void>[] = [];
    const enqueueStepWrite = (run: SimulationWorkerStepRunInput): void => {
      pendingStepWrites.push(recordStepRun(run));
    };
    const enqueueCheckpointWrite = (checkpoint: SimulationCheckpointSnapshot): void => {
      if (!options.services.repository) {
        return;
      }
      pendingCheckpointWrites.push(
        options.services.repository.saveCommercialCheckpoint({
          id: `simulation_checkpoint_${randomUUID()}`,
          taskId: options.job.taskId,
          stageIndex: checkpoint.completedStages?.at(-1)?.stageIndex,
          stepName: checkpoint.nextStep ?? "checkpoint",
          checkpoint,
          createdAt: new Date().toISOString(),
        }),
      );
    };
    const unsubscribe = recordCommercialAiCalls({
      gateway,
      taskId: options.job.taskId,
      enqueueStepWrite,
    });

    try {
      const capabilities =
        options.resolveCapabilities?.() ?? resolveAgentRuntimeCapabilities();
      const interactionMode = resolveInteractionMode(
        capabilities.deepModeAvailable,
        options.job.interactionMode,
      );
      const run = options.runSimulation ?? runMultiAgentSimulation;
      const result = await run({
        gateway,
        simulationId: options.job.taskId,
        userInput: options.job.userInput,
        interactionMode,
        modelSelection: options.job.modelSelection,
        resumeFrom: latestCheckpoint?.checkpoint,
        onCheckpoint: async (checkpoint) => {
          enqueueCheckpointWrite(checkpoint);
        },
        onProgress: async (event) => {
          enqueueStepWrite(toProgressStepRun(event));
        },
      });
      await settleStepWrites(pendingStepWrites);
      await settleStepWrites(pendingCheckpointWrites);

      return {
        ...result,
        id: options.job.taskId,
        status: "completed",
        createdAt: new Date().toISOString(),
        interactionModeUsed: interactionMode,
      } satisfies SimulationApiResponse;
    } finally {
      unsubscribe();
      await settleStepWrites(pendingStepWrites);
      await settleStepWrites(pendingCheckpointWrites);
    }
  };
}

async function resolveGateway(
  options: CommercialWorkerRuntimeOptions,
): Promise<AiGateway> {
  const provider = await options.services.modelProviderService.resolveProviderForTask(
    options.job.userId,
    options.job.providerMode,
  );
  if (provider.mode === "byok") {
    return createUserOpenAiCompatibleGateway({
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model: resolveByokModels(provider),
    });
  }

  if (options.services.repository && options.platformSecretEncryptionKey) {
    const repositoryGateway = await createRepositoryPlatformGateway({
      repository: options.services.repository,
      secretEncryptionKey: options.platformSecretEncryptionKey,
    });
    if (repositoryGateway !== undefined) {
      return repositoryGateway;
    }
  }
  if (options.getPlatformGateway) {
    return options.getPlatformGateway();
  }

  return new AiGateway();
}

function toProgressStepRun(event: SimulationProgressEvent): SimulationWorkerStepRunInput {
  return {
    stepName: event.step,
    stageIndex: event.stageIndex,
    status: toStepRunStatus(event.status),
    startedAt: event.createdAt,
    completedAt:
      event.status === "completed" || event.status === "failed"
        ? event.createdAt
        : undefined,
    metadata: {
      progressPercent: event.percent,
      progressMessage: event.message,
    },
  };
}

function toStepRunStatus(
  status: SimulationProgressEvent["status"],
): SimulationWorkerStepRunInput["status"] {
  return status === "queued" ? "started" : status;
}

function resolveByokModels(
  provider: Extract<ResolvedProviderForTask, { mode: "byok" }>,
): Record<ModelQuality, string> {
  const balanced = provider.modelBalanced ?? provider.modelDeep ?? provider.modelFast ?? "gpt-4o";
  return {
    fast: provider.modelFast ?? balanced,
    balanced,
    deep: provider.modelDeep ?? balanced,
  };
}

function recordCommercialAiCalls({
  gateway,
  taskId,
  enqueueStepWrite,
}: {
  gateway: AiGateway;
  taskId: string;
  enqueueStepWrite: (run: SimulationWorkerStepRunInput) => void;
}): () => void {
  return addSimulationAiCallLogListener(gateway, taskId, (entry) => {
    enqueueStepWrite(toStepRunCost(taskId, entry));
  });
}

function toStepRunCost(
  _taskId: string,
  entry: AiCallLogEntry,
): SimulationWorkerStepRunInput {
  const promptTokens = entry.inputTokens ?? 0;
  const completionTokens = entry.outputTokens ?? 0;
  return {
    stepName: entry.step,
    stageIndex: entry.stageIndex,
    provider: entry.provider,
    modelId: entry.modelId,
    modelProfileId: entry.modelProfileId,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCost: estimateCostForModel({
      provider: entry.provider,
      modelId: entry.modelId,
      promptTokens,
      completionTokens,
    }),
    latencyMs: entry.latencyMs,
    status: entry.success ? "completed" : "failed",
    errorCode: entry.errorCode ?? entry.errorMessage,
    startedAt: entry.timestamp,
    completedAt: entry.timestamp,
  };
}

async function settleStepWrites(writes: Promise<void>[]): Promise<void> {
  if (writes.length === 0) {
    return;
  }

  const settled = await Promise.allSettled(writes.splice(0));
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejected) {
    throw rejected.reason;
  }
}
