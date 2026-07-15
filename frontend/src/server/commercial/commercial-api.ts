import {
  AccessCodeServiceError,
} from "./access-code-service.js";
import type {
  CommercialAdminService,
} from "./admin-service.js";
import {
  CommercialAdminServiceError,
} from "./admin-service.js";
import {
  AdminAuditServiceError,
} from "./audit-service.js";
import type {
  CommercialAuthService,
  CommercialAuthUser,
} from "./auth-service.js";
import {
  CommercialAuthError,
} from "./auth-service.js";
import type { CommercialTaskService } from "./commercial-task-service.js";
import {
  CommercialTaskServiceError,
} from "./commercial-task-service.js";
import type {
  CreditService,
  CreditTransitionResult,
  RedeemAccessCodeResult,
} from "./credit-service.js";
import { CreditServiceError } from "./credit-service.js";
import type {
  ModelProviderService,
  PublicModelProviderDto,
} from "./model-provider-service.js";
import { ModelProviderServiceError } from "./model-provider-service.js";
import type { WorkerMonitoringService } from "./worker-monitoring.js";
import type { CommercialRepository } from "./repository.js";
import type {
  AdminAuditLogRecord,
  CommercialSimulationReportRecord,
  CommercialSimulationTaskRecord,
  JsonObject,
  SimulationStepRunCostRecord,
  UserCreditAccountRecord,
} from "./types.js";
import { assessUserInputSafety } from "../simulations/safety.js";
import type {
  InteractionMode,
  ModelSelection,
  SimulationProgressStep,
  SimulationType,
  UserInput,
} from "../../types.js";
import {
  COMMERCIAL_FEATURES,
  USER_ROLES,
  USER_TIERS,
  isAdminRole,
  type CommercialFeature,
  type ProviderMode,
  type UserRole,
  type UserTier,
} from "../../contracts/commercial.js";
import type {
  ModelCapabilities,
  ModelLimits,
  ModelQuality,
} from "../ai/types.js";
import { validateModelSelection } from "../ai/model-selection.schema.js";
import {
  PLATFORM_MODEL_SETTING_KEY,
  filterPlatformModelOptions,
  normalizePlatformModelProfileIds,
} from "../../model-options.js";
import { loadRepositoryPlatformModelCatalog } from "./platform-model-runtime.js";

export const COMMERCIAL_SESSION_COOKIE_NAME = "tryitout_session";

const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CommercialCookieOptions {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

export interface CommercialCookieDescriptor {
  name: string;
  value: string;
  options: CommercialCookieOptions;
}

export interface CommercialApiResult<T = unknown> {
  status: number;
  body: T;
  cookies?: CommercialCookieDescriptor[];
}

export interface CommercialApiRequest {
  body?: unknown;
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
}

export interface CommercialApiDeps {
  adminService: CommercialAdminService;
  authService: CommercialAuthService;
  creditService: CreditService;
  modelProviderService?: ModelProviderService;
  repository: CommercialRepository;
  taskService: CommercialTaskService;
  workerMonitoringService?: WorkerMonitoringService;
}

export interface CommercialApiRuntimeOptions {
  production?: boolean;
}

export type CommercialApiErrorBody = {
  error: string;
  code?: string;
};

type RegisterBody = {
  email: string;
  password: string;
};

type LoginBody = RegisterBody;

type AuthResult =
  | { ok: true; user: CommercialAuthUser }
  | { ok: false; result: CommercialApiResult<CommercialApiErrorBody> };

type CreateAdminAccessCodeBatchBody = {
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: UserTier;
  features: CommercialFeature[];
  expiresAt?: string;
  entitlementDurationDays?: number;
  notes?: string;
  metadata?: JsonObject;
};

type DisableAdminAccessCodeBatchBody = {
  reason: string;
};

type AdjustAdminUserCreditsBody = {
  amount: number;
  reason: string;
  idempotencyKey: string;
  metadata?: JsonObject;
};

type CreateAdminUserBody = {
  email: string;
  password: string;
  role?: UserRole;
  tier?: UserTier;
  features?: CommercialFeature[];
  initialCredits?: number;
  reason: string;
};

type UpdateAdminUserBody = {
  email?: string;
  role?: UserRole;
  tier?: UserTier;
  features?: CommercialFeature[];
  reason: string;
};

type BulkAdminUsersBody = {
  userIds: string[];
  operation: "disable" | "restore" | "delete" | "update_entitlements";
  role?: UserRole;
  tier?: UserTier;
  features?: CommercialFeature[];
  reason: string;
};

type AdminReasonBody = {
  reason: string;
};

type BulkAdminAccessCodesBody = {
  accessCodeIds: string[];
  operation: "disable" | "restore" | "delete";
  reason: string;
};

type UpdatePlatformModelsBody = {
  enabledModelProfileIds: string[];
};

type SaveAdminModelProviderBody = {
  provider: "gemini" | "anthropic" | "openai_compatible";
  displayName: string;
  baseUrl?: string;
  apiKey?: string;
  status?: "active" | "disabled";
  providerConfigId?: string;
};

type SaveAdminModelProfileBody = {
  id?: string;
  providerConfigId: string;
  label: string;
  providerLabel?: string;
  modelId: string;
  quality: ModelQuality;
  visibleToUser: boolean;
  status: "active" | "disabled" | "deprecated";
  capabilities?: Partial<ModelCapabilities>;
  limits?: Partial<ModelLimits>;
};

type TestAdminModelProfileBody = {
  providerConfigId: string;
  modelId: string;
};

type SaveModelProviderBody = {
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  modelFast?: string;
  modelBalanced?: string;
  modelDeep?: string;
};

type CommercialSimulationTaskStatusDto = CommercialSimulationTaskRecord & {
  displayTitle?: string;
  currentStageIndex?: number;
  currentStepName?: SimulationProgressStep;
  progressPercent?: number;
  progressMessage?: string;
  recoverable?: boolean;
};

const SIMULATION_PROGRESS_STEPS = new Set<SimulationProgressStep>([
  "safety_check",
  "generate_agents",
  "initialize_world_state",
  "simulate_stage",
  "generate_world_event",
  "generate_agent_actions",
  "arbitrate_stage",
  "generate_report",
  "generate_route_comparison",
]);

export async function handleRegisterRequest(
  body: unknown,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ user: CommercialAuthUser } | CommercialApiErrorBody>> {
  const parsed = parseCredentials(body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_input");
  }

  try {
    const result = await deps.authService.register(parsed.value);
    return {
      status: 201,
      body: { user: result.user },
    };
  } catch (error) {
    return mapAuthError(error);
  }
}

export async function handleLoginRequest(
  body: unknown,
  deps: CommercialApiDeps,
  options: CommercialApiRuntimeOptions = {},
): Promise<
  CommercialApiResult<{ user: CommercialAuthUser } | CommercialApiErrorBody>
> {
  const parsed = parseCredentials(body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_input");
  }

  try {
    const result = await deps.authService.login(parsed.value);
    return {
      status: 200,
      body: { user: result.user },
      cookies: [
        buildSessionCookie(result.sessionToken, options.production === true),
      ],
    };
  } catch (error) {
    return mapAuthError(error);
  }
}

export async function handleLogoutRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
  options: CommercialApiRuntimeOptions = {},
): Promise<CommercialApiResult<{ ok: true }>> {
  const sessionToken = getSessionToken(request);
  if (sessionToken !== undefined) {
    await deps.authService.logout(sessionToken);
  }

  return {
    status: 200,
    body: { ok: true },
    cookies: [buildExpiredSessionCookie(options.production === true)],
  };
}

