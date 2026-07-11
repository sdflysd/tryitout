import assert from "node:assert/strict";
import test from "node:test";

import { CreditService } from "./credit-service.js";
import {
  CommercialTaskService,
  CommercialTaskServiceError,
} from "./commercial-task-service.js";
import { hashAccessCode } from "./access-code-secrets.js";
import {
  InMemoryCommercialRepository,
} from "./repository.js";
import {
  InMemorySimulationQueue,
  type SimulationQueue,
  type SimulationQueueClaim,
  type SimulationQueueJob,
} from "./simulation-queue.js";
import type {
  CommercialSimulationReportRecord,
  CommercialUserRecord,
  JsonObject,
  UserCreditAccountRecord,
} from "./types.js";
import type {
  Report,
  SimulationApiResponse,
  UserInput,
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
];

test("creating a task requires an active user", async () => {
  const missing = await createScenario({ skipUser: true });
  await assert.rejects(
    missing.service.createTask(makeCreateInput()),
    (error) => hasTaskCode(error, "user_not_active"),
  );

  const disabled = await createScenario({ userStatus: "disabled" });
  await assert.rejects(
    disabled.service.createTask(makeCreateInput()),
    (error) => hasTaskCode(error, "user_not_active"),
  );
});

test("user with insufficient credits cannot create task", async () => {
  const { repo, service } = await createScenario({ balance: 1 });

  await assert.rejects(
    service.createTask(makeCreateInput({ interactionMode: "enabled" })),
    (error) => hasTaskCode(error, "insufficient_credits"),
  );

  assert.equal(await repo.getCommercialTask("simulation_task_1"), undefined);
});

test("BYOK task creation requires access-code entitlement", async () => {
  const { service } = await createScenario({ balance: 10 });

  await assert.rejects(
    service.createTask(makeCreateInput({
      providerMode: "byok",
      modelSelection: { userCredentialId: "provider_1", mode: "deep" },
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );
});

test("BYOK task creation accepts active access-code entitlement grants", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    tierGranted: "business",
    featuresGranted: ["custom_model_provider"],
    entitlementStartsAt: "2026-07-01T00:00:00.000Z",
    entitlementExpiresAt: "2026-07-08T00:00:00.000Z",
    redeemedAt: "2026-07-01T00:00:00.000Z",
    metadata: {},
  });

  const created = await service.createTask(makeCreateInput({
    providerMode: "byok",
    modelSelection: { userCredentialId: "provider_1", mode: "deep" },
  }));

  assert.equal(created.task.providerMode, "byok");
  assert.equal((await queue.claimNext())?.job.providerMode, "byok");
});

