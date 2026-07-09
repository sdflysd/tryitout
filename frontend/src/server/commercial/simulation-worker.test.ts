import assert from "node:assert/strict";
import test from "node:test";

import { CreditService } from "./credit-service.js";
import {
  CommercialTaskService,
} from "./commercial-task-service.js";
import { hashAccessCode } from "./access-code-secrets.js";
import {
  InMemoryCommercialRepository,
} from "./repository.js";
import {
  InMemorySimulationQueue,
  toSimulationQueueJob,
  type SimulationQueueClaim,
} from "./simulation-queue.js";
import {
  runSimulationQueueJob,
  runSimulationQueueOnce,
  type SimulationWorkerRunSimulation,
} from "./simulation-worker.js";
import type {
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  UserCreditAccountRecord,
} from "./types.js";
import type {
  Report,
  SimulationApiResponse,
} from "../../types.js";

const ACCESS_CODE_PEPPER = "test-pepper";
const CREATED_AT = "2026-07-07T00:00:00.000Z";
const NOW_VALUES = [
  CREATED_AT,
  "2026-07-07T00:01:00.000Z",
  "2026-07-07T00:02:00.000Z",
  "2026-07-07T00:03:00.000Z",
  "2026-07-07T00:04:00.000Z",
  "2026-07-07T00:05:00.000Z",
  "2026-07-07T00:06:00.000Z",
  "2026-07-07T00:07:00.000Z",
  "2026-07-07T00:08:00.000Z",
  "2026-07-07T00:09:00.000Z",
  "2026-07-07T00:10:00.000Z",
  "2026-07-07T00:11:00.000Z",
  "2026-07-07T00:12:00.000Z",
];

test("worker claims a job only when weighted capacity allows", async () => {
  const scenario = await createScenario({ balance: 20, maxActiveWeight: 3 });
  const first = await scenario.service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));
  const activeClaim = await scenario.queue.claimNext();
  assert.ok(activeClaim);
  await scenario.repo.saveCommercialTask(makeTask({
    id: "task_2",
    userId: "user_2",
    idempotencyKey: "task-key-2",
    creditHoldLedgerId: "hold_2",
  }));
  await scenario.queue.enqueue(toSimulationQueueJob(
    (await scenario.repo.getCommercialTask("task_2"))!,
    {
      userInput: {
        type: "life_choice",
        decisionContext: "Should I quit my job?",
        optionA: "Stay",
        optionB: "Quit",
      },
    },
  ));

  const run = await runSimulationQueueOnce({
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => makePublicReport(first.task.id),
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  assert.equal(run, undefined);
  assert.equal(scenario.queue.activeWeight, 3);
});

test("worker marks task running before simulation", async () => {
  const scenario = await createScenario();
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);
  const observedStatuses: Array<CommercialSimulationTaskRecord["status"]> = [];

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => {
      observedStatuses.push((await scenario.repo.getCommercialTask(created.task.id))!.status);
      return makePublicReport(created.task.id);
    },
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  assert.deepEqual(observedStatuses, ["running"]);
});

test("worker records task-run attempt", async () => {
  const scenario = await createScenario();
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => makePublicReport(created.task.id),
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  const runs = await scenario.repo.listSimulationTaskRuns(created.task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.workerId, "worker_1");
  assert.equal(runs[0]?.attempt, 1);
  assert.equal(runs[0]?.status, "completed");
  assert.equal(runs[0]?.completedAt, "2026-07-07T00:04:00.000Z");
});

test("worker records a running task-run attempt before simulation work", async () => {
  const scenario = await createScenario();
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);
  const observedRuns: string[] = [];

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => {
      observedRuns.push(
        (await scenario.repo.listSimulationTaskRuns(created.task.id))
          .map((run) => `${run.id}:${run.status}`)
          .join(","),
      );
      return makePublicReport(created.task.id);
    },
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  assert.deepEqual(observedRuns, ["simulation_task_run_1:running"]);
});

test("worker records heartbeat while running and clears current task after release", async () => {
  const scenario = await createScenario();
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);
  const observedHeartbeats: string[] = [];

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => {
      observedHeartbeats.push(
        (await scenario.repo.listWorkerHeartbeats())
          .map((heartbeat) => `${heartbeat.workerId}:${heartbeat.activeWeight}:${heartbeat.currentTaskId}`)
          .join(","),
      );
      return makePublicReport(created.task.id);
    },
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  assert.deepEqual(observedHeartbeats, [`worker_1:3:${created.task.id}`]);
  assert.deepEqual(
    (await scenario.repo.listWorkerHeartbeats()).map((heartbeat) => ({
      workerId: heartbeat.workerId,
      activeWeight: heartbeat.activeWeight,
      currentTaskId: heartbeat.currentTaskId,
    })),
    [{ workerId: "worker_1", activeWeight: 0, currentTaskId: undefined }],
  );
});

test("worker saves report and calls task completion on success", async () => {
  const scenario = await createScenario({ balance: 10 });
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => makePublicReport(created.task.id),
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  const task = await scenario.repo.getCommercialTask(created.task.id);
  const report = await scenario.repo.getCommercialReportByTaskId(created.task.id);
  const account = await scenario.repo.getCreditAccount("user_1");
  assert.equal(task?.status, "completed");
  assert.equal(report?.publicReport?.id, created.task.id);
  assert.equal(account?.balance, 7);
  assert.equal(account?.frozenCredits, 0);
  assert.equal(account?.totalCaptured, 3);
});

