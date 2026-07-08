export interface AdminOverviewDto {
  users: {
    total: number;
    active: number;
    disabled: number;
    redeemed: number;
  };
  tasks: {
    total: number;
    byStatus: {
      queued: number;
      running: number;
      completed: number;
      failed: number;
      cancelled: number;
      refunded: number;
    };
    completionRate: number;
    failureRate: number;
  };
  credits: {
    totalBalance: number;
    totalFrozen: number;
    totalRedeemed: number;
    consumed: number;
  };
  costs: {
    estimatedTotal: number;
  };
  queue: {
    backlog: number;
    oldestQueuedAt?: string;
    queued?: number;
    running?: number;
    retrying?: number;
    stuck?: number;
    activeWeight?: number;
    maxWeight?: number;
    workers?: Array<{
      workerId: string;
      activeWeight: number;
      currentTaskId?: string;
      lastHeartbeatAt: string;
    }>;
  };
  accessCodes: {
    total: number;
    active: number;
    redeemed: number;
    disabled: number;
    expired: number;
  };
}

export type AdminUserTierDto = "basic" | "pro" | "business";
export type AdminCommercialFeatureDto =
  | "deep_mode"
  | "priority_queue"
  | "custom_model_provider"
  | "admin_ops";

export interface AdminAccessCodeBatchDto {
  id: string;
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  disabledAt?: string;
  notes?: string;
  createdAt: string;
  status: "active" | "disabled" | "expired";
  redeemedCount: number;
  activeCount: number;
  disabledCount: number;
  expiredCount: number;
  redemptionRate: number;
}

export interface AdminCreatedAccessCodeDto {
  id: string;
  rawCode: string;
  codeMask: string;
  status: "active" | "redeemed" | "disabled" | "expired";
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  createdAt: string;
}

