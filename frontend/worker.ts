import { config } from "dotenv";

import { AiGateway } from "./src/server/ai/ai-gateway.js";
import {
  createAgentDebugTraceWriter,
  isAgentDebugLoggingEnabled,
} from "./src/server/ai/debug-trace.js";
import {
  getConfiguredProvider,
  getMissingProviderConfigMessage,
} from "./src/server/ai/provider-config.js";
import { createBullMqSimulationWorker } from "./src/server/commercial/bullmq-simulation-worker.js";
import { createCommercialWorkerRunSimulation } from "./src/server/commercial/commercial-simulation-worker-runtime.js";
import {
  createCommercialServicesFromEnv,
  type EnabledCommercialServices,
} from "./src/server/commercial/commercial-services.js";
import { runSimulationQueueJob } from "./src/server/commercial/simulation-worker.js";
import { getSimulationJobWeight } from "./src/server/commercial/simulation-queue.js";

config();

const commercialServices = createCommercialServicesFromEnv(process.env);

if (!commercialServices.enabled) {
  console.error(
    "Commercial simulation worker requires COMMERCIAL_MODE_ENABLED=true and commercial backing services.",
  );
  process.exitCode = 1;
  process.exit();
}
const enabledCommercialServices: EnabledCommercialServices = commercialServices;

const workerId = process.env.SIMULATION_WORKER_ID?.trim() || `worker_${process.pid}`;
const workerConcurrency = resolveWorkerConcurrency(
  process.env.SIMULATION_WORKER_CONCURRENCY,
);
const workerHeartbeatIntervalMs = resolveWorkerHeartbeatIntervalMs(
  process.env.SIMULATION_WORKER_HEARTBEAT_INTERVAL_MS,
);
const activeClaims = new Map<string, { taskId: string; weight: number }>();
let platformGateway: AiGateway | undefined;
const agentDebugTraceWriter = isAgentDebugLoggingEnabled()
  ? createAgentDebugTraceWriter()
  : undefined;

function getPlatformGateway(): AiGateway {
  if (!platformGateway) {
    const provider = getConfiguredProvider();
    const missingConfigMessage = getMissingProviderConfigMessage(provider);
    if (missingConfigMessage) {
      throw new Error(missingConfigMessage);
    }

    platformGateway = new AiGateway();
    platformGateway.onLog = (entry) => {
      if (!entry.success || process.env.NODE_ENV === "development") {
        console.log("[AI]", JSON.stringify(entry));
      }
    };
    platformGateway.onDebugTrace = agentDebugTraceWriter;
  }

  return platformGateway;
}

async function main(): Promise<void> {
  const bullWorker = createBullMqSimulationWorker({
    redisUrl: process.env.REDIS_URL!,
    workerId,
    concurrency: workerConcurrency,
    runClaim: async (claim) => {
      activeClaims.set(claim.claimId, {
        taskId: claim.job.taskId,
        weight: getSimulationJobWeight(claim.job),
      });
      await recordWorkerHeartbeat();
      try {
        await runSimulationQueueJob({
          claim,
          queue: {
            release: async () => true,
          },
          repository: enabledCommercialServices.repository,
          taskService: enabledCommercialServices.taskService,
          workerId,
          runSimulation: createCommercialWorkerRunSimulation({
            job: claim.job,
            services: enabledCommercialServices,
            getPlatformGateway,
            platformSecretEncryptionKey: enabledCommercialServices.platformSecretEncryptionKey,
          }),
        });
      } finally {
        activeClaims.delete(claim.claimId);
        await recordWorkerHeartbeat();
      }
    },
  });

  bullWorker.on("completed", (job) => {
    console.log(`[worker] completed ${job.id ?? job.data.taskId}`);
  });
  bullWorker.on("failed", (job, error) => {
    console.error(
      `[worker] failed ${job?.id ?? job?.data.taskId ?? "unknown"}: ${error.message}`,
    );
  });
  bullWorker.on("error", (error) => {
    console.error(`[worker] ${error.message}`);
  });

  await bullWorker.waitUntilReady();
  await recordWorkerHeartbeat();
  const heartbeatTimer = setInterval(() => {
    void recordWorkerHeartbeat().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] heartbeat failed: ${message}`);
    });
  }, workerHeartbeatIntervalMs);
  heartbeatTimer.unref?.();
  console.log(
    `[worker] ${workerId} listening for commercial simulation tasks with concurrency ${workerConcurrency}`,
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      clearInterval(heartbeatTimer);
      void bullWorker.close().finally(() => {
        process.exit(0);
      });
    });
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[worker] startup failed: ${message}`);
  process.exitCode = 1;
});

async function recordWorkerHeartbeat(): Promise<void> {
  const active = [...activeClaims.values()];
  const activeWeight = active.reduce((total, claim) => total + claim.weight, 0);
  const currentTaskId = active[0]?.taskId;
  await enabledCommercialServices.workerMonitoringService.recordHeartbeat({
    workerId,
    activeWeight,
    ...(currentTaskId !== undefined ? { currentTaskId } : {}),
  });
}

function resolveWorkerConcurrency(value: string | undefined): number {
  if (!value) {
    return 1;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("SIMULATION_WORKER_CONCURRENCY must be a positive integer");
  }
  return parsed;
}

function resolveWorkerHeartbeatIntervalMs(value: string | undefined): number {
  if (!value) {
    return 10_000;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("SIMULATION_WORKER_HEARTBEAT_INTERVAL_MS must be a positive integer");
  }
  return parsed;
}