test("BYOK task creation rejects expired access-code entitlement grants", async () => {
  const { repo, service } = await createScenario({ balance: 10 });
  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    tierGranted: "business",
    featuresGranted: ["custom_model_provider"],
    entitlementStartsAt: "2026-07-01T00:00:00.000Z",
    entitlementExpiresAt: "2026-07-06T00:00:00.000Z",
    redeemedAt: "2026-07-01T00:00:00.000Z",
    metadata: {},
  });

  await assert.rejects(
    service.createTask(makeCreateInput({
      providerMode: "byok",
      modelSelection: { userCredentialId: "provider_1", mode: "deep" },
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );
});

test("platform task creation rejects models not enabled by admin", async () => {
  const { service } = await createScenario({ balance: 10 });

  await assert.rejects(
    service.createTask(makeCreateInput({
      providerMode: "platform",
      modelSelection: { modelProfileId: "gemini_flash_balanced" },
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );
});

test("platform task creation requires admin-enabled repository-backed profiles", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  await repo.savePlatformModelProvider({
    id: "platform_provider_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.example/api/v1",
    encryptedApiKey: "encrypted",
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repo.savePlatformModelProfile({
    id: "openrouter_balanced",
    providerConfigId: "platform_provider_1",
    label: "OpenRouter Balanced",
    modelId: "vendor/balanced",
    quality: "balanced",
    visibleToUser: true,
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  await assert.rejects(
    service.createTask(makeCreateInput({
      providerMode: "platform",
      modelSelection: { modelProfileId: "openrouter_balanced" },
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );

  await repo.saveSystemSetting({
    key: "platform.models.enabled",
    value: ["openrouter_balanced"],
    description: "Platform model profiles enabled for users",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  const created = await service.createTask(makeCreateInput({
    providerMode: "platform",
    modelSelection: { modelProfileId: "openrouter_balanced" },
  }));

  assert.equal(created.task.status, "queued");
  assert.deepEqual((await queue.claimNext())?.job.modelSelection, {
    modelProfileId: "openrouter_balanced",
  });
});

test("platform task creation rejects disabled or hidden repository-backed profiles", async () => {
  const hidden = await createScenario({ balance: 10 });
  await hidden.repo.savePlatformModelProvider({
    id: "platform_provider_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.example/api/v1",
    encryptedApiKey: "encrypted",
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await hidden.repo.savePlatformModelProfile({
    id: "openrouter_hidden",
    providerConfigId: "platform_provider_1",
    label: "OpenRouter Hidden",
    modelId: "vendor/hidden",
    quality: "balanced",
    visibleToUser: false,
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  await assert.rejects(
    hidden.service.createTask(makeCreateInput({
      providerMode: "platform",
      modelSelection: { modelProfileId: "openrouter_hidden" },
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );

  const disabled = await createScenario({ balance: 10 });
  await disabled.repo.savePlatformModelProvider({
    id: "platform_provider_1",
    provider: "openai_compatible",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.example/api/v1",
    encryptedApiKey: "encrypted",
    apiKeyMask: "sk-****",
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await disabled.repo.savePlatformModelProfile({
    id: "openrouter_disabled",
    providerConfigId: "platform_provider_1",
    label: "OpenRouter Disabled",
    modelId: "vendor/disabled",
    quality: "balanced",
    visibleToUser: true,
    status: "disabled",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  await assert.rejects(
    disabled.service.createTask(makeCreateInput({
      providerMode: "platform",
      modelSelection: { modelProfileId: "openrouter_disabled" },
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );
});

test("platform task creation rejects default selection when admin has no published platform models", async () => {
  const { repo, service } = await createScenario({ balance: 10 });
  await repo.saveSystemSetting({
    key: "platform.models.enabled",
    value: [],
    description: "Platform model profiles enabled for users",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  await assert.rejects(
    service.createTask(makeCreateInput({
      providerMode: "platform",
      modelSelection: undefined,
    })),
    (error) => hasTaskCode(error, "provider_not_allowed"),
  );
});

test("single user active task limit rejects second queued or running task", async () => {
  const { repo, service } = await createScenario({ balance: 10 });
  const first = await service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));

  await assert.rejects(
    service.createTask(makeCreateInput({ idempotencyKey: "task-key-2" })),
    (error) => hasTaskCode(error, "active_task_exists"),
  );

  assert.equal(
    (await repo.findActiveCommercialTaskByUserId("user_1"))?.id,
    first.task.id,
  );
});

test("repeating task creation with the same idempotency key returns the existing task", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const first = await service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));
  const second = await service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));

  assert.equal(second.task.id, first.task.id);
  assert.equal(second.hold.ledger.id, first.hold.ledger.id);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 7);
  assert.equal((await repo.getCreditAccount("user_1"))?.frozenCredits, 3);
  assert.equal((await queue.claimNext())?.job.taskId, first.task.id);
  assert.equal(await queue.claimNext(), undefined);
});

test("repeating task creation does not requeue an existing terminal task", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const first = await service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));
  const claim = await queue.claimNext();
  assert.ok(claim);
  await service.markRunning({ taskId: first.task.id });
  await service.markFailed({ taskId: first.task.id, error: "provider_error" });
  await queue.release(claim.claimId);

  const replay = await service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));

  assert.equal(replay.task.status, "failed");
  assert.equal(await queue.claimNext(), undefined);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 10);
  assert.equal((await repo.getCreditAccount("user_1"))?.frozenCredits, 0);
});

test("task creation calculates credit cost, creates hold, saves task, and enqueues job", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });

  const result = await service.createTask(
    makeCreateInput({
      interactionMode: "enabled",
      providerMode: "platform",
      modelSelection: { modelProfileId: "anthropic_sonnet_balanced" },
      priority: 7,
      inputSummary: { title: "Should I quit?" },
    }),
  );

  assert.equal(result.task.status, "queued");
  assert.equal(result.task.creditCost, 3);
  assert.equal(result.task.creditHoldLedgerId, result.hold.ledger.id);
  assert.deepEqual(result.task.inputSummary, { title: "Should I quit?" });
  assert.deepEqual(result.task.userInput, makeUserInput());
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 7);
  assert.equal((await repo.getCreditAccount("user_1"))?.frozenCredits, 3);

  const claim = await queue.claimNext();
  assert.equal(claim?.job.taskId, result.task.id);
  assert.equal(claim?.job.userId, "user_1");
  assert.deepEqual(claim?.job.userInput, makeUserInput());
  assert.equal(claim?.job.weight, 3);
  assert.equal(claim?.job.priority, 7);
  assert.equal(claim?.job.idempotencyKey, "task-key-1");
  assert.deepEqual(claim?.job.modelSelection, {
    modelProfileId: "anthropic_sonnet_balanced",
  });
});

test("if enqueue fails, hold is released and task is marked failed", async () => {
  const failingQueue = new FailingQueue();
  const { repo, service } = await createScenario({
    balance: 10,
    queue: failingQueue,
  });

  await assert.rejects(
    service.createTask(makeCreateInput()),
    (error) => hasTaskCode(error, "queue_enqueue_failed"),
  );

  const task = await repo.getCommercialTask("simulation_task_1");
  const account = await repo.getCreditAccount("user_1");
  assert.equal(task?.status, "failed");
  assert.equal(task?.errorCode, "queue_enqueue_failed");
  assert.equal(account?.balance, 10);
  assert.equal(account?.frozenCredits, 0);
});

test("completion captures held credits once and stores report id", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });

  const completed = await service.markCompleted({
    taskId: created.task.id,
    publicReport: makePublicReport(),
    deepReport: makeDeepReport(),
    shareCard: { title: "Share" },
  });
  const replay = await service.markCompleted({
    taskId: created.task.id,
    publicReport: makePublicReport(),
    deepReport: makeDeepReport(),
    shareCard: { title: "Share" },
  });

  const account = await repo.getCreditAccount("user_1");
  const report = await repo.getCommercialReportByTaskId(created.task.id);
  assert.equal(completed.task.status, "completed");
  assert.equal(replay.task.status, "completed");
  assert.equal(account?.balance, 7);
  assert.equal(account?.frozenCredits, 0);
  assert.equal(account?.totalCaptured, 3);
  assert.equal(report?.id, completed.report.id);
  assert.deepEqual(report?.shareCard, { title: "Share" });
});

test("completion reuses an existing report when a worker retry observes a running task", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });
  await repo.saveCommercialReport({
    id: "report_existing",
    taskId: created.task.id,
    userId: "user_1",
    publicReport: makePublicReport(),
    unlocked: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  const completed = await service.markCompleted({
    taskId: created.task.id,
    publicReport: makePublicReport(),
  });

  assert.equal(completed.report.id, "report_existing");
  assert.equal(completed.task.status, "completed");
  assert.equal((await repo.getCreditAccount("user_1"))?.totalCaptured, 3);
});

test("task service leaves task-run attempt records to the worker runner", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();

  await service.markRunning({ taskId: created.task.id });
  await service.markCompleted({
    taskId: created.task.id,
    publicReport: makePublicReport(),
  });

  assert.deepEqual(await repo.listSimulationTaskRuns(created.task.id), []);
});

test("failure releases held credits once and records normalized error code", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });

  const failed = await service.markFailed({
    taskId: created.task.id,
    error: new Error("Provider timed out!"),
  });
  const replay = await service.markFailed({
    taskId: created.task.id,
    error: "different message",
  });

  const account = await repo.getCreditAccount("user_1");
  assert.equal(failed.task.status, "failed");
  assert.equal(failed.task.errorCode, "provider_timed_out");
  assert.equal(replay.task.errorCode, "provider_timed_out");
  assert.equal(account?.balance, 10);
  assert.equal(account?.frozenCredits, 0);
});

test("recoverable failure keeps held credits and saves checkpoint for same-task resume", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });

  const failed = await service.markRecoverableFailed({
    taskId: created.task.id,
    error: new Error("Provider timed out!"),
    checkpoint: {
      safetyChecked: true,
      completedStages: [{ stageIndex: 1 } as never],
      nextStep: "simulate_stage",
    },
  });

  const account = await repo.getCreditAccount("user_1");
  const checkpoint = await repo.getLatestCommercialCheckpoint(created.task.id);
  assert.equal(failed.task.status, "recoverable_failed");
  assert.equal(failed.task.errorCode, "provider_timed_out");
  assert.equal(failed.task.completedAt, undefined);
  assert.equal(account?.balance, 7);
  assert.equal(account?.frozenCredits, 3);
  assert.equal(checkpoint?.stepName, "simulate_stage");
  assert.equal(checkpoint?.stageIndex, 1);
});

