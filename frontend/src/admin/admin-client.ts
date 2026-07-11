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
  entitlementDurationDays?: number;
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
  entitlementDurationDays?: number;
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
  entitlementDurationDays?: number;
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
    entitlementDurationDays?: number;
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
  status: "active" | "disabled" | "deleted";
  tier: AdminUserTierDto;
  role?: "user" | "admin" | "owner";
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

export interface AdminCreateUserInputDto {
  email: string;
  password: string;
  role?: "user" | "admin" | "owner";
  tier?: AdminUserTierDto;
  features?: AdminCommercialFeatureDto[];
  initialCredits?: number;
  reason: string;
}

export interface AdminUpdateUserInputDto {
  email?: string;
  role?: "user" | "admin" | "owner";
  tier?: AdminUserTierDto;
  features?: AdminCommercialFeatureDto[];
  status?: "active" | "disabled" | "deleted";
  reason: string;
}

export interface AdminBulkUsersInputDto {
  userIds: string[];
  operation: "disable" | "restore" | "delete" | "update_entitlements";
  role?: "user" | "admin" | "owner";
  tier?: AdminUserTierDto;
  features?: AdminCommercialFeatureDto[];
  reason: string;
}

export interface AdminBulkUsersResultDto {
  updatedUserIds: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface AdminAccessCodeRowDto {
  id: string;
  batchId: string;
  batchName?: string;
  codeMask: string;
  status: "active" | "redeemed" | "disabled" | "expired";
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  entitlementDurationDays?: number;
  redeemedByUserId?: string;
  redeemedByUserEmail?: string;
  redeemedAt?: string;
  disabledAt?: string;
  deletedAt?: string;
  createdAt: string;
}

export interface AdminListAccessCodesDto {
  total: number;
  items: AdminAccessCodeRowDto[];
}

export interface AdminBulkAccessCodesInputDto {
  accessCodeIds: string[];
  operation: "disable" | "restore" | "delete";
  reason: string;
}

export interface AdminBulkAccessCodesResultDto {
  updatedCodeIds: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface AdminPlatformModelProviderDto {
  id: string;
  provider: "gemini" | "anthropic" | "openai_compatible";
  displayName: string;
  baseUrl?: string;
  apiKeyMask: string;
  status: "active" | "disabled";
  lastTestedAt?: string;
  lastTestStatus?: "passed" | "failed";
  lastModelSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSaveModelProviderInputDto {
  provider: AdminPlatformModelProviderDto["provider"];
  displayName: string;
  baseUrl?: string;
  apiKey?: string;
  status?: AdminPlatformModelProviderDto["status"];
  providerConfigId?: string;
}

export interface AdminPlatformModelProfileDto {
  id: string;
  providerConfigId?: string;
  label: string;
  providerLabel?: string;
  modelId: string;
  quality?: "fast" | "balanced" | "deep";
  source?: "admin" | "fallback";
  visibleToUser?: boolean;
  status?: "active" | "disabled" | "deprecated";
  capabilities?: Record<string, unknown>;
  limits?: Record<string, unknown>;
}

export interface AdminModelProfileTestInputDto {
  profileId: string;
  providerConfigId: string;
  modelId: string;
}

export interface AdminModelProfileTestResultDto {
  providerConfigId: string;
  profileId: string;
  modelId: string;
  ok: boolean;
  checkedAt: string;
  error?: string;
}

export interface AdminDiscoveredModelDto {
  id: string;
  label?: string;
}

export interface AdminModelProviderModelCatalogDto {
  providerId: string;
  provider: AdminPlatformModelProviderDto["provider"];
  models: AdminDiscoveredModelDto[];
  unsupported: boolean;
  error?: string;
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
  platformModels?: {
    available: Array<{
      id: string;
      label: string;
      providerLabel?: string;
      modelId: string;
      quality?: "fast" | "balanced" | "deep";
    }>;
    enabled: Array<{
      id: string;
      label: string;
      providerLabel?: string;
      modelId: string;
      quality?: "fast" | "balanced" | "deep";
    }>;
    enabledModelProfileIds: string[];
  };
  platformModelProviders?: AdminPlatformModelProviderDto[];
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

export async function createAdminUser(
  input: AdminCreateUserInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminUserRowDto> {
  const body = await requestAdminJson(
    "/api/admin/users",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "user", "Invalid admin user response");
  return toUserRowDto(body.user as AdminUserSummaryDto);
}

export async function updateAdminUser(
  userId: string,
  input: AdminUpdateUserInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminUserRowDto> {
  if (input.status === "disabled") {
    return changeAdminUserStatus(userId, "disable", input.reason, fetchImpl);
  }
  if (input.status === "active") {
    return changeAdminUserStatus(userId, "restore", input.reason, fetchImpl);
  }
  if (input.status === "deleted") {
    return deleteAdminUser(userId, input.reason, fetchImpl);
  }

  const body = await requestAdminJson(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "user", "Invalid admin user response");
  return toUserRowDto(body.user as AdminUserSummaryDto);
}

export async function deleteAdminUser(
  userId: string,
  reason: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminUserRowDto> {
  const body = await requestAdminJson(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "user", "Invalid admin user response");
  return toUserRowDto(body.user as AdminUserSummaryDto);
}

export async function bulkAdminUsers(
  input: AdminBulkUsersInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminBulkUsersResultDto> {
  const body = await requestAdminJson(
    "/api/admin/users/bulk",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "result", "Invalid admin user bulk response");
  return body.result as unknown as AdminBulkUsersResultDto;
}

async function changeAdminUserStatus(
  userId: string,
  operation: "disable" | "restore",
  reason: string,
  fetchImpl: typeof fetch,
): Promise<AdminUserRowDto> {
  const body = await requestAdminJson(
    `/api/admin/users/${encodeURIComponent(userId)}/${operation}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "user", "Invalid admin user response");
  return toUserRowDto(body.user as AdminUserSummaryDto);
}

export async function fetchAdminAccessCodes(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminListAccessCodesDto> {
  const body = await requestAdminJson("/api/admin/access-codes", {}, fetchImpl);
  assertObjectWithProperty(body, "accessCodes", "Invalid access-code inventory response");
  return body.accessCodes as unknown as AdminListAccessCodesDto;
}

export async function disableAdminAccessCode(
  accessCodeId: string,
  reason: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminAccessCodeRowDto> {
  const body = await requestAdminJson(
    `/api/admin/access-codes/${encodeURIComponent(accessCodeId)}/disable`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "accessCode", "Invalid access-code response");
  return body.accessCode as unknown as AdminAccessCodeRowDto;
}

export async function restoreAdminAccessCode(
  accessCodeId: string,
  reason: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminAccessCodeRowDto> {
  const body = await requestAdminJson(
    `/api/admin/access-codes/${encodeURIComponent(accessCodeId)}/restore`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "accessCode", "Invalid access-code response");
  return body.accessCode as unknown as AdminAccessCodeRowDto;
}

export async function deleteAdminAccessCode(
  accessCodeId: string,
  reason: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminAccessCodeRowDto> {
  const body = await requestAdminJson(
    `/api/admin/access-codes/${encodeURIComponent(accessCodeId)}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "accessCode", "Invalid access-code response");
  return body.accessCode as unknown as AdminAccessCodeRowDto;
}

export async function bulkAdminAccessCodes(
  input: AdminBulkAccessCodesInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminBulkAccessCodesResultDto> {
  const body = await requestAdminJson(
    "/api/admin/access-codes/bulk",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "result", "Invalid access-code bulk response");
  return body.result as unknown as AdminBulkAccessCodesResultDto;
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

export async function updateAdminPlatformModels(
  enabledModelProfileIds: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminSettingsDto> {
  const body = await requestAdminJson(
    "/api/admin/settings/platform-models",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabledModelProfileIds }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "settings", "Invalid platform model settings response");
  return body.settings as unknown as AdminSettingsDto;
}

export async function fetchAdminModelProviders(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProviderDto[]> {
  const body = await requestAdminJson("/api/admin/model-providers", {}, fetchImpl);
  assertObjectWithProperty(body, "providers", "Invalid model providers response");
  if (!Array.isArray(body.providers)) {
    throw new AdminClientError(200, "Invalid model providers response");
  }
  return body.providers as unknown as AdminPlatformModelProviderDto[];
}

export async function saveAdminModelProvider(
  input: AdminSaveModelProviderInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProviderDto> {
  const body = await requestAdminJson(
    "/api/admin/model-providers",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "provider", "Invalid model provider response");
  return body.provider as unknown as AdminPlatformModelProviderDto;
}

export async function softDeleteAdminModelProvider(
  provider: AdminPlatformModelProviderDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProviderDto> {
  return saveAdminModelProvider({
    provider: provider.provider,
    providerConfigId: provider.id,
    displayName: provider.displayName,
    baseUrl: provider.baseUrl,
    status: "disabled",
  }, fetchImpl);
}

export async function testAdminModelProvider(
  providerId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProviderDto> {
  const body = await requestAdminJson(
    `/api/admin/model-providers/${encodeURIComponent(providerId)}/test`,
    { method: "POST" },
    fetchImpl,
  );
  assertObjectWithProperty(body, "provider", "Invalid model provider response");
  return body.provider as unknown as AdminPlatformModelProviderDto;
}

export async function fetchAdminModelProviderModels(
  providerId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminModelProviderModelCatalogDto> {
  const body = await requestAdminJson(
    `/api/admin/model-providers/${encodeURIComponent(providerId)}/models`,
    {},
    fetchImpl,
  );
  assertObjectWithProperty(body, "catalog", "Invalid model provider catalog response");
  return body.catalog as unknown as AdminModelProviderModelCatalogDto;
}

export async function fetchAdminModelProfiles(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProfileDto[]> {
  const body = await requestAdminJson("/api/admin/model-profiles", {}, fetchImpl);
  assertObjectWithProperty(body, "profiles", "Invalid model profiles response");
  if (!Array.isArray(body.profiles)) {
    throw new AdminClientError(200, "Invalid model profiles response");
  }
  return body.profiles as unknown as AdminPlatformModelProfileDto[];
}

export async function saveAdminModelProfile(
  input: AdminPlatformModelProfileDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProfileDto> {
  const method = input.source === "admin" ? "PATCH" : "POST";
  const url = method === "PATCH"
    ? `/api/admin/model-profiles/${encodeURIComponent(input.id)}`
    : "/api/admin/model-profiles";
  const body = await requestAdminJson(
    url,
    {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "profile", "Invalid model profile response");
  return body.profile as unknown as AdminPlatformModelProfileDto;
}

export async function testAdminModelProfile(
  input: AdminModelProfileTestInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminModelProfileTestResultDto> {
  const body = await requestAdminJson(
    `/api/admin/model-profiles/${encodeURIComponent(input.profileId)}/test`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerConfigId: input.providerConfigId,
        modelId: input.modelId,
      }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "result", "Invalid model profile test response");
  return body.result as unknown as AdminModelProfileTestResultDto;
}

export async function softDeleteAdminModelProfile(
  profile: AdminPlatformModelProfileDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminPlatformModelProfileDto> {
  return saveAdminModelProfile({
    ...profile,
    status: "disabled",
  }, fetchImpl);
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
    status: user.status,
    tier: user.tier,
    role: user.role,
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
