import assert from "node:assert/strict";
import test from "node:test";

import {
  CommercialSimulationTaskService,
  CommercialSimulationTaskServiceError,
} from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { ModelProviderService } from "./model-provider-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { InMemorySimulationQueue, type EnqueueSimulationJobInput, type SimulationQueueJob } from "./simulation-queue.js";
import type { CommercialRepository } from "./repository.js";
import type { Report, SimulationApiResponse } from "../../types.js";

const now = new Date("2026-07-06T12:00:00.000Z");
const masterKey = Buffer.alloc(32, 3).toString("base64");

const sampleReport: Report = {
  projectName: "Launch",
  successProbability: 72,
  expectedRevenue: "$1000",
  riskLevel: "medium",
  finalRecommendation: "test small",
  scores: {
    demandStrength: 70,
    willingnessToPay: 60,
    acquisitionDifficulty: 40,
    competitionPressure: 30,
    executionFit: 80,
    monetizationClarity: 65,
  },
  finalOutcome: "validated",
  opportunities: ["niche"],
  risks: ["time"],
  pivotSuggestions: [],
  actionPlan7Days: [{ day: 1, title: "Interview", action: "Talk to users" }],
  shouldDo: "test_small",
};

const sampleSimulationResponse: SimulationApiResponse = {
  id: "task_1",
  status: "completed",
  agents: [],
  stages: [],
  report: sampleReport,
  createdAt: now.toISOString(),
  interactionModeUsed: "legacy",
};

class FailingQueue extends InMemorySimulationQueue {
  async enqueue(_input: EnqueueSimulationJobInput): Promise<SimulationQueueJob> {
    throw new Error("queue unavailable");
  }
}

async function seedUser(
  repository: CommercialRepository,
  options: {
    disabled?: boolean;
    tier?: "basic" | "pro" | "business";
    features?: Array<"custom_model_provider">;
  } = {},
): Promise<void> {
  await repository.saveUser({
    id: "user_1",
    email: "founder@tryitout.ai",
    passwordHash: "hash",
    tier: options.tier ?? "basic",
    features: options.features ?? [],
    isAdmin: false,
    disabledAt: options.disabled ? now : undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveCreditAccount({
    userId: "user_1",
    balance: 10,
    createdAt: now,
    updatedAt: now,
  });
}

function createService(
  repository = new InMemoryCommercialRepository(),
  queue = new InMemorySimulationQueue(),
  options: {
    modelProviderService?: ModelProviderService;
  } = {},
): CommercialSimulationTaskService {
  const creditService = new CreditService(repository, {
    accessCodePepper: "pepper",
    now: () => now,
  });
  return new CommercialSimulationTaskService(repository, creditService, queue, {
    now: () => now,
    modelProviderService: options.modelProviderService,
  });
}

test("creating a task requires active user", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = createService(repository);

  await assert.rejects(
    service.createTask({
      userId: "missing",
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "legacy",
      providerMode: "platform",
    }),
    new CommercialSimulationTaskServiceError("user_not_active", "User is not active."),
  );

  await seedUser(repository, { disabled: true });
  await assert.rejects(
    service.createTask({
      userId: "user_1",
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "legacy",
      providerMode: "platform",
    }),
    new CommercialSimulationTaskServiceError("user_not_active", "User is not active."),
  );
});

test("creating a task rejects a second active task for the same user", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  const service = createService(repository);

  await service.createTask({
    userId: "user_1",
    scenario: "side_hustle",
    userInput: "launch one",
    interactionMode: "legacy",
    providerMode: "platform",
  });

  await assert.rejects(
    service.createTask({
      userId: "user_1",
      scenario: "side_hustle",
      userInput: "launch two",
      interactionMode: "legacy",
      providerMode: "platform",
    }),
    new CommercialSimulationTaskServiceError("active_task_exists", "User already has an active task."),
  );
});

test("creating a task calculates credit cost, holds credits, stores task, and enqueues", async () => {
  const repository = new InMemoryCommercialRepository();
  const queue = new InMemorySimulationQueue();
  await seedUser(repository);
  const service = createService(repository, queue);

  const result = await service.createTask({
    userId: "user_1",
    scenario: "side_hustle",
    userInput: "launch",
    interactionMode: "enabled",
    providerMode: "platform",
  });

  const task = await repository.getCommercialTask(result.taskId);
  assert.equal(task?.creditCost, 3);
  assert.equal(task?.status, "queued");
  assert.equal(task?.creditHoldLedgerEntryId?.startsWith("ledger_"), true);
  assert.equal(task?.queueJobId, result.taskId);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 7);
  assert.equal((await queue.next())?.data.weight, 3);
});

test("if enqueue fails, the hold is released and task is marked failed", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  const service = createService(repository, new FailingQueue());

  await assert.rejects(
    service.createTask({
      userId: "user_1",
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "enabled",
      providerMode: "platform",
    }),
    new CommercialSimulationTaskServiceError("queue_unavailable", "Unable to enqueue simulation task."),
  );

  const [task] = await repository.listCommercialTasksForUserForTest("user_1");
  assert.equal(task.status, "failed");
  assert.equal(task.errorCode, "queue_unavailable");
  assert.equal(task.creditReleasedLedgerEntryId?.startsWith("ledger_"), true);
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 10);
});

