import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemorySimulationQueue,
  WeightedConcurrencyLimiter,
  getSimulationJobWeight,
  toSimulationQueueJob,
} from "./simulation-queue.js";
import type { CommercialSimulationTaskRecord } from "./types.js";

const CREATED_AT = "2026-07-07T00:00:00.000Z";

test("ordinary tasks use weight 1 and deep tasks use weight 3", () => {
  assert.equal(
    getSimulationJobWeight(makeTask({ interactionMode: "legacy" })),
    1,
  );
  assert.equal(
    getSimulationJobWeight(makeTask({ interactionMode: "enabled" })),
    3,
  );
  assert.equal(
    getSimulationJobWeight(makeTask({ interactionMode: "enabled", queueWeight: 2 })),
    2,
  );
});

test("queue job includes task identity, modes, weight, priority, and idempotency key", () => {
  const userInput = {
    type: "life_choice" as const,
    decisionContext: "Should I quit my job?",
    optionA: "Stay",
    optionB: "Quit",
  };
  const job = toSimulationQueueJob(
    makeTask({
      id: "task_1",
      userId: "user_1",
      interactionMode: "enabled",
      providerMode: "byok",
      priority: 7,
      queueWeight: 4,
      idempotencyKey: "idem_1",
      modelSelection: { userCredentialId: "provider_1", mode: "deep" },
      queuedAt: "queued",
    }),
    { userInput },
  );

  assert.deepEqual(job, {
    taskId: "task_1",
    userId: "user_1",
    userInput,
    interactionMode: "enabled",
    providerMode: "byok",
    weight: 4,
    priority: 7,
    idempotencyKey: "idem_1",
    modelSelection: { userCredentialId: "provider_1", mode: "deep" },
    queuedAt: "queued",
  });
});

test("queue rejects jobs without runnable user input", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 3 });

  await assert.rejects(
    queue.enqueue({
      ...job({ taskId: "missing_input" }),
      userInput: undefined as never,
    }),
    /userInput/,
  );
});

test("weighted limiter claims jobs only within budget", () => {
  const limiter = new WeightedConcurrencyLimiter(4);
  const light = job({ taskId: "light", weight: 1 });
  const deep = job({ taskId: "deep", weight: 3 });
  const anotherLight = job({ taskId: "another_light", weight: 1 });

  assert.equal(limiter.tryClaim(light)?.job.taskId, "light");
  assert.equal(limiter.tryClaim(deep)?.job.taskId, "deep");
  assert.equal(limiter.activeWeight, 4);
  assert.equal(limiter.tryClaim(anotherLight), undefined);
});

test("claimed jobs cannot mutate active weight through returned payload", () => {
  const limiter = new WeightedConcurrencyLimiter(3);
  const queuedJob = job({ taskId: "deep", weight: 3 });
  const claim = limiter.tryClaim(queuedJob);
  assert.ok(claim);

  queuedJob.weight = 1;
  assert.throws(() => {
    claim.job.weight = 1;
  });

  assert.equal(limiter.activeWeight, 3);
  assert.equal(limiter.tryClaim(job({ taskId: "light", weight: 1 })), undefined);
});

test("releasing jobs lowers active weight and stale claim release is safe", () => {
  const limiter = new WeightedConcurrencyLimiter(3);
  const first = limiter.tryClaim(job({ taskId: "first", weight: 2 }));
  assert.ok(first);
  const second = limiter.tryClaim(job({ taskId: "second", weight: 1 }));
  assert.ok(second);
  assert.equal(limiter.activeWeight, 3);

  assert.equal(limiter.release(first.claimId), true);
  assert.equal(limiter.activeWeight, 1);
  assert.equal(limiter.release(first.claimId), false);
  assert.equal(limiter.release("missing_claim"), false);
  assert.equal(limiter.activeWeight, 1);
});

