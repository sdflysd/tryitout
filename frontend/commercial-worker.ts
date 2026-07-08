import dotenv from "dotenv";

import { startCommercialWorker } from "./src/server/commercial/commercial-worker-entry.js";

dotenv.config();

const worker = startCommercialWorker();

worker.on("completed", (job) => {
  console.log(`[commercial-worker] completed ${job.id ?? "unknown"}`);
});

worker.on("failed", (job, error) => {
  console.error(`[commercial-worker] failed ${job?.id ?? "unknown"}: ${error.message}`);
});

worker.on("error", (error) => {
  console.error(`[commercial-worker] error: ${error.message}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void worker.close().finally(() => process.exit(0));
  });
}

console.log("[commercial-worker] listening for commercial simulation tasks");
