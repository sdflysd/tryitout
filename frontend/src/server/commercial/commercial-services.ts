import { Pool } from "pg";

import {
  BullMqSimulationQueue,
  type BullMqQueueConstructor,
  type BullMqQueueLike,
} from "./bullmq-simulation-queue.js";
import {
  createCommercialApiHandlers,
  type CommercialApiServices,
} from "./commercial-api.js";
import { CommercialAdminService } from "./admin-service.js";
import { AnalyticsService } from "./analytics-service.js";
import { CommercialAuthService } from "./auth-service.js";
import { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { FeedbackService } from "./feedback-service.js";
import { ModelProviderService } from "./model-provider-service.js";
import { PostgresCommercialRepository, type QueryClient } from "./postgres-repository.js";
import type { CommercialRepository } from "./repository.js";
import type { SimulationQueue } from "./simulation-queue.js";

export interface CommercialEnvironment {
  COMMERCIAL_MODE_ENABLED?: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  SESSION_SECRET?: string;
  ACCESS_CODE_PEPPER?: string;
  USER_SECRET_ENCRYPTION_KEY?: string;
}

export interface CommercialRuntimeServices extends CommercialApiServices {
  queue: SimulationQueue;
  apiHandlers: ReturnType<typeof createCommercialApiHandlers>;
}

export interface CreateCommercialServicesOptions<
  TQueue extends BullMqQueueLike = BullMqQueueLike,
> {
  env?: CommercialEnvironment;
  createQueryClient?: (databaseUrl: string) => QueryClient;
  createRedisConnection?: (redisUrl: string) => unknown;
  QueueCtor?: BullMqQueueConstructor<TQueue>;
}

const REQUIRED_COMMERCIAL_ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "ACCESS_CODE_PEPPER",
  "USER_SECRET_ENCRYPTION_KEY",
] as const;

export function getMissingCommercialEnvironmentKeys(
  env: CommercialEnvironment = process.env,
): string[] {
  if (!isCommercialModeEnabled(env)) {
    return [];
  }

  return REQUIRED_COMMERCIAL_ENV_KEYS.filter((key) => !env[key]?.trim());
}

export function validateCommercialStartupEnvironment(
  env: CommercialEnvironment = process.env,
): void {
  const missing = getMissingCommercialEnvironmentKeys(env);
  if (missing.length > 0) {
    throw new Error(`Commercial mode requires ${missing.join(", ")}.`);
  }
}

export function createCommercialServices<
  TQueue extends BullMqQueueLike = BullMqQueueLike,
>(
  options: CreateCommercialServicesOptions<TQueue> = {},
): CommercialRuntimeServices | undefined {
  const env = options.env ?? process.env;
  if (!isCommercialModeEnabled(env)) {
    return undefined;
  }

  validateCommercialStartupEnvironment(env);

  const queryClient = (options.createQueryClient ?? createDefaultQueryClient)(
    env.DATABASE_URL!,
  );
  const repository = new PostgresCommercialRepository(queryClient);
  const queue = new BullMqSimulationQueue({
    connection: (options.createRedisConnection ?? createRedisConnection)(env.REDIS_URL!),
    QueueCtor: options.QueueCtor,
  });
  return createRuntimeServices({
    repository,
    queue,
    accessCodePepper: env.ACCESS_CODE_PEPPER!,
    userSecretEncryptionKey: env.USER_SECRET_ENCRYPTION_KEY!,
  });
}

function createRuntimeServices(input: {
  repository: CommercialRepository;
  queue: SimulationQueue;
  accessCodePepper: string;
  userSecretEncryptionKey: string;
}): CommercialRuntimeServices {
  const authService = new CommercialAuthService(input.repository);
  const creditService = new CreditService(input.repository, {
    accessCodePepper: input.accessCodePepper,
  });
  const adminService = new CommercialAdminService(input.repository, creditService, {
    accessCodePepper: input.accessCodePepper,
  });
  const analyticsService = new AnalyticsService(input.repository);
  const feedbackService = new FeedbackService(input.repository);
  const modelProviderService = new ModelProviderService(input.repository, {
    masterKey: input.userSecretEncryptionKey,
  });
  const taskService = new CommercialSimulationTaskService(
    input.repository,
    creditService,
    input.queue,
  );
  const apiServices: CommercialApiServices = {
    repository: input.repository,
    authService,
    creditService,
    taskService,
    adminService,
    analyticsService,
    feedbackService,
    modelProviderService,
  };

  return {
    ...apiServices,
    queue: input.queue,
    apiHandlers: createCommercialApiHandlers(apiServices),
  };
}

function createDefaultQueryClient(databaseUrl: string): QueryClient {
  return new Pool({ connectionString: databaseUrl });
}

function createRedisConnection(redisUrl: string): unknown {
  const parsed = new URL(redisUrl);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: decodeURIComponent(parsed.username || ""),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

function isCommercialModeEnabled(env: CommercialEnvironment): boolean {
  const value = env.COMMERCIAL_MODE_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