export interface AdminCreateAccessCodeBatchInputDto {
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface AdminCreateAccessCodeBatchResultDto {
  batch: {
    id: string;
    createdByUserId?: string;
    name: string;
    source?: string;
    codeCount: number;
    credits: number;
    tier?: AdminUserTierDto;
    features: AdminCommercialFeatureDto[];
    expiresAt?: string;
    disabledAt?: string;
    notes?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  codes: AdminCreatedAccessCodeDto[];
}

export interface AdminDisableAccessCodeBatchResultDto {
  batch: AdminCreateAccessCodeBatchResultDto["batch"];
  disabledCodeCount: number;
}

interface AdminUserSummaryDto {
  id: string;
  email: string;
  emailNormalized: string;
  role?: "user" | "admin" | "owner";
  tier: AdminUserTierDto;
  status: "active" | "disabled" | "deleted";
  features: AdminCommercialFeatureDto[];
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  creditAccount?: {
    balance: number;
    frozenCredits: number;
    totalRedeemed: number;
    totalCaptured: number;
    updatedAt: string;
  };
  taskSummary: {
    total: number;
    completed: number;
    failed: number;
    active: number;
  };
}

interface AdminListUsersResultDto {
  total: number;
  items: AdminUserSummaryDto[];
}

export interface AdminUserRowDto {
  id: string;
  email: string;
  status: "active" | "disabled";
  tier: AdminUserTierDto;
  role?: "user" | "admin";
  features?: AdminCommercialFeatureDto[];
  availableCredits: number;
  frozenCredits: number;
  redeemedBatchCount: number;
  taskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  activeTaskCount?: number;
  lastLoginAt?: string;
  recentActivityAt?: string;
  createdAt?: string;
}

export interface AdminTaskTimelineDto {
  label: string;
  at: string;
}

export interface AdminTaskStepCostDto {
  stepName: string;
  provider: string;
  modelId: string;
  tokens: number;
  estimatedCost: number;
  status: "completed" | "failed" | "skipped";
}

export interface AdminTaskRowDto {
  id: string;
  userEmail: string;
  scenarioType: string;
  interactionMode: string;
  providerMode: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "refunded";
  queueWaitMs?: number;
  runDurationMs?: number;
  credits: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  errorCode?: string;
  workerId?: string;
  createdAt?: string;
  timeline: AdminTaskTimelineDto[];
  stepCosts: AdminTaskStepCostDto[];
}

export interface AdminCostGroupDto {
  key: string;
  cost: number;
  tokens: number;
}

export interface AdminCostSummaryDto {
  totalEstimatedCost: number;
  providerGroups: AdminCostGroupDto[];
  modelGroups: AdminCostGroupDto[];
  stepGroups: AdminCostGroupDto[];
  taskGroups: AdminCostGroupDto[];
  outcomeGroups: AdminCostGroupDto[];
}

export interface AdminAdjustUserCreditsInputDto {
  amount: number;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface AdminCreditAccountDto {
  userId: string;
  balance: number;
  frozenCredits: number;
  totalRedeemed: number;
  totalCaptured: number;
  updatedAt: string;
}

export interface AdminCreditLedgerEntryDto {
  id: string;
  userId: string;
  entryType: "redeem" | "hold" | "capture" | "release" | "refund" | "adjustment";
  amount: number;
  balanceAfter: number;
  frozenAfter: number;
  idempotencyKey: string;
  reason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAdjustUserCreditsResultDto {
  account: AdminCreditAccountDto;
  ledger: AdminCreditLedgerEntryDto;
}

export interface AdminCreditAccountRowDto {
  userId: string;
  userEmail: string;
  balance: number;
  frozenCredits: number;
  totalRedeemed: number;
  totalCaptured: number;
  updatedAt: string;
}

export interface AdminCreditLedgerRowDto {
  id: string;
  userId: string;
  userEmail: string;
  taskId?: string;
  accessCodeId?: string;
  entryType: AdminCreditLedgerEntryDto["entryType"];
  amount: number;
  balanceAfter: number;
  frozenAfter?: number;
  idempotencyKey: string;
  reason?: string;
  createdAt: string;
}

export interface AdminCreditOperationsDto {
  accounts: AdminCreditAccountRowDto[];
  ledger: AdminCreditLedgerRowDto[];
}

export interface AdminFeedbackItemDto {
  id: string;
  userId?: string;
  userEmail?: string;
  taskId?: string;
  reportId?: string;
  rating?: number;
  feedbackType?: string;
  comment?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminFeedbackDto {
  summary: {
    total: number;
    averageRating: number;
    withComments: number;
  };
  items: AdminFeedbackItemDto[];
}

export interface AdminSettingItemDto {
  key: string;
  value: unknown;
  description?: string;
  updatedByUserId?: string;
  configured: boolean;
  updatedAt?: string;
}

export interface AdminSettingsDto {
  items: AdminSettingItemDto[];
}

export interface AdminAuditLogDto {
  id: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
}

export class AdminClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AdminClientError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchAdminOverview(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminOverviewDto> {
  const body = await requestAdminJson("/api/admin/overview", {}, fetchImpl);
  assertObjectWithProperty(body, "overview", "Invalid admin overview response");

  return body.overview as unknown as AdminOverviewDto;
}

export async function fetchAdminUsers(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminUserRowDto[]> {
  const body = await requestAdminJson("/api/admin/users", {}, fetchImpl);
  assertObjectWithProperty(body, "users", "Invalid admin users response");
  const result = body.users as unknown as AdminListUsersResultDto;
  if (!Array.isArray(result.items)) {
    throw new AdminClientError(200, "Invalid admin users response");
  }

  return result.items.map(toUserRowDto);
}

export async function fetchAdminAccessCodeBatches(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminAccessCodeBatchDto[]> {
  const body = await requestAdminJson("/api/admin/access-codes/batches", {}, fetchImpl);
  assertObjectWithProperty(body, "batches", "Invalid access-code batches response");
  if (!Array.isArray(body.batches)) {
    throw new AdminClientError(200, "Invalid access-code batches response");
  }

  return body.batches as unknown as AdminAccessCodeBatchDto[];
}

export async function fetchAdminTasks(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminTaskRowDto[]> {
  const body = await requestAdminJson("/api/admin/tasks", {}, fetchImpl);
  assertObjectWithProperty(body, "tasks", "Invalid admin tasks response");
  if (!Array.isArray(body.tasks)) {
    throw new AdminClientError(200, "Invalid admin tasks response");
  }

  return body.tasks as unknown as AdminTaskRowDto[];
}

export async function fetchAdminCreditOperations(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminCreditOperationsDto> {
  const body = await requestAdminJson("/api/admin/credits", {}, fetchImpl);
  assertObjectWithProperty(body, "credits", "Invalid admin credits response");
  return body.credits as unknown as AdminCreditOperationsDto;
}

export async function fetchAdminCostSummary(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminCostSummaryDto> {
  const body = await requestAdminJson("/api/admin/costs", {}, fetchImpl);
  assertObjectWithProperty(body, "summary", "Invalid admin costs response");
  return body.summary as unknown as AdminCostSummaryDto;
}

export async function fetchAdminQueue(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminOverviewDto["queue"]> {
  const body = await requestAdminJson("/api/admin/queue", {}, fetchImpl);
  assertObjectWithProperty(body, "queue", "Invalid admin queue response");
  return body.queue as unknown as AdminOverviewDto["queue"];
}

export async function fetchAdminFeedback(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminFeedbackDto> {
  const body = await requestAdminJson("/api/admin/feedback", {}, fetchImpl);
  assertObjectWithProperty(body, "feedback", "Invalid admin feedback response");
  return body.feedback as unknown as AdminFeedbackDto;
}

export async function fetchAdminSettings(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminSettingsDto> {
  const body = await requestAdminJson("/api/admin/settings", {}, fetchImpl);
  assertObjectWithProperty(body, "settings", "Invalid admin settings response");
  return body.settings as unknown as AdminSettingsDto;
}

export async function fetchAdminAuditLogs(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminAuditLogDto[]> {
  const body = await requestAdminJson("/api/admin/audit-logs", {}, fetchImpl);
  assertObjectWithProperty(body, "auditLogs", "Invalid admin audit logs response");
  if (!Array.isArray(body.auditLogs)) {
    throw new AdminClientError(200, "Invalid admin audit logs response");
  }

  return body.auditLogs as unknown as AdminAuditLogDto[];
}

export async function createAdminAccessCodeBatch(
  input: AdminCreateAccessCodeBatchInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminCreateAccessCodeBatchResultDto> {
  const body = await requestAdminJson(
    "/api/admin/access-codes/batches",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "batch", "Invalid access-code batch response");
  assertObjectWithProperty(body, "codes", "Invalid access-code batch response");

  return body as unknown as AdminCreateAccessCodeBatchResultDto;
}

export async function disableAdminAccessCodeBatch(
  batchId: string,
  reason: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminDisableAccessCodeBatchResultDto> {
  const body = await requestAdminJson(
    `/api/admin/access-codes/batches/${encodeURIComponent(batchId)}/disable`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "batch", "Invalid access-code disable response");
  assertObjectWithProperty(body, "disabledCodeCount", "Invalid access-code disable response");

  return body as unknown as AdminDisableAccessCodeBatchResultDto;
}

export async function adjustAdminUserCredits(
  userId: string,
  input: AdminAdjustUserCreditsInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminAdjustUserCreditsResultDto> {
  const body = await requestAdminJson(
    `/api/admin/users/${encodeURIComponent(userId)}/credits`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "account", "Invalid credit adjustment response");
  assertObjectWithProperty(body, "ledger", "Invalid credit adjustment response");

  return body as unknown as AdminAdjustUserCreditsResultDto;
}

function toUserRowDto(user: AdminUserSummaryDto): AdminUserRowDto {
  return {
    id: user.id,
    email: user.email,
    status: user.status === "disabled" ? "disabled" : "active",
    tier: user.tier,
    role: user.role === "owner" ? "admin" : user.role,
    features: user.features,
    availableCredits: user.creditAccount?.balance ?? 0,
    frozenCredits: user.creditAccount?.frozenCredits ?? 0,
    redeemedBatchCount: user.creditAccount?.totalRedeemed ?? 0,
    taskCount: user.taskSummary.total,
    completedTaskCount: user.taskSummary.completed,
    failedTaskCount: user.taskSummary.failed,
    activeTaskCount: user.taskSummary.active,
    lastLoginAt: user.lastLoginAt,
    recentActivityAt: user.creditAccount?.updatedAt ?? user.updatedAt,
    createdAt: user.createdAt,
  };
}

async function requestAdminJson(
  input: RequestInfo | URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(input, {
    ...init,
    credentials: "include",
  });
  const body = await readJson(response);
  if (!response.ok) {
    const errorBody = isObject(body) ? body : {};
    throw new AdminClientError(
      response.status,
      typeof errorBody.error === "string" ? errorBody.error : "Admin request failed",
      typeof errorBody.code === "string" ? errorBody.code : undefined,
    );
  }
  if (!isObject(body)) {
    throw new AdminClientError(response.status, "Invalid admin response");
  }

  return body;
}

function assertObjectWithProperty(
  value: Record<string, unknown>,
  property: string,
  message: string,
): void {
  if (!(property in value)) {
    throw new AdminClientError(200, message);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
