import type { SimulationApiResponse } from "../../types.js";
import type { CommercialTaskProviderRuntime, CommercialTaskStatusDto } from "./commercial-task-service.js";
import type { SimulationQueueJob, WeightedConcurrencyLimiter } from "./simulation-queue.js";

export interface CommercialSimulationWorkerTaskService {
  markRunning(taskId: string): Promise<CommercialTaskStatusDto>;
  markCompleted(input: { taskId: string; report: SimulationApiResponse }): Promise<CommercialTaskStatusDto>;
  markFailed(input: { taskId: string; errorCode: string }): Promise<CommercialTaskStatusDto>;
  resolveProviderForTask(taskId: string): Promise<CommercialTaskProviderRuntime>;
}

export interface RunCommercialSimulationQueueJobInput {
  job: SimulationQueueJob;
  taskService: CommercialSimulationWorkerTaskService;
  limiter: WeightedConcurrencyLimiter;
  runSimulation: (
    job: SimulationQueueJob,
    providerRuntime: CommercialTaskProviderRuntime,
  ) => Promise<SimulationApiResponse>;
}

export type CommercialSimulationWorkerResult =
  | { status: "deferred"; taskId: string }
  | { status: "completed"; taskId: string; report: SimulationApiResponse }
  | { status: "failed"; taskId: string; errorCode: string };

export async function runCommercialSimulationQueueJob(
  input: RunCommercialSimulationQueueJobInput,
): Promise<CommercialSimulationWorkerResult> {
  const acquired = input.limiter.tryAcquire({
    id: input.job.id,
    weight: input.job.data.weight,
  });
  if (!acquired) {
    return { status: "deferred", taskId: input.job.data.taskId };
  }

  try {
    await input.taskService.markRunning(input.job.data.taskId);
    const providerRuntime = await input.taskService.resolveProviderForTask(input.job.data.taskId);
    const report = await input.runSimulation(input.job, providerRuntime);
    await input.taskService.markCompleted({
      taskId: input.job.data.taskId,
      report,
    });
    return { status: "completed", taskId: input.job.data.taskId, report };
  } catch {
    const errorCode = "provider_error";
    await input.taskService.markFailed({
      taskId: input.job.data.taskId,
      errorCode,
    });
    return { status: "failed", taskId: input.job.data.taskId, errorCode };
  } finally {
    input.limiter.release(input.job.id);
  }
}
