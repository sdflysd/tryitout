import { Pool, type PoolClient, type PoolConfig } from "pg";

import { AccessCodeService } from "./access-code-service.js";
import { CommercialAdminService } from "./admin-service.js";
import { CommercialAuthService } from "./auth-service.js";
import type { BullMqQueueLike } from "./bullmq-simulation-queue.js";
import { BullMqSimulationQueue } from "./bullmq-simulation-queue.js";
import type { CommercialConfig } from "./commercial-config.js";
import { resolveCommercialConfig } from "./commercial-config.js";
import { CommercialTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { AdminAuditService } from "./audit-service.js";
import { CommercialAnalyticsService } from "./analytics-service.js";
import { WorkerMonitoringService } from "./worker-monitoring.js";
import { ModelProviderService } from "./model-provider-service.js";
import {
  PostgresCommercialRepository,
  type AcquiredQueryClient,
  type QueryClient,
} from "./postgres-repository.js";
import type { CommercialRepository } from "./repository.js";
import type { SimulationQueue } from "./simulation-queue.js";

export type CommercialServices =
  | {
      enabled: false;
      maxWeightedConcurrency: number;
    }
  | EnabledCommercialServices;

export interface EnabledCommercialServices {
  enabled: true;
  repository: CommercialRepository;
  queue: SimulationQueue;
  authService: CommercialAuthService;
  accessCodeService: AccessCodeService;
  creditService: CreditService;
  auditService: AdminAuditService;
  adminService: CommercialAdminService;
  analyticsService: CommercialAnalyticsService;
  workerMonitoringService: WorkerMonitoringService;
  modelProviderService: ModelProviderService;
  taskService: CommercialTaskService;
  platformSecretEncryptionKey: Buffer;
}

export interface CommercialServicesFactoryOptions {
  queryClient?: QueryClient;
  bullQueue?: BullMqQueueLike;
  createQueryClient?: (databaseUrl: string) => QueryClient;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
}

export function createCommercialServicesFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options: CommercialServicesFactoryOptions = {},
): CommercialServices {
  return createCommercialServices(resolveCommercialConfig(env), options);
}

export function createCommercialServices(
  config: CommercialConfig,
  options: CommercialServicesFactoryOptions = {},
): CommercialServices {
  if (!config.enabled) {
    return {
      enabled: false,
      maxWeightedConcurrency: config.maxWeightedConcurrency,
    };
  }

  const repository = new PostgresCommercialRepository(
    options.queryClient ??
      options.createQueryClient?.(config.databaseUrl) ??
      createDefaultQueryClient(config.databaseUrl),
  );
  const queue = new BullMqSimulationQueue({
    connection: config.redisUrl,
    queue: options.bullQueue,
  });
  const commonOptions = {
    repository,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.createId !== undefined ? { createId: options.createId } : {}),
  };
  const creditService = new CreditService({
    ...commonOptions,
    accessCodePepper: config.accessCodePepper,
  });
  const accessCodeService = new AccessCodeService({
    ...commonOptions,
    accessCodePepper: config.accessCodePepper,
  });
  const auditService = new AdminAuditService(commonOptions);
  const workerMonitoringService = new WorkerMonitoringService({
    ...commonOptions,
    maxActiveWeight: config.maxWeightedConcurrency,
  });
  const taskService = new CommercialTaskService({
    ...commonOptions,
    creditService,
    queue,
  });
  const modelProviderService = new ModelProviderService({
    ...commonOptions,
    encryptionKey: config.userSecretEncryptionKey,
  });

  return {
    enabled: true,
    repository,
    queue,
    authService: new CommercialAuthService({
      ...commonOptions,
      sessionSecret: config.sessionSecret,
    }),
    accessCodeService,
    creditService,
    auditService,
    adminService: new CommercialAdminService({
      ...commonOptions,
      accessCodeService,
      creditService,
      auditService,
      workerMonitoringService,
    }),
    analyticsService: new CommercialAnalyticsService(commonOptions),
    workerMonitoringService,
    modelProviderService,
    taskService,
    platformSecretEncryptionKey: config.userSecretEncryptionKey,
  };
}

function createDefaultQueryClient(databaseUrl: string): QueryClient {
  const poolConfig: PoolConfig = {
    connectionString: databaseUrl,
  };
  return new PoolQueryClient(new Pool(poolConfig));
}

class PoolQueryClient implements QueryClient {
  constructor(private readonly pool: Pool) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    const result = await this.pool.query<T>(sql, params);
    return { rows: [...result.rows] };
  }

  async connect(): Promise<AcquiredQueryClient> {
    return new PoolClientQueryClient(await this.pool.connect());
  }
}

class PoolClientQueryClient implements AcquiredQueryClient {
  constructor(private readonly client: PoolClient) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    const result = await this.client.query<T>(sql, params);
    return { rows: [...result.rows] };
  }

  release(): void {
    this.client.release();
  }
}
