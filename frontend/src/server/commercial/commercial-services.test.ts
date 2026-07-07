import assert from "node:assert/strict";
import test from "node:test";

import { BullMqSimulationQueue } from "./bullmq-simulation-queue.js";
import { AnalyticsService } from "./analytics-service.js";
import {
  createCommercialServices,
  getMissingCommercialEnvironmentKeys,
  validateCommercialStartupEnvironment,
} from "./commercial-services.js";
import { CommercialAuthService } from "./auth-service.js";
import { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { FeedbackService } from "./feedback-service.js";
import { ModelProviderService } from "./model-provider-service.js";
import { PostgresCommercialRepository, type QueryClient } from "./postgres-repository.js";
import { encryptSecret } from "./secrets.js";
import { InMemorySimulationQueue } from "./simulation-queue.js";

const completeEnv = {
  COMMERCIAL_MODE_ENABLED: "true",
  DATABASE_URL: "postgres://tryitout:secret@localhost:5432/tryitout",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "session-secret-with-enough-entropy",
  ACCESS_CODE_PEPPER: "pepper-with-enough-entropy",
  USER_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

class FakeQueryClient implements QueryClient {
  async query<T = unknown>(): Promise<{ rows: T[] }> {
    return { rows: [] };
  }
}

test("commercial mode reports all missing required backing-service and secret env vars", () => {
  assert.deepEqual(getMissingCommercialEnvironmentKeys({ COMMERCIAL_MODE_ENABLED: "true" }), [
    "DATABASE_URL",
    "REDIS_URL",
    "SESSION_SECRET",
    "ACCESS_CODE_PEPPER",
    "USER_SECRET_ENCRYPTION_KEY",
  ]);
});

test("commercial startup validation throws a clear error for missing env vars", () => {
  assert.throws(
    () => validateCommercialStartupEnvironment({ COMMERCIAL_MODE_ENABLED: "true" }),
    /Commercial mode requires DATABASE_URL, REDIS_URL, SESSION_SECRET, ACCESS_CODE_PEPPER, USER_SECRET_ENCRYPTION_KEY/,
  );
});

test("non-commercial mode can use local defaults without commercial env vars", () => {
  assert.doesNotThrow(() =>
    validateCommercialStartupEnvironment({ COMMERCIAL_MODE_ENABLED: "false" }),
  );
  assert.equal(createCommercialServices({ env: { COMMERCIAL_MODE_ENABLED: "false" } }), undefined);
});

test("commercial service factory builds Postgres, BullMQ, auth, credit, and task services", () => {
  const services = createCommercialServices({
    env: completeEnv,
    createQueryClient: () => new FakeQueryClient(),
    createRedisConnection: (redisUrl) => ({ url: redisUrl }),
    QueueCtor: InMemoryQueueLike,
  });

  assert.ok(services);
  assert.ok(services.repository instanceof PostgresCommercialRepository);
  assert.ok(services.queue instanceof BullMqSimulationQueue);
  assert.ok(services.authService instanceof CommercialAuthService);
  assert.ok(services.creditService instanceof CreditService);
  assert.ok(services.taskService instanceof CommercialSimulationTaskService);
  assert.ok(services.analyticsService instanceof AnalyticsService);
  assert.ok(services.feedbackService instanceof FeedbackService);
  assert.ok(services.modelProviderService instanceof ModelProviderService);
});

test("commercial task service receives the model provider resolver from the factory", async () => {
  const resolvedProvider = {
    provider: "openai_compatible" as const,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-user-secret",
  };
  const services = createCommercialServices({
    env: completeEnv,
    createQueryClient: () =>
      ({
        async query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
          if (sql.includes("FROM simulation_tasks")) {
            return {
              rows: [
                {
                  id: "task_1",
                  user_id: "user_1",
                  status: "queued",
                  scenario: "side_hustle",
                  user_input: "launch",
                  interaction_mode: "legacy",
                  provider_mode: "byok",
                  credit_cost: 1,
                  credit_hold_ledger_entry_id: "ledger_hold",
                  credit_captured_ledger_entry_id: null,
                  credit_released_ledger_entry_id: null,
                  queue_job_id: "task_1",
                  report_id: null,
                  error_code: null,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ] as T[],
            };
          }
          if (sql.includes("FROM user_model_providers")) {
            return {
              rows: [
                {
                  id: "provider_1",
                  user_id: "user_1",
                  provider_type: resolvedProvider.provider,
                  base_url: resolvedProvider.baseUrl,
                  encrypted_api_key: encryptSecret(resolvedProvider.apiKey, completeEnv.USER_SECRET_ENCRYPTION_KEY),
                  model_name: resolvedProvider.model,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ] as T[],
            };
          }
          return { rows: [] };
        },
      }) as QueryClient,
    createRedisConnection: (redisUrl) => ({ url: redisUrl }),
    QueueCtor: InMemoryQueueLike,
  });

  const provider = await services?.taskService.resolveProviderForTask("task_1");

  assert.deepEqual(provider, { providerMode: "byok", ...resolvedProvider });
});

class InMemoryQueueLike {
  constructor(
    public readonly queueName: string,
    public readonly options: unknown,
  ) {}

  async add(
    _name: string,
    data: unknown,
    options: { jobId?: string },
  ): Promise<{ id: string | undefined }> {
    return { id: options.jobId ?? (data as { taskId?: string }).taskId };
  }
}