test("resumeTask requeues the same recoverable task with original input and no new hold", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });
  await service.markRecoverableFailed({
    taskId: created.task.id,
    error: "provider_error",
  });

  const resumed = await service.resumeTask({ taskId: created.task.id });

  const account = await repo.getCreditAccount("user_1");
  const claim = await queue.claimNext();
  assert.equal(resumed.task.id, created.task.id);
  assert.equal(resumed.task.status, "queued");
  assert.equal(resumed.task.errorCode, undefined);
  assert.equal(account?.balance, 7);
  assert.equal(account?.frozenCredits, 3);
  assert.equal(claim?.job.taskId, created.task.id);
  assert.deepEqual(claim?.job.userInput, makeUserInput());
});

test("cancelling recoverable failed task releases its held credits", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput());
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });
  await service.markRecoverableFailed({
    taskId: created.task.id,
    error: "provider_error",
  });

  const cancelled = await service.cancelTask({ taskId: created.task.id });

  const account = await repo.getCreditAccount("user_1");
  assert.equal(cancelled.task.status, "cancelled");
  assert.equal(account?.balance, 10);
  assert.equal(account?.frozenCredits, 0);
});

test("retry of failed or refunded task creates a new hold and queue job", async () => {
  const { queue, repo, service } = await createScenario({ balance: 10 });
  const created = await service.createTask(makeCreateInput({ idempotencyKey: "task-key-1" }));
  await queue.claimNext();
  await service.markRunning({ taskId: created.task.id });
  await service.markFailed({ taskId: created.task.id, error: "provider_error" });

  const retry = await service.retryTask({
    taskId: created.task.id,
    idempotencyKey: "task-key-2",
  });

  const account = await repo.getCreditAccount("user_1");
  const claim = await queue.claimNext();
  assert.notEqual(retry.task.id, created.task.id);
  assert.equal(retry.task.status, "queued");
  assert.equal(retry.task.creditHoldLedgerId, retry.hold.ledger.id);
  assert.equal(account?.balance, 7);
  assert.equal(account?.frozenCredits, 3);
  assert.equal(claim?.job.taskId, retry.task.id);
  assert.equal(claim?.job.idempotencyKey, "task-key-2");
});