test("worker records step-run cost logs", async () => {
  const scenario = await createScenario();
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async ({ recordStepRun }) => {
      await recordStepRun({
        stepName: "generate_report",
        provider: "gemini",
        modelId: "gemini-3.5-pro",
        modelProfileId: "deep",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.0123,
        latencyMs: 900,
        status: "completed",
      });
      return makePublicReport(created.task.id);
    },
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  const costs = await scenario.repo.listSimulationStepRunCosts(created.task.id);
  assert.equal(costs.length, 1);
  assert.equal(costs[0]?.taskRunId, "simulation_task_run_1");
  assert.equal(costs[0]?.stepName, "generate_report");
  assert.equal(costs[0]?.totalTokens, 150);
  assert.equal(costs[0]?.status, "completed");
});

test("worker marks failure and releases credits on errors", async () => {
  const scenario = await createScenario({ balance: 10 });
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);

  await assert.rejects(
    runSimulationQueueJob({
      claim,
      queue: scenario.queue,
      repository: scenario.repo,
      taskService: scenario.service,
      workerId: "worker_1",
      runSimulation: async () => {
        throw new Error("Provider timed out!");
      },
      now: () => scenario.now.next(),
      createId: (prefix = "id") => scenario.ids.create(prefix),
    }),
    /Provider timed out/,
  );

  const task = await scenario.repo.getCommercialTask(created.task.id);
  const account = await scenario.repo.getCreditAccount("user_1");
  const runs = await scenario.repo.listSimulationTaskRuns(created.task.id);
  assert.equal(task?.status, "failed");
  assert.equal(task?.errorCode, "provider_timed_out");
  assert.equal(account?.balance, 10);
  assert.equal(account?.frozenCredits, 0);
  assert.equal(runs[0]?.status, "failed");
  assert.equal(runs[0]?.errorCode, "provider_timed_out");
});

test("weighted capacity is released in finally", async () => {
  const scenario = await createScenario({ balance: 10 });
  const created = await scenario.service.createTask(makeCreateInput());
  const claim = await scenario.queue.claimNext();
  assert.ok(claim);
  assert.equal(scenario.queue.activeWeight, 3);

  await runSimulationQueueJob({
    claim,
    queue: scenario.queue,
    repository: scenario.repo,
    taskService: scenario.service,
    workerId: "worker_1",
    runSimulation: async () => makePublicReport(created.task.id),
    now: () => scenario.now.next(),
    createId: (prefix = "id") => scenario.ids.create(prefix),
  });

  assert.equal(scenario.queue.activeWeight, 0);
});

async function createScenario(
  options: {
    balance?: number;
    maxActiveWeight?: number;
  } = {},
) {
  const repo = new InMemoryCommercialRepository();
  const queue = new InMemorySimulationQueue({
    maxActiveWeight: options.maxActiveWeight ?? 6,
  });
  const ids = new TestIds();
  const now = new TestClock(NOW_VALUES);
  const createId = (prefix = "id") => ids.create(prefix);
  await repo.saveUser(makeUser("user_1"));
  await repo.saveUser(makeUser("user_2"));
  await repo.saveCreditAccount(makeCreditAccount("user_1", options.balance ?? 10));
  await repo.saveCreditAccount(makeCreditAccount("user_2", options.balance ?? 10));
  const creditService = new CreditService({
    repository: repo,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId,
    hashAccessCode,
    now: () => now.next(),
  });
  const service = new CommercialTaskService({
    repository: repo,
    creditService,
    queue,
    createId,
    now: () => now.next(),
  });

  return { creditService, ids, now, queue, repo, service };
}

function makeCreateInput(
  overrides: Partial<Parameters<CommercialTaskService["createTask"]>[0]> = {},
): Parameters<CommercialTaskService["createTask"]>[0] {
  return {
    userId: "user_1",
    userInput: { type: "life_choice" },
    interactionMode: "enabled",
    providerMode: "platform",
    idempotencyKey: "task-key-1",
    inputSummary: { type: "life_choice" },
    ...overrides,
  };
}

function makeTask(
  overrides: Partial<CommercialSimulationTaskRecord> = {},
): CommercialSimulationTaskRecord {
  return {
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    priority: 0,
    queueWeight: 3,
    idempotencyKey: "task-key-1",
    queuedAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeUser(id: string): CommercialUserRecord {
  const email = `${id}@example.test`;
  return {
    id,
    email,
    emailNormalized: email,
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function makeCreditAccount(
  userId: string,
  balance: number,
): UserCreditAccountRecord {
  return {
    userId,
    balance,
    frozenCredits: 0,
    totalRedeemed: balance,
    totalCaptured: 0,
    updatedAt: CREATED_AT,
  };
}

function makePublicReport(id: string): SimulationApiResponse {
  return {
    id,
    status: "completed",
    agents: [],
    stages: [],
    report: makeDeepReport(),
    createdAt: CREATED_AT,
  };
}

function makeDeepReport(): Report {
  return {
    projectName: "Decision report",
    successProbability: 62,
    expectedRevenue: "n/a",
    riskLevel: "medium",
    finalRecommendation: "Test small",
    scores: {
      demandStrength: 60,
      willingnessToPay: 50,
      acquisitionDifficulty: 40,
      competitionPressure: 30,
      executionFit: 70,
      monetizationClarity: 55,
    },
    finalOutcome: "A cautious path",
    opportunities: [],
    risks: [],
    pivotSuggestions: [],
    actionPlan7Days: [],
    shouldDo: "test_small",
  };
}

class TestIds {
  private readonly counters = new Map<string, number>();

  create(prefix = "id"): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next}`;
  }
}

class TestClock {
  private index = 0;

  constructor(private readonly values: string[]) {}

  next(): string {
    const value = this.values[Math.min(this.index, this.values.length - 1)]!;
    this.index += 1;
    return value;
  }
}