export async function handleGetMeRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ user: CommercialAuthUser } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  return {
    status: 200,
    body: { user: auth.user },
  };
}

export async function handleRedeemAccessCodeRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    | {
        account: UserCreditAccountRecord;
        ledger: CreditTransitionResult["ledger"];
        redemption: RedeemAccessCodeResult["redemption"];
        user: CommercialAuthUser;
      }
    | CommercialApiErrorBody
  >
> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseRedeemBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_credit_input");
  }

  try {
    const result = await deps.creditService.redeemAccessCode({
      userId: auth.user.id,
      rawCode: parsed.value.code,
      idempotencyKey: parsed.value.idempotencyKey,
      metadata: parsed.value.metadata,
    });
    const refreshedUser =
      await deps.authService.getUserForSessionToken(getSessionToken(request) ?? "");

    return {
      status: 200,
      body: {
        account: result.account,
        ledger: result.ledger,
        redemption: result.redemption,
        user: refreshedUser ?? auth.user,
      },
    };
  } catch (error) {
    return mapCreditError(error);
  }
}

export async function handleGetCreditsRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ account: UserCreditAccountRecord } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  const account = await deps.repository.getCreditAccount(auth.user.id);
  if (account === undefined) {
    return {
      status: 404,
      body: {
        error: "Credit account not found",
        code: "account_not_found",
      },
    };
  }

  return {
    status: 200,
    body: { account },
  };
}

export async function handleSaveModelProviderRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ provider: PublicModelProviderDto } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const service = requireModelProviderService(deps);
  if (service === undefined) {
    return notFound("Model provider service is unavailable", "model_provider_unavailable");
  }
  const parsed = parseSaveModelProviderBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_model_provider_input");
  }

  try {
    return {
      status: 200,
      body: {
        provider: await service.saveProvider({
          userId: auth.user.id,
          ...parsed.value,
        }),
      },
    };
  } catch (error) {
    return mapModelProviderError(error);
  }
}

export async function handleGetModelProviderRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ provider?: PublicModelProviderDto } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const service = requireModelProviderService(deps);
  if (service === undefined) {
    return notFound("Model provider service is unavailable", "model_provider_unavailable");
  }

  return {
    status: 200,
    body: {
      provider: await service.getPublicProvider(auth.user.id),
    },
  };
}

export async function handleGetPlatformModelsRequest(
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ models: ReturnType<typeof filterPlatformModelOptions> }>> {
  const catalog = await loadRepositoryPlatformModelCatalog(deps.repository);
  if (catalog !== undefined) {
    return {
      status: 200,
      body: {
        models: catalog.options,
      },
    };
  }

  const setting = await deps.repository.getSystemSetting(PLATFORM_MODEL_SETTING_KEY);
  const enabledModelProfileIds = normalizePlatformModelProfileIds(setting?.value);
  return {
    status: 200,
    body: {
      models: filterPlatformModelOptions(enabledModelProfileIds),
    },
  };
}

export async function handleTestModelProviderRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ provider: PublicModelProviderDto } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const service = requireModelProviderService(deps);
  if (service === undefined) {
    return notFound("Model provider service is unavailable", "model_provider_unavailable");
  }

  try {
    return {
      status: 200,
      body: { provider: await service.testProviderConnection(auth.user.id) },
    };
  } catch (error) {
    return mapModelProviderError(error);
  }
}

export async function handleDeleteModelProviderRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ provider: PublicModelProviderDto } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const service = requireModelProviderService(deps);
  if (service === undefined) {
    return notFound("Model provider service is unavailable", "model_provider_unavailable");
  }

  try {
    return {
      status: 200,
      body: { provider: await service.deleteProvider(auth.user.id) },
    };
  } catch (error) {
    return mapModelProviderError(error);
  }
}