async function createScenario(
  options: {
    balance?: number;
    queue?: InMemorySimulationQueue | SimulationQueue;
    skipUser?: boolean;
    userStatus?: CommercialUserRecord["status"];
  } = {},
) {
  const repo = new InMemoryCommercialRepository();
  const queue = options.queue ?? new InMemorySimulationQueue({ maxActiveWeight: 6 });
  const ids = new TestIds();
  const now = new TestClock(NOW_VALUES);
  const createId = (prefix = "id") => ids.create(prefix);
  if (!options.skipUser) {
    await repo.saveUser(makeUser({ status: options.userStatus ?? "active" }));
  }
  await repo.saveCreditAccount(makeCreditAccount({ balance: options.balance ?? 10 }));
  await repo.saveSystemSetting({
    key: "platform.models.enabled",
    value: ["anthropic_sonnet_balanced"],
    description: "Platform model profiles enabled for users",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
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

  return { creditService, queue, repo, service };
}

function makeCreateInput(
  overrides: Partial<Parameters<CommercialTaskService["createTask"]>[0]> = {},
): Parameters<CommercialTaskService["createTask"]>[0] {
  return {
    userId: "user_1",
    userInput: makeUserInput(),
    interactionMode: "enabled",
    providerMode: "platform",
    idempotencyKey: "task-key-1",
    inputSummary: { type: "life_choice" },
    ...overrides,
  };
}

function makeUser(
  overrides: Partial<CommercialUserRecord> = {},
): CommercialUserRecord {
  return {
    id: "user_1",
    email: "user@example.test",
    emailNormalized: "user@example.test",
    passwordHash: "hash",
    role: "user",
    tier: "basic",
    status: "active",
    features: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeCreditAccount(
  overrides: Partial<UserCreditAccountRecord> = {},
): UserCreditAccountRecord {
  return {
    userId: "user_1",
    balance: 10,
    frozenCredits: 0,
    totalRedeemed: 10,
    totalCaptured: 0,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeUserInput(): UserInput {
  return {
    type: "life_choice",
    decisionContext: "Should I quit my job?",
    optionA: "Stay",
    optionB: "Quit",
  };
}

function makePublicReport(): SimulationApiResponse {
  return {
    id: "simulation_1",
    status: "completed",
    agents: [],
    stages: [],
    report: makeDeepReport() as Report,
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

function hasTaskCode(
  error: unknown,
  code: CommercialTaskServiceError["code"],
): boolean {
  return error instanceof CommercialTaskServiceError && error.code === code;
}

class FailingQueue implements SimulationQueue {
  async enqueue(): Promise<void> {
    throw new Error("queue unavailable");
  }

  async claimNext(): Promise<SimulationQueueClaim | undefined> {
    return undefined;
  }

  async release(): Promise<boolean> {
    return false;
  }
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
