import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  SimulationCheckpointRecord,
  SimulationReportRecord,
  SimulationStepRunRecord,
  SimulationTaskRecord,
} from "./task-types.js";

export interface SimulationTaskRepository {
  saveTask(task: SimulationTaskRecord): Promise<void>;
  getTask(simulationId: string): Promise<SimulationTaskRecord | undefined>;
  saveCheckpoint(checkpoint: SimulationCheckpointRecord): Promise<void>;
  getLatestCheckpoint(
    simulationId: string,
  ): Promise<SimulationCheckpointRecord | undefined>;
  appendStepRun(run: SimulationStepRunRecord): Promise<void>;
  listStepRuns(simulationId: string): Promise<SimulationStepRunRecord[]>;
  saveReport(report: SimulationReportRecord): Promise<void>;
  getReport(simulationId: string): Promise<SimulationReportRecord | undefined>;
}

export class FileSimulationTaskRepository implements SimulationTaskRepository {
  constructor(private readonly options: { rootDir?: string } = {}) {}

  async saveTask(task: SimulationTaskRecord): Promise<void> {
    await writeJson(this.taskPath(task.id), task);
  }

  async getTask(simulationId: string): Promise<SimulationTaskRecord | undefined> {
    return readJson<SimulationTaskRecord>(this.taskPath(simulationId));
  }

  async saveCheckpoint(checkpoint: SimulationCheckpointRecord): Promise<void> {
    const checkpoints = await this.listCheckpoints(checkpoint.simulationId);
    const updated = [
      ...checkpoints.filter((item) => item.id !== checkpoint.id),
      checkpoint,
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    await writeJson(this.checkpointsPath(checkpoint.simulationId), updated);
  }

  async getLatestCheckpoint(
    simulationId: string,
  ): Promise<SimulationCheckpointRecord | undefined> {
    const checkpoints = await this.listCheckpoints(simulationId);
    return checkpoints.at(-1);
  }

  async appendStepRun(run: SimulationStepRunRecord): Promise<void> {
    const runs = await this.listStepRuns(run.simulationId);
    const updated = [
      ...runs.filter((item) => item.id !== run.id),
      run,
    ].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    await writeJson(this.stepRunsPath(run.simulationId), updated);
  }

  async listStepRuns(simulationId: string): Promise<SimulationStepRunRecord[]> {
    return (
      (await readJson<SimulationStepRunRecord[]>(
        this.stepRunsPath(simulationId),
      )) ?? []
    );
  }

  async saveReport(report: SimulationReportRecord): Promise<void> {
    await writeJson(this.reportPath(report.simulationId), report);
  }

  async getReport(
    simulationId: string,
  ): Promise<SimulationReportRecord | undefined> {
    return readJson<SimulationReportRecord>(this.reportPath(simulationId));
  }

  private async listCheckpoints(
    simulationId: string,
  ): Promise<SimulationCheckpointRecord[]> {
    return (
      (await readJson<SimulationCheckpointRecord[]>(
        this.checkpointsPath(simulationId),
      )) ?? []
    );
  }

  private rootDir(): string {
    return (
      this.options.rootDir ??
      path.join(process.cwd(), "..", "output", "simulation-tasks")
    );
  }

  private simulationDir(simulationId: string): string {
    return path.join(this.rootDir(), sanitizePathSegment(simulationId));
  }

  private taskPath(simulationId: string): string {
    return path.join(this.simulationDir(simulationId), "task.json");
  }

  private checkpointsPath(simulationId: string): string {
    return path.join(this.simulationDir(simulationId), "checkpoints.json");
  }

  private stepRunsPath(simulationId: string): string {
    return path.join(this.simulationDir(simulationId), "step-runs.json");
  }

  private reportPath(simulationId: string): string {
    return path.join(this.simulationDir(simulationId), "report.json");
  }
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}