test("completing and failing tasks settle held credits once without exposing user input", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  const service = createService(repository);

  const created = await service.createTask({
    userId: "user_1",
    scenario: "side_hustle",
    userInput: "private launch details",
    interactionMode: "legacy",
    providerMode: "platform",
  });

  await service.markRunning(created.taskId);
  const completed = await service.markCompleted({
    taskId: created.taskId,
    report: sampleReport,
  });
  await service.markCompleted({ taskId: created.taskId, report: sampleReport });

  assert.equal(completed.status, "completed");
  assert.equal(completed.reportId?.startsWith("report_"), true);
  assert.equal((await repository.listLedgerEntriesForUser("user_1")).filter((entry) => entry.type === "capture").length, 1);
  assert.equal(Object.hasOwn(await service.getStatus(created.taskId, "user_1"), "userInput"), false);

  const failedTask = await service.retryTask(created.taskId, "user_1");
  await service.markFailed({
    taskId: failedTask.taskId,
    errorCode: "Provider Timeout!",
  });
  await service.markFailed({
    taskId: failedTask.taskId,
    errorCode: "Provider Timeout!",
  });

  assert.equal((await repository.getCommercialTask(failedTask.taskId))?.errorCode, "provider_timeout");
  assert.equal((await repository.listLedgerEntriesForUser("user_1")).filter((entry) => entry.type === "release").length, 1);
});

test("completing a task can persist the full simulation response for report rendering", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository);
  const service = createService(repository);

  const created = await service.createTask({
    userId: "user_1",
    scenario: "side_hustle",
    userInput: "private launch details",
    interactionMode: "legacy",
    providerMode: "platform",
  });

  await service.markCompleted({
    taskId: created.taskId,
    report: { ...sampleSimulationResponse, id: created.taskId },
  });

  assert.deepEqual(await service.getReport(created.taskId, "user_1"), {
    ...sampleSimulationResponse,
    id: created.taskId,
  });
});

test("retrying a failed task creates a new hold and queue job", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const modelProviderService = new ModelProviderService(repository, {
    masterKey,
    now: () => now,
    allowedHosts: ["api.openai.com"],
  });
  await modelProviderService.saveProvider({
    userId: "user_1",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-user-secret",
  });
  const service = createService(repository, new InMemorySimulationQueue(), {
    modelProviderService,
  });

  const created = await service.createTask({
    userId: "user_1",
    scenario: "side_hustle",
    userInput: "launch",
    interactionMode: "enabled",
    providerMode: "byok",
  });
  await service.markFailed({ taskId: created.taskId, errorCode: "provider_error" });

  const retried = await service.retryTask(created.taskId, "user_1");

  assert.notEqual(retried.taskId, created.taskId);
  assert.equal((await repository.getCommercialTask(retried.taskId))?.providerMode, "byok");
  assert.equal((await repository.getCommercialTask(retried.taskId))?.creditCost, 2);
  assert.equal((await repository.getCommercialTask(retried.taskId))?.status, "queued");
});

test("BYOK tasks require custom model provider entitlement", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, { tier: "basic" });
  const service = createService(repository);

  await assert.rejects(
    service.createTask({
      userId: "user_1",
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "legacy",
      providerMode: "byok",
    }),
    new CommercialSimulationTaskServiceError(
      "custom_provider_not_allowed",
      "User is not entitled to custom model providers.",
    ),
  );
  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 10);
});

test("BYOK provider configuration failures release held credits", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const service = createService(repository);

  await assert.rejects(
    service.createTask({
      userId: "user_1",
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "enabled",
      providerMode: "byok",
    }),
    new CommercialSimulationTaskServiceError("provider_not_found", "BYOK provider was not found."),
  );

  assert.equal((await repository.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await repository.listLedgerEntriesForUser("user_1")).filter((entry) => entry.type === "hold").length, 1);
  assert.equal((await repository.listLedgerEntriesForUser("user_1")).filter((entry) => entry.type === "release").length, 1);
});

test("BYOK tasks record provider mode and expose decrypted provider metadata", async () => {
  const repository = new InMemoryCommercialRepository();
  await seedUser(repository, {
    tier: "pro",
    features: ["custom_model_provider"],
  });
  const modelProviderService = new ModelProviderService(repository, {
    masterKey,
    now: () => now,
    allowedHosts: ["api.openai.com"],
  });
  await modelProviderService.saveProvider({
    userId: "user_1",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-user-secret",
  });
  const service = createService(repository, new InMemorySimulationQueue(), {
    modelProviderService,
  });

  const created = await service.createTask({
    userId: "user_1",
    scenario: "side_hustle",
    userInput: "launch",
    interactionMode: "legacy",
    providerMode: "byok",
  });
  const provider = await service.resolveProviderForTask(created.taskId);

  assert.equal((await repository.getCommercialTask(created.taskId))?.providerMode, "byok");
  assert.deepEqual(provider, {
    providerMode: "byok",
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-user-secret",
  });
});