export async function handleGetAdminOverviewRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ overview: Awaited<ReturnType<CommercialAdminService["getOverview"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { overview: await deps.adminService.getOverview() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminUsersRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ users: Awaited<ReturnType<CommercialAdminService["listUsers"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { users: await deps.adminService.listUsers() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleCreateAdminUserRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { user: Awaited<ReturnType<CommercialAdminService["createUser"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseCreateAdminUserBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 201,
      body: {
        user: await deps.adminService.createUser({
          actorUserId: auth.user.id,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleUpdateAdminUserRequest(
  userId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { user: Awaited<ReturnType<CommercialAdminService["updateUser"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseUpdateAdminUserBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        user: await deps.adminService.updateUser({
          actorUserId: auth.user.id,
          userId,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleDeleteAdminUserRequest(
  userId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { user: Awaited<ReturnType<CommercialAdminService["deleteUser"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseAdminReasonBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        user: await deps.adminService.deleteUser({
          actorUserId: auth.user.id,
          userId,
          reason: parsed.value.reason,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleDisableAdminUserRequest(
  userId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { user: Awaited<ReturnType<CommercialAdminService["disableUser"]>> } | CommercialApiErrorBody
  >
> {
  return handleAdminUserStatusRequest(userId, request, deps, "disable");
}

export async function handleRestoreAdminUserRequest(
  userId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { user: Awaited<ReturnType<CommercialAdminService["restoreUser"]>> } | CommercialApiErrorBody
  >
> {
  return handleAdminUserStatusRequest(userId, request, deps, "restore");
}

export async function handleBulkAdminUsersRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { result: Awaited<ReturnType<CommercialAdminService["bulkUpdateUsers"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseBulkAdminUsersBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        result: await deps.adminService.bulkUpdateUsers({
          actorUserId: auth.user.id,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminAccessCodeBatchesRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ batches: Awaited<ReturnType<CommercialAdminService["listAccessCodeBatches"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { batches: await deps.adminService.listAccessCodeBatches() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminAccessCodesRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { accessCodes: Awaited<ReturnType<CommercialAdminService["listAccessCodes"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { accessCodes: await deps.adminService.listAccessCodes() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleDisableAdminAccessCodeRequest(
  accessCodeId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { accessCode: Awaited<ReturnType<CommercialAdminService["disableAccessCode"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseAdminReasonBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        accessCode: await deps.adminService.disableAccessCode({
          actorUserId: auth.user.id,
          accessCodeId,
          reason: parsed.value.reason,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleRestoreAdminAccessCodeRequest(
  accessCodeId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { accessCode: Awaited<ReturnType<CommercialAdminService["restoreAccessCode"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseAdminReasonBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        accessCode: await deps.adminService.restoreAccessCode({
          actorUserId: auth.user.id,
          accessCodeId,
          reason: parsed.value.reason,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleDeleteAdminAccessCodeRequest(
  accessCodeId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { accessCode: Awaited<ReturnType<CommercialAdminService["deleteAccessCode"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseAdminReasonBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        accessCode: await deps.adminService.deleteAccessCode({
          actorUserId: auth.user.id,
          accessCodeId,
          reason: parsed.value.reason,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleBulkAdminAccessCodesRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { result: Awaited<ReturnType<CommercialAdminService["bulkAccessCodeOperation"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseBulkAdminAccessCodesBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        result: await deps.adminService.bulkAccessCodeOperation({
          actorUserId: auth.user.id,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminTasksRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ tasks: Awaited<ReturnType<CommercialAdminService["listTasks"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { tasks: await deps.adminService.listTasks() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleGetAdminCreditOperationsRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ credits: Awaited<ReturnType<CommercialAdminService["getCreditOperations"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { credits: await deps.adminService.getCreditOperations() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleGetAdminCostSummaryRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ summary: Awaited<ReturnType<CommercialAdminService["getCostSummary"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { summary: await deps.adminService.getCostSummary() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleGetAdminQueueRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ queue: Awaited<ReturnType<CommercialAdminService["getOverview"]>>["queue"] } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const overview = await deps.adminService.getOverview();
    return {
      status: 200,
      body: { queue: overview.queue },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleGetAdminFeedbackRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ feedback: Awaited<ReturnType<CommercialAdminService["getFeedback"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { feedback: await deps.adminService.getFeedback() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleGetAdminSettingsRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ settings: Awaited<ReturnType<CommercialAdminService["getSettings"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { settings: await deps.adminService.getSettings() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleUpdateAdminPlatformModelsRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ settings: Awaited<ReturnType<CommercialAdminService["getSettings"]>> } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseUpdatePlatformModelsBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        settings: await deps.adminService.updatePlatformModels({
          actorUserId: auth.user.id,
          enabledModelProfileIds: parsed.value.enabledModelProfileIds,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminModelProvidersRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { providers: Awaited<ReturnType<CommercialAdminService["getSettings"]>>["platformModelProviders"] } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const settings = await deps.adminService.getSettings();
    return {
      status: 200,
      body: { providers: settings.platformModelProviders },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleSaveAdminModelProviderRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { provider: Awaited<ReturnType<CommercialAdminService["savePlatformModelProvider"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseSaveAdminModelProviderBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        provider: await deps.adminService.savePlatformModelProvider({
          actorUserId: auth.user.id,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleTestAdminModelProviderRequest(
  providerConfigId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { provider: Awaited<ReturnType<CommercialAdminService["testPlatformModelProvider"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: {
        provider: await deps.adminService.testPlatformModelProvider({
          actorUserId: auth.user.id,
          providerConfigId,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminProviderModelsRequest(
  providerConfigId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { catalog: Awaited<ReturnType<CommercialAdminService["listPlatformProviderModels"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: {
        catalog: await deps.adminService.listPlatformProviderModels({
          actorUserId: auth.user.id,
          providerConfigId,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminModelProfilesRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { profiles: Awaited<ReturnType<CommercialAdminService["getSettings"]>>["platformModels"]["available"] } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const settings = await deps.adminService.getSettings();
    return {
      status: 200,
      body: {
        profiles: settings.platformModels.available.filter(
          (profile) => profile.source === "admin",
        ),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleSaveAdminModelProfileRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
  profileId?: string,
): Promise<
  CommercialApiResult<
    { profile: Awaited<ReturnType<CommercialAdminService["savePlatformModelProfile"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseSaveAdminModelProfileBody(request.body, profileId);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        profile: await deps.adminService.savePlatformModelProfile({
          actorUserId: auth.user.id,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleTestAdminModelProfileRequest(
  profileId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    { result: Awaited<ReturnType<CommercialAdminService["testPlatformModelProfile"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseTestAdminModelProfileBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    return {
      status: 200,
      body: {
        result: await deps.adminService.testPlatformModelProfile({
          actorUserId: auth.user.id,
          profileId,
          ...parsed.value,
          requestContext: getAdminRequestContext(request),
        }),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleCreateAdminAccessCodeBatchRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    Awaited<ReturnType<CommercialAdminService["createAccessCodeBatch"]>> | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseCreateAdminAccessCodeBatchBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    const result = await deps.adminService.createAccessCodeBatch({
      actorUserId: auth.user.id,
      ...parsed.value,
      requestContext: getAdminRequestContext(request),
    });
    return {
      status: 201,
      body: result,
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleDisableAdminAccessCodeBatchRequest(
  batchId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    Awaited<ReturnType<CommercialAdminService["disableAccessCodeBatch"]>> | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseDisableAdminAccessCodeBatchBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    const result = await deps.adminService.disableAccessCodeBatch({
      actorUserId: auth.user.id,
      batchId,
      reason: parsed.value.reason,
      requestContext: getAdminRequestContext(request),
    });
    return {
      status: 200,
      body: result,
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleAdjustAdminUserCreditsRequest(
  userId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<CreditTransitionResult | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseAdjustAdminUserCreditsBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    const result = await deps.adminService.adjustUserCredits({
      actorUserId: auth.user.id,
      userId,
      amount: parsed.value.amount,
      reason: parsed.value.reason,
      idempotencyKey: parsed.value.idempotencyKey,
      metadata: parsed.value.metadata,
    });
    return {
      status: 200,
      body: result,
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleListAdminAuditLogsRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ auditLogs: AdminAuditLogRecord[] } | CommercialApiErrorBody>> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    return {
      status: 200,
      body: { auditLogs: await deps.adminService.getAuditLogs() },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

export async function handleCreateCommercialTaskRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    | {
        task: CommercialSimulationTaskRecord;
        account: UserCreditAccountRecord;
        holdLedger: CreditTransitionResult["ledger"];
      }
    | CommercialApiErrorBody
  >
> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseCreateTaskBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_task_input");
  }

  try {
    if (
      deps.workerMonitoringService !== undefined &&
      !(await deps.workerMonitoringService.hasFreshWorkerHeartbeat())
    ) {
      return {
        status: 503,
        body: {
          error: "Simulation workers are unavailable. Please retry shortly.",
          code: "worker_unavailable",
        },
      };
    }

    const result = await deps.taskService.createTask({
      userId: auth.user.id,
      userInput: parsed.value.userInput,
      interactionMode: parsed.value.interactionMode,
      providerMode: parsed.value.providerMode,
      modelSelection: parsed.value.modelSelection,
      priority: parsed.value.priority,
      queueWeight: parsed.value.queueWeight,
      idempotencyKey: parsed.value.idempotencyKey,
      inputSummary: summarizeUserInput(parsed.value.userInput),
    });

    return {
      status: 202,
      body: {
        task: result.task,
        account: result.hold.account,
        holdLedger: result.hold.ledger,
      },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleGetCommercialTaskStatusRequest(
  taskId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ task: CommercialSimulationTaskStatusDto } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const task = await deps.taskService.getStatus(taskId);
    if (task.userId !== auth.user.id) {
      return notFound("Task not found", "task_not_found");
    }
    return {
      status: 200,
      body: { task: await decorateTaskProgress(task, deps.repository) },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleListCommercialTasksRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ tasks: CommercialSimulationTaskStatusDto[] } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const tasks = (await deps.repository.listCommercialTasks(auth.user.id))
      .filter((task) => task.userDeletedAt === undefined);
    const sorted = [...tasks].sort(compareCommercialTasksForUserList);
    return {
      status: 200,
      body: {
        tasks: await Promise.all(
          sorted.map((task) => decorateTaskProgress(task, deps.repository)),
        ),
      },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleGetActiveCommercialTaskRequest(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ task?: CommercialSimulationTaskStatusDto } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const task = await deps.taskService.getActiveTaskForUser(auth.user.id);
    return {
      status: 200,
      body: {
        task: task ? await decorateTaskProgress(task, deps.repository) : undefined,
      },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleGetCommercialTaskReportRequest(
  taskId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<{ report: CommercialSimulationReportRecord } | CommercialApiErrorBody>
> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const task = await deps.taskService.getStatus(taskId);
    if (task.userId !== auth.user.id) {
      return notFound("Task not found", "task_not_found");
    }
    return {
      status: 200,
      body: { report: await deps.taskService.getReport(taskId) },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleResumeCommercialTaskRequest(
  taskId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ ok: boolean; task?: CommercialSimulationTaskRecord } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const task = await deps.taskService.getStatus(taskId);
    if (task.userId !== auth.user.id) {
      return notFound("Task not found", "task_not_found");
    }
    const result = await deps.taskService.resumeTask({ taskId });
    return {
      status: 200,
      body: { ok: true, task: result.task },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleCancelCommercialTaskRequest(
  taskId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<
  CommercialApiResult<
    | {
        task: CommercialSimulationTaskRecord;
        account?: UserCreditAccountRecord;
        releaseLedger?: CreditTransitionResult["ledger"];
      }
    | CommercialApiErrorBody
  >
> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const existingTask = await deps.taskService.getStatus(taskId);
    if (existingTask.userId !== auth.user.id) {
      return notFound("Task not found", "task_not_found");
    }

    const result = await deps.taskService.cancelTask({ taskId });
    return {
      status: 200,
      body: {
        task: result.task,
        account: result.release?.account,
        releaseLedger: result.release?.ledger,
      },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

export async function handleDeleteCommercialTaskRequest(
  taskId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<CommercialApiResult<{ task: CommercialSimulationTaskRecord } | CommercialApiErrorBody>> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }

  try {
    const existingTask = await deps.taskService.getStatus(taskId);
    if (existingTask.userId !== auth.user.id) {
      return notFound("Task not found", "task_not_found");
    }

    return {
      status: 200,
      body: { task: await deps.taskService.deleteTaskForUser({ taskId }) },
    };
  } catch (error) {
    return mapTaskError(error);
  }
}

function buildSessionCookie(
  value: string,
  secure: boolean,
): CommercialCookieDescriptor {
  return {
    name: COMMERCIAL_SESSION_COOKIE_NAME,
    value,
    options: sessionCookieOptions({
      secure,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    }),
  };
}

function buildExpiredSessionCookie(secure: boolean): CommercialCookieDescriptor {
  return {
    name: COMMERCIAL_SESSION_COOKIE_NAME,
    value: "",
    options: sessionCookieOptions({ secure, maxAge: 0 }),
  };
}

function sessionCookieOptions(input: {
  secure: boolean;
  maxAge: number;
}): CommercialCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: input.secure,
    path: "/",
    maxAge: input.maxAge,
  };
}

async function requireUser(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<AuthResult> {
  const sessionToken = getSessionToken(request);
  if (sessionToken === undefined) {
    return { ok: false, result: unauthorized() };
  }

  const user = await deps.authService.getUserForSessionToken(sessionToken);
  if (user === undefined) {
    return { ok: false, result: unauthorized() };
  }

  return { ok: true, user };
}

async function requireAdmin(
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
): Promise<AuthResult> {
  const auth = await requireUser(request, deps);
  if (auth.ok === false) {
    return auth;
  }
  if (!isAdminRole(auth.user.role)) {
    return { ok: false, result: forbidden() };
  }

  return auth;
}

function getSessionToken(request: CommercialApiRequest): string | undefined {
  const cookieToken = request.cookies?.[COMMERCIAL_SESSION_COOKIE_NAME]?.trim();
  if (cookieToken) {
    return cookieToken;
  }

  const cookieHeader =
    request.headers?.cookie ?? request.headers?.Cookie ?? request.headers?.COOKIE;
  const headerToken =
    cookieHeader === undefined
      ? undefined
      : parseCookieHeader(cookieHeader)[COMMERCIAL_SESSION_COOKIE_NAME]?.trim();
  if (headerToken) {
    return headerToken;
  }

  const authorization =
    request.headers?.authorization ?? request.headers?.Authorization;
  if (authorization?.startsWith("Bearer ")) {
    const bearer = authorization.slice("Bearer ".length).trim();
    return bearer || undefined;
  }

  return undefined;
}

function parseCookieHeader(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) {
          return [part, ""];
        }
        return [
          decodeURIComponent(part.slice(0, separator).trim()),
          decodeURIComponent(part.slice(separator + 1).trim()),
        ];
      }),
  );
}

function parseCredentials(
  body: unknown,
): { ok: true; value: RegisterBody | LoginBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const email = body.email;
  const password = body.password;
  if (typeof email !== "string" || typeof password !== "string") {
    return { ok: false, error: "email and password are required" };
  }

  return { ok: true, value: { email, password } };
}

function parseRedeemBody(
  body: unknown,
):
  | { ok: true; value: { code: string; idempotencyKey: string; metadata?: JsonObject } }
  | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (typeof body.code !== "string" || typeof body.idempotencyKey !== "string") {
    return { ok: false, error: "code and idempotencyKey are required" };
  }
  const rawMetadata = body.metadata;
  let metadata: JsonObject | undefined;
  if (rawMetadata !== undefined) {
    if (!isJsonObject(rawMetadata)) {
      return { ok: false, error: "metadata must be an object" };
    }
    metadata = rawMetadata;
  }

  return {
    ok: true,
    value: {
      code: body.code,
      idempotencyKey: body.idempotencyKey,
      metadata,
    },
  };
}

function parseCreateAdminUserBody(
  body: unknown,
): { ok: true; value: CreateAdminUserBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const email = readRequiredString(body, "email");
  if (email.ok === false) return email;
  const password = readRequiredString(body, "password");
  if (password.ok === false) return password;
  const reason = readRequiredString(body, "reason");
  if (reason.ok === false) return reason;
  const role = parseOptionalUserRole(body.role);
  if (role.ok === false) return role;
  const tier = parseOptionalUserTier(body.tier);
  if (tier.ok === false) return tier;
  const features = parseCommercialFeatures(body.features);
  if (features.ok === false) return features;
  let initialCredits: number | undefined;
  if (body.initialCredits !== undefined) {
    if (
      typeof body.initialCredits !== "number" ||
      !Number.isInteger(body.initialCredits) ||
      body.initialCredits < 0
    ) {
      return { ok: false, error: "initialCredits must be a non-negative integer" };
    }
    initialCredits = body.initialCredits;
  }

  return {
    ok: true,
    value: {
      email: email.value,
      password: password.value,
      role: role.value,
      tier: tier.value,
      features: features.value,
      initialCredits,
      reason: reason.value,
    },
  };
}

function parseUpdateAdminUserBody(
  body: unknown,
): { ok: true; value: UpdateAdminUserBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const reason = readRequiredString(body, "reason");
  if (reason.ok === false) return reason;
  const email = parseOptionalString(body.email, "email");
  if (email.ok === false) return email;
  const role = parseOptionalUserRole(body.role);
  if (role.ok === false) return role;
  const tier = parseOptionalUserTier(body.tier);
  if (tier.ok === false) return tier;
  let features: CommercialFeature[] | undefined;
  if (body.features !== undefined) {
    const parsedFeatures = parseCommercialFeatures(body.features);
    if (parsedFeatures.ok === false) return parsedFeatures;
    features = parsedFeatures.value;
  }

  return {
    ok: true,
    value: {
      email: email.value,
      role: role.value,
      tier: tier.value,
      features,
      reason: reason.value,
    },
  };
}

function parseBulkAdminUsersBody(
  body: unknown,
): { ok: true; value: BulkAdminUsersBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const userIds = parseStringArray(body.userIds, "userIds");
  if (userIds.ok === false) return userIds;
  const reason = readRequiredString(body, "reason");
  if (reason.ok === false) return reason;
  if (
    body.operation !== "disable" &&
    body.operation !== "restore" &&
    body.operation !== "delete" &&
    body.operation !== "update_entitlements"
  ) {
    return { ok: false, error: "operation must be disable, restore, delete, or update_entitlements" };
  }
  const role = body.role;
  if (role !== undefined && !USER_ROLES.includes(role as UserRole)) {
    return { ok: false, error: "role is invalid" };
  }
  const tier = body.tier;
  if (tier !== undefined && !USER_TIERS.includes(tier as UserTier)) {
    return { ok: false, error: "tier is invalid" };
  }
  const features = body.features === undefined
    ? undefined
    : parseCommercialFeatures(body.features);
  if (features !== undefined && features.ok === false) {
    return features;
  }
  const parsedFeatures = features?.ok === true ? features.value : undefined;
  return {
    ok: true,
    value: {
      userIds: userIds.value,
      operation: body.operation,
      ...(role !== undefined ? { role: role as UserRole } : {}),
      ...(tier !== undefined ? { tier: tier as UserTier } : {}),
      ...(parsedFeatures !== undefined ? { features: parsedFeatures } : {}),
      reason: reason.value,
    },
  };
}

function parseAdminReasonBody(
  body: unknown,
): { ok: true; value: AdminReasonBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const reason = readRequiredString(body, "reason");
  if (reason.ok === false) return reason;
  return { ok: true, value: { reason: reason.value } };
}

function parseBulkAdminAccessCodesBody(
  body: unknown,
): { ok: true; value: BulkAdminAccessCodesBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const accessCodeIds = parseStringArray(body.accessCodeIds, "accessCodeIds");
  if (accessCodeIds.ok === false) return accessCodeIds;
  const reason = readRequiredString(body, "reason");
  if (reason.ok === false) return reason;
  if (
    body.operation !== "disable" &&
    body.operation !== "restore" &&
    body.operation !== "delete"
  ) {
    return { ok: false, error: "operation must be disable, restore, or delete" };
  }
  return {
    ok: true,
    value: {
      accessCodeIds: accessCodeIds.value,
      operation: body.operation,
      reason: reason.value,
    },
  };
}

function parseCreateAdminAccessCodeBatchBody(
  body: unknown,
):
  | { ok: true; value: CreateAdminAccessCodeBatchBody }
  | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return { ok: false, error: "name is required" };
  }
  if (
    typeof body.codeCount !== "number" ||
    !Number.isInteger(body.codeCount) ||
    body.codeCount < 1
  ) {
    return { ok: false, error: "codeCount must be a positive integer" };
  }
  if (
    typeof body.credits !== "number" ||
    !Number.isInteger(body.credits) ||
    body.credits <= 0
  ) {
    return { ok: false, error: "credits must be a positive integer" };
  }

  const features = parseCommercialFeatures(body.features);
  if (features.ok === false) {
    return features;
  }
  const tier = parseOptionalUserTier(body.tier);
  if (tier.ok === false) {
    return tier;
  }
  const source = parseOptionalString(body.source, "source");
  if (source.ok === false) {
    return source;
  }
  const expiresAt = parseOptionalString(body.expiresAt, "expiresAt");
  if (expiresAt.ok === false) {
    return expiresAt;
  }
  let entitlementDurationDays: number | undefined;
  if (body.entitlementDurationDays !== undefined) {
    if (
      typeof body.entitlementDurationDays !== "number" ||
      !Number.isInteger(body.entitlementDurationDays) ||
      body.entitlementDurationDays < 1
    ) {
      return {
        ok: false,
        error: "entitlementDurationDays must be a positive integer",
      };
    }
    entitlementDurationDays = body.entitlementDurationDays;
  }
  const notes = parseOptionalString(body.notes, "notes");
  if (notes.ok === false) {
    return notes;
  }
  let metadata: JsonObject | undefined;
  if (body.metadata !== undefined) {
    if (!isJsonObject(body.metadata)) {
      return { ok: false, error: "metadata must be an object" };
    }
    metadata = body.metadata;
  }

  return {
    ok: true,
    value: {
      name: body.name,
      source: source.value,
      codeCount: body.codeCount,
      credits: body.credits,
      tier: tier.value,
      features: features.value,
      expiresAt: expiresAt.value,
      entitlementDurationDays,
      notes: notes.value,
      metadata,
    },
  };
}

function parseDisableAdminAccessCodeBatchBody(
  body: unknown,
):
  | { ok: true; value: DisableAdminAccessCodeBatchBody }
  | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return { ok: false, error: "reason is required" };
  }

  return {
    ok: true,
    value: { reason: body.reason },
  };
}

function parseAdjustAdminUserCreditsBody(
  body: unknown,
):
  | { ok: true; value: AdjustAdminUserCreditsBody }
  | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (typeof body.amount !== "number" || !Number.isInteger(body.amount)) {
    return { ok: false, error: "amount must be an integer" };
  }
  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return { ok: false, error: "reason is required" };
  }
  if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) {
    return { ok: false, error: "idempotencyKey is required" };
  }
  let metadata: JsonObject | undefined;
  if (body.metadata !== undefined) {
    if (!isJsonObject(body.metadata)) {
      return { ok: false, error: "metadata must be an object" };
    }
    metadata = body.metadata;
  }

  return {
    ok: true,
    value: {
      amount: body.amount,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      metadata,
    },
  };
}

function parseUpdatePlatformModelsBody(
  body: unknown,
):
  | { ok: true; value: UpdatePlatformModelsBody }
  | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (!Array.isArray(body.enabledModelProfileIds)) {
    return { ok: false, error: "enabledModelProfileIds must be an array" };
  }
  const enabledModelProfileIds: string[] = [];
  for (const item of body.enabledModelProfileIds) {
    if (typeof item !== "string" || !item.trim()) {
      return { ok: false, error: "enabledModelProfileIds must contain strings" };
    }
    if (!enabledModelProfileIds.includes(item)) {
      enabledModelProfileIds.push(item);
    }
  }
  return {
    ok: true,
    value: { enabledModelProfileIds },
  };
}

function parseSaveAdminModelProviderBody(
  body: unknown,
): { ok: true; value: SaveAdminModelProviderBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (!isAdminPlatformProvider(body.provider)) {
    return { ok: false, error: "invalid provider" };
  }
  const displayName = readRequiredString(body, "displayName");
  if (displayName.ok === false) return displayName;
  const baseUrl = parseOptionalString(body.baseUrl, "baseUrl");
  if (baseUrl.ok === false) return baseUrl;
  const apiKey = parseOptionalString(body.apiKey, "apiKey");
  if (apiKey.ok === false) return apiKey;
  const providerConfigId = parseOptionalString(body.providerConfigId, "providerConfigId");
  if (providerConfigId.ok === false) return providerConfigId;
  if (
    body.status !== undefined &&
    body.status !== "active" &&
    body.status !== "disabled"
  ) {
    return { ok: false, error: "invalid status" };
  }

  return {
    ok: true,
    value: {
      provider: body.provider,
      displayName: displayName.value,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      status: body.status === "active" || body.status === "disabled" ? body.status : undefined,
      providerConfigId: providerConfigId.value,
    },
  };
}

function parseSaveAdminModelProfileBody(
  body: unknown,
  profileId?: string,
): { ok: true; value: SaveAdminModelProfileBody & { id: string } } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const rawId = profileId ?? body.id;
  if (typeof rawId !== "string" || !rawId.trim()) {
    return { ok: false, error: "id is required" };
  }
  const providerConfigId = readRequiredString(body, "providerConfigId");
  if (providerConfigId.ok === false) return providerConfigId;
  const label = readRequiredString(body, "label");
  if (label.ok === false) return label;
  const modelId = readRequiredString(body, "modelId");
  if (modelId.ok === false) return modelId;
  const providerLabel = parseOptionalString(body.providerLabel, "providerLabel");
  if (providerLabel.ok === false) return providerLabel;
  if (!isModelQuality(body.quality)) {
    return { ok: false, error: "invalid quality" };
  }
  if (typeof body.visibleToUser !== "boolean") {
    return { ok: false, error: "visibleToUser must be a boolean" };
  }
  if (!isPlatformModelProfileStatus(body.status)) {
    return { ok: false, error: "invalid status" };
  }
  const capabilities = parseOptionalJsonObject(body.capabilities, "capabilities");
  if (capabilities.ok === false) return capabilities;
  const limits = parseOptionalJsonObject(body.limits, "limits");
  if (limits.ok === false) return limits;

  return {
    ok: true,
    value: {
      id: rawId,
      providerConfigId: providerConfigId.value,
      label: label.value,
      providerLabel: providerLabel.value,
      modelId: modelId.value,
      quality: body.quality,
      visibleToUser: body.visibleToUser,
      status: body.status,
      capabilities: capabilities.value as Partial<ModelCapabilities> | undefined,
      limits: limits.value as Partial<ModelLimits> | undefined,
    },
  };
}

function parseTestAdminModelProfileBody(
  body: unknown,
): { ok: true; value: TestAdminModelProfileBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const providerConfigId = readRequiredString(body, "providerConfigId");
  if (providerConfigId.ok === false) return providerConfigId;
  const modelId = readRequiredString(body, "modelId");
  if (modelId.ok === false) return modelId;

  return {
    ok: true,
    value: {
      providerConfigId: providerConfigId.value,
      modelId: modelId.value,
    },
  };
}

function parseSaveModelProviderBody(
  body: unknown,
): { ok: true; value: SaveModelProviderBody } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const provider = readRequiredString(body, "provider");
  if (provider.ok === false) return provider;
  const displayName = readRequiredString(body, "displayName");
  if (displayName.ok === false) return displayName;
  const baseUrl = readRequiredString(body, "baseUrl");
  if (baseUrl.ok === false) return baseUrl;
  const apiKey = readRequiredString(body, "apiKey");
  if (apiKey.ok === false) return apiKey;
  const modelFast = parseOptionalString(body.modelFast, "modelFast");
  if (modelFast.ok === false) return modelFast;
  const modelBalanced = parseOptionalString(body.modelBalanced, "modelBalanced");
  if (modelBalanced.ok === false) return modelBalanced;
  const modelDeep = parseOptionalString(body.modelDeep, "modelDeep");
  if (modelDeep.ok === false) return modelDeep;

  return {
    ok: true,
    value: {
      provider: provider.value,
      displayName: displayName.value,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      modelFast: modelFast.value,
      modelBalanced: modelBalanced.value,
      modelDeep: modelDeep.value,
    },
  };
}

function readRequiredString(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${field} is required` };
  }
  return { ok: true, value };
}

function parseCreateTaskBody(
  body: unknown,
):
  | {
      ok: true;
      value: {
        userInput: UserInput;
        interactionMode?: InteractionMode;
        providerMode?: ProviderMode;
        modelSelection?: ModelSelection;
        priority?: number;
        queueWeight?: number;
        idempotencyKey: string;
      };
    }
  | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }
  const userInput = body.userInput;
  if (!isObject(userInput)) {
    return { ok: false, error: "用户输入 (userInput) 不能为空" };
  }
  const simulationTypeError = validateSimulationType(userInput);
  if (simulationTypeError !== undefined) {
    return { ok: false, error: simulationTypeError };
  }
  assertUserInputShape(userInput);
  const interactionMode = body.interactionMode;
  const providerMode = body.providerMode;
  const modelSelection = body.modelSelection;
  const priority = body.priority;
  const queueWeight = body.queueWeight;
  let parsedInteractionMode: InteractionMode | undefined;
  if (interactionMode !== undefined) {
    if (!isInteractionMode(interactionMode)) {
      return { ok: false, error: "invalid interactionMode" };
    }
    parsedInteractionMode = interactionMode;
  }
  let parsedProviderMode: ProviderMode | undefined;
  if (providerMode !== undefined) {
    if (!isProviderMode(providerMode)) {
      return { ok: false, error: "invalid providerMode" };
    }
    parsedProviderMode = providerMode;
  }
  if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) {
    return { ok: false, error: "idempotencyKey is required" };
  }
  const parsedModelSelection = validateModelSelection(modelSelection);
  if (parsedModelSelection.ok === false) {
    return { ok: false, error: parsedModelSelection.error };
  }
  let parsedPriority: number | undefined;
  if (priority !== undefined) {
    if (typeof priority !== "number" || !Number.isInteger(priority)) {
      return { ok: false, error: "priority must be an integer" };
    }
    parsedPriority = priority;
  }
  let parsedQueueWeight: number | undefined;
  if (queueWeight !== undefined) {
    if (
      typeof queueWeight !== "number" ||
      !Number.isInteger(queueWeight) ||
      queueWeight <= 0
    ) {
      return { ok: false, error: "queueWeight must be a positive integer" };
    }
    parsedQueueWeight = queueWeight;
  }

  const safety = assessUserInputSafety(userInput);
  if (!safety.ok) {
    return { ok: false, error: safety.message };
  }

  return {
    ok: true,
    value: {
      userInput,
      interactionMode: parsedInteractionMode,
      providerMode: parsedProviderMode,
      modelSelection: Object.keys(parsedModelSelection.value).length > 0
        ? parsedModelSelection.value
        : undefined,
      priority: parsedPriority,
      queueWeight: parsedQueueWeight,
      idempotencyKey: body.idempotencyKey,
    },
  };
}

function validateSimulationType(userInput: Record<string, unknown>): string | undefined {
  if (
    userInput.type !== "side_hustle" &&
    userInput.type !== "dating" &&
    userInput.type !== "life_choice"
  ) {
    return "invalid simulation type";
  }

  if (userInput.type === "side_hustle" && !userInput.projectIdea) {
    return "项目想法 (projectIdea) 不能为空";
  }
  if (userInput.type === "dating" && !userInput.chatLogOrIssue) {
    return "聊天记录或冲突内容 (chatLogOrIssue) 不能为空";
  }
  if (
    userInput.type === "life_choice" &&
    (!userInput.optionA || !userInput.optionB) &&
    (!Array.isArray(userInput.lifeChoiceOptions) ||
      userInput.lifeChoiceOptions.length < 2)
  ) {
    return "至少需要 2 个可比较的人生选择";
  }

  return undefined;
}

function assertUserInputShape(
  userInput: unknown,
): asserts userInput is UserInput {
  if (!isObject(userInput)) {
    throw new Error("用户输入 (userInput) 不能为空");
  }
  const error = validateSimulationType(userInput);
  if (error !== undefined) {
    throw new Error(error);
  }
}

function summarizeUserInput(userInput: UserInput): JsonObject {
  return {
    type: userInput.type,
    title: titleForUserInput(userInput),
  };
}

function titleForUserInput(userInput: UserInput): string {
  const valueByType: Record<SimulationType, string | undefined> = {
    side_hustle: userInput.projectIdea,
    dating: userInput.chatLogOrIssue,
    life_choice: userInput.decisionContext ?? userInput.optionA,
  };
  return (valueByType[userInput.type] ?? userInput.type).slice(0, 120);
}

function mapAuthError(
  error: unknown,
): CommercialApiResult<CommercialApiErrorBody> {
  if (error instanceof CommercialAuthError) {
    const status =
      error.code === "email_already_registered"
        ? 409
        : error.code === "invalid_credentials"
          ? 401
          : 400;
    return {
      status,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

function mapCreditError(
  error: unknown,
): CommercialApiResult<CommercialApiErrorBody> {
  if (error instanceof CreditServiceError) {
    const status =
      error.code === "insufficient_credits"
        ? 402
        : error.code === "access_code_not_found"
          ? 404
          : error.code === "access_code_not_redeemable" ||
              error.code === "idempotency_conflict"
            ? 409
            : 400;
    return {
      status,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

function mapTaskError(
  error: unknown,
): CommercialApiResult<CommercialApiErrorBody> {
  if (error instanceof CommercialTaskServiceError) {
    const status =
      error.code === "insufficient_credits"
        ? 402
        : error.code === "task_not_found"
          ? 404
          : error.code === "provider_not_allowed"
            ? 403
          : error.code === "active_task_exists" ||
              error.code === "invalid_task_transition"
            ? 409
            : 400;
    return {
      status,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof CreditServiceError) {
    return mapCreditError(error);
  }
  throw error;
}

function compareCommercialTasksForUserList(
  left: CommercialSimulationTaskRecord,
  right: CommercialSimulationTaskRecord,
): number {
  const leftTime = left.updatedAt || left.createdAt;
  const rightTime = right.updatedAt || right.createdAt;
  if (leftTime !== rightTime) {
    return rightTime.localeCompare(leftTime);
  }
  return right.id.localeCompare(left.id);
}

async function decorateTaskProgress(
  task: CommercialSimulationTaskRecord,
  repository: CommercialRepository,
): Promise<CommercialSimulationTaskStatusDto> {
  const stepRuns = await repository.listSimulationStepRunCosts(task.id);
  const latestProgressRun = findLatestProgressStepRun(stepRuns);
  const progressPercent = findMaxProgressPercent(stepRuns);
  const progressMessage = readProgressMessage(latestProgressRun?.metadata);

  return {
    ...task,
    displayTitle: getTaskDisplayTitle(task),
    ...(latestProgressRun && isSimulationProgressStep(latestProgressRun.stepName)
      ? { currentStepName: latestProgressRun.stepName }
      : {}),
    ...(typeof latestProgressRun?.stageIndex === "number"
      ? { currentStageIndex: latestProgressRun.stageIndex }
      : {}),
    progressPercent: progressPercent ?? getCommercialTaskProgressPercent(task.status),
    ...(progressMessage !== undefined ? { progressMessage } : {}),
    recoverable: isTaskResumable(task),
  };
}

function getTaskDisplayTitle(task: CommercialSimulationTaskRecord): string | undefined {
  const summaryTitle = typeof task.inputSummary?.title === "string"
    ? task.inputSummary.title
    : undefined;
  const title = summaryTitle ?? (task.userInput ? titleForUserInput(task.userInput) : undefined);
  const normalized = title?.trim();
  return normalized ? normalized.slice(0, 120) : undefined;
}

function isTaskResumable(task: CommercialSimulationTaskRecord): boolean {
  return (
    task.status === "queued" ||
    task.status === "recoverable_failed" ||
    (task.status === "cancelled" && task.userInput !== undefined)
  );
}

function findLatestProgressStepRun(
  runs: SimulationStepRunCostRecord[],
): SimulationStepRunCostRecord | undefined {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (
      isSimulationProgressStep(run.stepName) ||
      readProgressPercent(run.metadata) !== undefined ||
      readProgressMessage(run.metadata) !== undefined
    ) {
      return run;
    }
  }
  return undefined;
}

function findMaxProgressPercent(
  runs: SimulationStepRunCostRecord[],
): number | undefined {
  let maxProgress: number | undefined;
  for (const run of runs) {
    const progressPercent = readProgressPercent(run.metadata);
    if (
      progressPercent !== undefined &&
      (maxProgress === undefined || progressPercent > maxProgress)
    ) {
      maxProgress = progressPercent;
    }
  }
  return maxProgress;
}

function isSimulationProgressStep(value: string): value is SimulationProgressStep {
  return SIMULATION_PROGRESS_STEPS.has(value as SimulationProgressStep);
}

function readProgressPercent(metadata: JsonObject | undefined): number | undefined {
  const value = metadata?.progressPercent;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : undefined;
}

function readProgressMessage(metadata: JsonObject | undefined): string | undefined {
  const value = metadata?.progressMessage;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getCommercialTaskProgressPercent(
  status: CommercialSimulationTaskRecord["status"],
): number {
  switch (status) {
    case "queued":
      return 5;
    case "running":
      return 50;
    case "completed":
    case "failed":
    case "cancelled":
    case "refunded":
      return 100;
    default:
      return 0;
  }
}

function mapAdminError(
  error: unknown,
): CommercialApiResult<CommercialApiErrorBody> {
  if (error instanceof CommercialAdminServiceError) {
    const status =
      error.code === "user_not_found" ||
      error.code === "task_not_found" ||
      error.code === "report_not_found"
        ? 404
        : 400;
    return {
      status,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof AccessCodeServiceError) {
    const status =
      error.code === "access_code_not_found" ||
      error.code === "access_code_batch_not_found"
        ? 404
        : error.code === "access_code_not_redeemable"
          ? 409
          : 400;
    return {
      status,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof CreditServiceError) {
    return mapCreditError(error);
  }
  if (error instanceof AdminAuditServiceError) {
    return {
      status: 400,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

function mapModelProviderError(
  error: unknown,
): CommercialApiResult<CommercialApiErrorBody> {
  if (error instanceof ModelProviderServiceError) {
    const status =
      error.code === "provider_not_allowed"
        ? 403
        : error.code === "provider_not_found"
          ? 404
          : 400;
    return {
      status,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

function requireModelProviderService(
  deps: CommercialApiDeps,
): ModelProviderService | undefined {
  return deps.modelProviderService;
}

async function handleAdminUserStatusRequest(
  userId: string,
  request: CommercialApiRequest,
  deps: CommercialApiDeps,
  operation: "disable" | "restore",
): Promise<
  CommercialApiResult<
    { user: Awaited<ReturnType<CommercialAdminService["disableUser"]>> } | CommercialApiErrorBody
  >
> {
  const auth = await requireAdmin(request, deps);
  if (auth.ok === false) {
    return auth.result;
  }
  const parsed = parseAdminReasonBody(request.body);
  if (parsed.ok === false) {
    return badRequest(parsed.error, "invalid_admin_input");
  }

  try {
    const statusInput = {
      actorUserId: auth.user.id,
      userId,
      reason: parsed.value.reason,
      requestContext: getAdminRequestContext(request),
    };
    return {
      status: 200,
      body: {
        user: operation === "disable"
          ? await deps.adminService.disableUser(statusInput)
          : await deps.adminService.restoreUser(statusInput),
      },
    };
  } catch (error) {
    return mapAdminError(error);
  }
}

function badRequest(
  error: string,
  code: string,
): CommercialApiResult<CommercialApiErrorBody> {
  return {
    status: 400,
    body: { error, code },
  };
}

function unauthorized(): CommercialApiResult<CommercialApiErrorBody> {
  return {
    status: 401,
    body: {
      error: "Authentication required",
      code: "authentication_required",
    },
  };
}

function forbidden(): CommercialApiResult<CommercialApiErrorBody> {
  return {
    status: 403,
    body: {
      error: "Admin privileges required",
      code: "admin_required",
    },
  };
}

function notFound(
  error: string,
  code: string,
): CommercialApiResult<CommercialApiErrorBody> {
  return {
    status: 404,
    body: { error, code },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value);
}

function parseCommercialFeatures(
  value: unknown,
):
  | { ok: true; value: CommercialFeature[] }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: "features must be an array" };
  }
  const features: CommercialFeature[] = [];
  for (const item of value) {
    if (!isCommercialFeature(item)) {
      return { ok: false, error: "features contains an unknown feature" };
    }
    features.push(item);
  }
  return { ok: true, value: features };
}

function parseOptionalUserTier(
  value: unknown,
):
  | { ok: true; value?: UserTier }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (!isUserTier(value)) {
    return { ok: false, error: "invalid tier" };
  }
  return { ok: true, value };
}

function parseOptionalUserRole(
  value: unknown,
):
  | { ok: true; value?: UserRole }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (!isUserRole(value)) {
    return { ok: false, error: "invalid role" };
  }
  return { ok: true, value };
}

function parseStringArray(
  value: unknown,
  label: string,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} must be an array` };
  }
  const parsed: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      return { ok: false, error: `${label} must contain strings` };
    }
    parsed.push(item);
  }
  return { ok: true, value: parsed };
}

function parseOptionalJsonObject(
  value: unknown,
  label: string,
): { ok: true; value?: JsonObject } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (!isJsonObject(value)) {
    return { ok: false, error: `${label} must be an object` };
  }
  return { ok: true, value };
}

function parseOptionalString(
  value: unknown,
  label: string,
):
  | { ok: true; value?: string }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be a string` };
  }
  return { ok: true, value };
}

function getAdminRequestContext(
  request: CommercialApiRequest,
): { ipHash?: string; userAgent?: string } {
  const ipHash =
    request.headers?.["x-ip-hash"] ?? request.headers?.["X-IP-Hash"];
  const userAgent =
    request.headers?.["user-agent"] ?? request.headers?.["User-Agent"];
  return {
    ...(typeof ipHash === "string" && ipHash.trim()
      ? { ipHash: ipHash.trim() }
      : {}),
    ...(typeof userAgent === "string" && userAgent.trim()
      ? { userAgent: userAgent.trim() }
      : {}),
  };
}

function isInteractionMode(value: unknown): value is InteractionMode {
  return value === "legacy" || value === "enabled";
}

function isProviderMode(value: unknown): value is ProviderMode {
  return value === "platform" || value === "byok";
}

function isCommercialFeature(value: unknown): value is CommercialFeature {
  return COMMERCIAL_FEATURES.includes(value as CommercialFeature);
}

function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

function isUserTier(value: unknown): value is UserTier {
  return USER_TIERS.includes(value as UserTier);
}

function isAdminPlatformProvider(value: unknown): value is SaveAdminModelProviderBody["provider"] {
  return value === "gemini" || value === "anthropic" || value === "openai_compatible";
}

function isModelQuality(value: unknown): value is ModelQuality {
  return value === "fast" || value === "balanced" || value === "deep";
}

function isPlatformModelProfileStatus(
  value: unknown,
): value is SaveAdminModelProfileBody["status"] {
  return value === "active" || value === "disabled" || value === "deprecated";
}