test("in-memory queue claims queued jobs by priority within weighted budget", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 4 });
  await queue.enqueue(toSimulationQueueJob(makeTask({ id: "deep_low", interactionMode: "enabled", priority: 1 }), { userInput: userInput() }));
  await queue.enqueue(toSimulationQueueJob(makeTask({ id: "light_high", interactionMode: "legacy", priority: 10 }), { userInput: userInput() }));
  await queue.enqueue(toSimulationQueueJob(makeTask({ id: "deep_high", interactionMode: "enabled", priority: 9 }), { userInput: userInput() }));

  const first = await queue.claimNext();
  const second = await queue.claimNext();
  const third = await queue.claimNext();

  assert.equal(first?.job.taskId, "light_high");
  assert.equal(second?.job.taskId, "deep_high");
  assert.equal(third, undefined);
  assert.equal(queue.activeWeight, 4);
});

test("in-memory queue deduplicates queued jobs by idempotency key", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 2 });
  await queue.enqueue(job({ taskId: "first", weight: 1 }));
  await queue.enqueue({ ...job({ taskId: "duplicate", weight: 1 }), idempotencyKey: "first_idempotency" });

  const first = await queue.claimNext();
  const second = await queue.claimNext();

  assert.equal(first?.job.taskId, "first");
  assert.equal(second, undefined);
});

test("in-memory queue deduplicates active jobs by idempotency key", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 2 });
  await queue.enqueue(job({ taskId: "first", weight: 1 }));
  const active = await queue.claimNext();
  assert.ok(active);

  await queue.enqueue({ ...job({ taskId: "duplicate", weight: 1 }), idempotencyKey: "first_idempotency" });

  assert.equal((await queue.claimNext()), undefined);
});

test("in-memory queue keeps head-of-line jobs instead of starving expensive tasks", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 4 });
  await queue.enqueue(job({ taskId: "occupying", weight: 2, priority: 20 }));
  const occupying = await queue.claimNext();
  assert.ok(occupying);

  await queue.enqueue(job({ taskId: "deep_head", weight: 3, priority: 10 }));
  await queue.enqueue(job({ taskId: "light_tail", weight: 1, priority: 1 }));

  assert.equal(await queue.claimNext(), undefined);
  assert.equal(await queue.release(occupying.claimId), true);
  assert.equal((await queue.claimNext())?.job.taskId, "deep_head");
});

test("in-memory queue rejects permanently unclaimable and malformed jobs", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 3 });

  await assert.rejects(
    queue.enqueue(job({ taskId: "too_heavy", weight: 4 })),
    /maximum active weight/,
  );
  await assert.rejects(
    queue.enqueue({ ...job({ taskId: "bad_priority" }), priority: 0.5 }),
    /priority/,
  );
  await assert.rejects(
    queue.enqueue({ ...job({ taskId: "bad_time" }), queuedAt: "not-a-date" }),
    /queuedAt/,
  );
  await assert.rejects(
    queue.enqueue({ ...job({ taskId: "bad_idem" }), idempotencyKey: " " }),
    /idempotencyKey/,
  );
});

test("in-memory queue release allows later jobs and stale releases are safe", async () => {
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 3 });
  await queue.enqueue(job({ taskId: "first", weight: 3, priority: 2 }));
  await queue.enqueue(job({ taskId: "second", weight: 1, priority: 1 }));

  const first = await queue.claimNext();
  assert.ok(first);
  assert.equal(await queue.claimNext(), undefined);
  assert.equal(await queue.release(first.claimId), true);

  const second = await queue.claimNext();
  assert.equal(second?.job.taskId, "second");
  assert.equal(await queue.release(first.claimId), false);
});

function makeTask(
  overrides: Partial<CommercialSimulationTaskRecord> = {},
): CommercialSimulationTaskRecord {
  return {
    id: "task_1",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "legacy",
    providerMode: "platform",
    status: "queued",
    creditCost: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function job(
  overrides: {
    taskId: string;
    weight?: number;
    priority?: number;
  },
) {
  return {
    taskId: overrides.taskId,
    userId: "user_1",
    userInput: userInput(),
    interactionMode: "legacy" as const,
    providerMode: "platform" as const,
    weight: overrides.weight ?? 1,
    priority: overrides.priority ?? 0,
    idempotencyKey: `${overrides.taskId}_idempotency`,
    queuedAt: CREATED_AT,
  };
}

function userInput() {
  return {
    type: "life_choice" as const,
    decisionContext: "Should I quit my job?",
    optionA: "Stay",
    optionB: "Quit",
  };
}
