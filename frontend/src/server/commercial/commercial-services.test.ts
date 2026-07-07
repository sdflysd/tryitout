import assert from "node:assert/strict";
import test from "node:test";

import { AccessCodeService } from "./access-code-service.js";
import { CommercialAuthService } from "./auth-service.js";
import { BullMqSimulationQueue } from "./bullmq-simulation-queue.js";
import {
  createCommercialServices,
  createCommercialServicesFromEnv,
} from "./commercial-services.js";
import { CommercialTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { PostgresCommercialRepository, type QueryClient } from "./postgres-repository.js";
import type {
  BullMqSimulationJobOptions,
  BullMqQueueLike,
} from "./bullmq-simulation-queue.js";
import type { SimulationQueueJob } from "./simulation-queue.js";

const ENABLED_ENV = {
  COMMERCIAL_MODE_ENABLED: "true",
  DATABASE_URL: "postgres://tryitout:test@localhost:5432/tryitout",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "session-secret-with-at-least-32-characters",
  ACCESS_CODE_PEPPER: "pepper-with-at-least-32-characters",
  USER_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

test("commercial mode creates platform services with Postgres and BullMQ adapters", async () => {
  const queryClient = new FakeQueryClient();
  const bullQueue = new FakeBullQueue();

  const services = createCommercialServicesFromEnv(ENABLED_ENV, {
    queryClient,
    bullQueue,
  });

  assert.equal(services.enabled, true);
  if (!services.enabled) return;
  assert.ok(services.repository instanceof PostgresCommercialRepository);
  assert.ok(services.queue instanceof BullMqSimulationQueue);
  assert.ok(services.authService instanceof CommercialAuthService);
  assert.ok(services.accessCodeService instanceof AccessCodeService);
  assert.ok(services.creditService instanceof CreditService);
  assert.ok(services.auditService);
  assert.ok(services.analyticsService);
  assert.ok(services.taskService instanceof CommercialTaskService);

  await services.analyticsService.recordEvent({
    id: "event_1",
    eventType: "platform_started",
    properties: {},
    occurredAt: "2026-07-07T00:00:00.000Z",
  });
  await services.queue.enqueue({
    taskId: "task_1",
    userId: "user_1",
    interactionMode: "enabled",
    providerMode: "platform",
    weight: 3,
    priority: 5,
    idempotencyKey: "task-key-1",
    queuedAt: "2026-07-07T00:00:00.000Z",
  });

  assert.match(queryClient.queries[0]?.sql ?? "", /insert into analytics_events/i);
  assert.equal(bullQueue.addCalls[0]?.options.jobId, "task_1");
});

test("missing commercial config throws before server starts", () => {
  assert.throws(
    () => createCommercialServicesFromEnv({ COMMERCIAL_MODE_ENABLED: "true" }),
    /DATABASE_URL.*REDIS_URL.*SESSION_SECRET.*ACCESS_CODE_PEPPER.*USER_SECRET_ENCRYPTION_KEY/s,
  );
});

test("demo mode can omit Postgres and Redis", () => {
  const services = createCommercialServicesFromEnv({});

  assert.deepEqual(services, {
    enabled: false,
    maxWeightedConcurrency: 30,
  });
});

test("createCommercialServices accepts a pre-resolved disabled config", () => {
  const services = createCommercialServices({
    enabled: false,
    maxWeightedConcurrency: 12,
  });

  assert.deepEqual(services, {
    enabled: false,
    maxWeightedConcurrency: 12,
  });
});

class FakeQueryClient implements QueryClient {
  readonly queries: Array<{ sql: string; params?: unknown[] }> = [];

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ sql, params });
    return { rows: [] };
  }
}

class FakeBullQueue implements BullMqQueueLike {
  readonly addCalls: Array<{
    name: string;
    data: SimulationQueueJob;
    options: BullMqSimulationJobOptions;
  }> = [];

  async add(
    name: string,
    data: SimulationQueueJob,
    options: BullMqSimulationJobOptions,
  ): Promise<void> {
    this.addCalls.push({ name, data, options });
  }
}
