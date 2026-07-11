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
import { createCommercialServicesFromEnv } from "./src/server/commercial/commercial-services.js";
import { runSimulationQueueJob } from "./src/server/commercial/simulation-worker.js";

config();

const commercialServices = createCommercialServicesFromEnv(process.env);

if (!commercialServices.enabled) {
  console.error(
    "Commercial simulation worker requires COMMERCIAL_MODE_ENABLED=true and commercial backing services.",
  );
  process.exitCode = 1;
  process.exit();
}

const workerId = process.env.SIMULATION_WORKER_ID?.trim() || `worker_${process.pid}`;
const workerConcurrency = resolveWorkerConcurrency(
  process.env.SIMULATION_WORKER_CONCURRENCY,
);
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

const bullWorker = createBullMqSimulationWorker({
  redisUrl: process.env.REDIS_URL!,
  workerId,
  concurrency: workerConcurrency,
  runClaim: async (claim) => {
    await runSimulationQueueJob({
      claim,
      queue: {
        release: async () => true,
      },
      repository: commercialServices.repository,
      taskService: commercialServices.taskService,
      workerId,
      runSimulation: createCommercialWorkerRunSimulation({
        job: claim.job,
        services: commercialServices,
        getPlatformGateway,
        platformSecretEncryptionKey: commercialServices.platformSecretEncryptionKey,
      }),
    });
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
console.log(
  `[worker] ${workerId} listening for commercial simulation tasks with concurrency ${workerConcurrency}`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void bullWorker.close().finally(() => {
      process.exit(0);
    });
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
