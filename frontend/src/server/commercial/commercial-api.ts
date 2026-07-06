import { randomUUID } from "node:crypto";

import type { CommercialAdminService } from "./admin-service.js";
import { CommercialAdminServiceError } from "./admin-service.js";
import type { AnalyticsService } from "./analytics-service.js";
import type { CommercialAuthService, PublicCommercialUser } from "./auth-service.js";
import { CommercialAuthServiceError } from "./auth-service.js";
import type { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { CommercialSimulationTaskServiceError } from "./commercial-task-service.js";
import { CreditServiceError, type CreditService } from "./credit-service.js";
import { FeedbackServiceError, type FeedbackService } from "./feedback-service.js";
import type { ModelProviderService } from "./model-provider-service.js";
import type { CommercialRepository } from "./repository.js";
import type { CommercialFeature, CommercialProviderMode, UserTier } from "../../contracts/commercial.js";
import type { InteractionMode, SimulationType } from "../../types.js";

export interface CommercialApiServices {
  repository: CommercialRepository;
  authService: CommercialAuthService;
  creditService: CreditService;
  taskService: CommercialSimulationTaskService;
  adminService?: CommercialAdminService;
  analyticsService?: AnalyticsService;
  feedbackService?: FeedbackService;
  modelProviderService?: ModelProviderService;
}

export interface CommercialApiOptions {
  secureCookies?: boolean;
  now?: () => Date;
}

export interface CommercialApiRequest {
  body?: unknown;
  params?: Record<string, string | undefined>;
  sessionToken?: string;
}

export interface CommercialApiCookie {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: "lax" | "strict";
  secure: boolean;
  path: string;
  maxAge?: number;
  expires?: Date;
}

export interface CommercialApiResponse<TBody = unknown> {
  status: number;
  body: TBody;
  cookies?: CommercialApiCookie[];
}

const SESSION_COOKIE_NAME = "tio_session";

export function createCommercialApiHandlers(
  services: CommercialApiServices,
  options: CommercialApiOptions = {},
) {
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === "production";

  async function requireUser(request: CommercialApiRequest): Promise<PublicCommercialUser | CommercialApiResponse> {
    if (!request.sessionToken) {
      return { status: 401, body: { error: "auth_required" } };
    }
    const user = await services.authService.getUserForSessionToken(request.sessionToken);
    if (!user) {
      return { status: 401, body: { error: "auth_required" } };
    }
    return user;
  }

  async function requireAdminUser(
    request: CommercialApiRequest,
  ): Promise<PublicCommercialUser | CommercialApiResponse> {
    const user = await requireUser(request);
    if (isApiResponse(user)) {
      return user;
    }
    if (!user.isAdmin || !services.adminService) {
      return { status: 403, body: { error: "admin_required" } };
    }
    return user;
  }

  return {
    async register(request: CommercialApiRequest): Promise<CommercialApiResponse<{ user?: PublicCommercialUser; error?: string }>> {
      const body = request.body as { email?: string; password?: string };
      try {
        const result = await services.authService.register({
          email: String(body?.email ?? ""),
          password: String(body?.password ?? ""),
        });
        return { status: 201, body: { user: result.user } };
      } catch (error) {
        return mapError(error);
      }
    },

    async login(
      request: CommercialApiRequest,
    ): Promise<CommercialApiResponse<{ user?: PublicCommercialUser; error?: string }>> {
      const body = request.body as { email?: string; password?: string };
      try {
        const result = await services.authService.login({
          email: String(body?.email ?? ""),
          password: String(body?.password ?? ""),
        });
        return {
          status: 200,
          body: { user: result.user },
          cookies: [createSessionCookie(result.sessionToken, secureCookies)],
        };
      } catch (error) {
        return mapError(error);
      }
    },

    async logout(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      if (request.sessionToken) {
        await services.authService.logout(request.sessionToken);
      }
      return {
        status: 204,
        body: {},
        cookies: [clearSessionCookie(secureCookies)],
      };
    },

    async me(request: CommercialApiRequest): Promise<CommercialApiResponse<{ user?: PublicCommercialUser; error?: string }>> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      return { status: 200, body: { user } };
    },

    async redeemAccessCode(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      const body = request.body as { code?: string };
      try {
        const result = await services.creditService.redeemAccessCode({
          userId: user.id,
          code: String(body?.code ?? ""),
          idempotencyKey: `redeem:${user.id}:${String(body?.code ?? "").trim().toUpperCase()}`,
        });
        return { status: 200, body: { balance: result.balance } };
      } catch (error) {
        return mapError(error);
      }
    },

    async getCredits(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      const account = await services.repository.getCreditAccount(user.id);
      return { status: 200, body: { balance: account?.balance ?? 0 } };
    },

    async createTask(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      const body = request.body as {
        scenario?: SimulationType;
        userInput?: string;
        interactionMode?: InteractionMode;
        providerMode?: CommercialProviderMode;
      };
      try {
        const result = await services.taskService.createTask({
          userId: user.id,
          scenario: body?.scenario ?? "side_hustle",
          userInput: String(body?.userInput ?? ""),
          interactionMode: body?.interactionMode ?? "legacy",
          providerMode: body?.providerMode ?? "platform",
        });
        return { status: 202, body: result };
      } catch (error) {
        return mapError(error);
      }
    },

    async getTaskStatus(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      try {
        return {
          status: 200,
          body: await services.taskService.getStatus(requireParam(request, "taskId"), user.id),
        };
      } catch (error) {
        return mapError(error);
      }
    },

    async getTaskReport(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      try {
        const report = await services.taskService.getReport(requireParam(request, "taskId"), user.id);
        if (!report) {
          return { status: 404, body: { error: "report_not_found" } };
        }
        return { status: 200, body: { report } };
      } catch (error) {
        return mapError(error);
      }
    },

    async cancelTask(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      try {
        return {
          status: 200,
          body: await services.taskService.cancelTask(requireParam(request, "taskId"), user.id),
        };
      } catch (error) {
        return mapError(error);
      }
    },

    async handleReportFeedbackRequest(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const user = await requireUser(request);
      if (isApiResponse(user)) {
        return user;
      }
      if (!services.feedbackService) {
        return { status: 503, body: { error: "feedback_unavailable" } };
      }
      const body = request.body as {
        taskId?: string;
        reportId?: string;
        rating?: number;
        useful?: boolean;
        text?: string;
      };
      try {
        const feedback = await services.feedbackService.submitFeedback({
          userId: user.id,
          taskId: String(body?.taskId ?? ""),
          reportId: String(body?.reportId ?? ""),
          rating: Number(body?.rating),
          useful: body?.useful === true,
          text: body?.text,
        });
        return { status: 201, body: { feedback } };
      } catch (error) {
        return mapError(error);
      }
    },

    async createAdminAccessCode(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const admin = await requireAdminUser(request);
      if (isApiResponse(admin)) {
        return admin;
      }
      const body = request.body as {
        creditAmount?: number;
        tier?: UserTier;
        features?: CommercialFeature[];
        expiresAt?: string;
      };
      try {
        const accessCode = await services.adminService!.createAccessCode({
          adminUserId: admin.id,
          creditAmount: Number(body?.creditAmount ?? 0),
          tier: body?.tier ?? "basic",
          features: Array.isArray(body?.features) ? body.features : [],
          expiresAt: body?.expiresAt ? new Date(body.expiresAt) : undefined,
        });
        return { status: 201, body: { accessCode } };
      } catch (error) {
        return mapError(error);
      }
    },

    async createAdminAccessCodeBatch(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const admin = await requireAdminUser(request);
      if (isApiResponse(admin)) {
        return admin;
      }
      const body = request.body as {
        count?: number;
        creditAmount?: number;
        tier?: UserTier;
        features?: CommercialFeature[];
        expiresAt?: string;
      };
      try {
        const accessCodes = await services.adminService!.createAccessCodeBatch({
          adminUserId: admin.id,
          count: Number(body?.count ?? 0),
          creditAmount: Number(body?.creditAmount ?? 0),
          tier: body?.tier ?? "basic",
          features: Array.isArray(body?.features) ? body.features : [],
          expiresAt: body?.expiresAt ? new Date(body.expiresAt) : undefined,
        });
        return { status: 201, body: { accessCodes } };
      } catch (error) {
        return mapError(error);
      }
    },

    async disableAdminAccessCode(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const admin = await requireAdminUser(request);
      if (isApiResponse(admin)) {
        return admin;
      }
      const body = request.body as { reason?: string };
      try {
        await services.adminService!.disableAccessCode({
          adminUserId: admin.id,
          accessCodeId: requireParam(request, "accessCodeId"),
          reason: String(body?.reason ?? ""),
        });
        return { status: 200, body: { ok: true } };
      } catch (error) {
        return mapError(error);
      }
    },

    async adjustAdminCredits(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const admin = await requireAdminUser(request);
      if (isApiResponse(admin)) {
        return admin;
      }
      const body = request.body as {
        userId?: string;
        amount?: number;
        reason?: string;
      };
      try {
        const ledgerEntry = await services.adminService!.adjustUserCredits({
          adminUserId: admin.id,
          userId: String(body?.userId ?? ""),
          amount: Number(body?.amount ?? 0),
          reason: String(body?.reason ?? ""),
        });
        return {
          status: 200,
          body: {
            balance: ledgerEntry.balanceAfter,
            ledgerEntryId: ledgerEntry.id,
          },
        };
      } catch (error) {
        return mapError(error);
      }
    },

    async listAdminAuditLogs(request: CommercialApiRequest): Promise<CommercialApiResponse> {
      const admin = await requireAdminUser(request);
      if (isApiResponse(admin)) {
        return admin;
      }
      const auditLogs = await services.repository.listAdminAuditLogs();
      return { status: 200, body: { auditLogs } };
    },
  };
}

function createSessionCookie(value: string, secure: boolean): CommercialApiCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  };
}

function clearSessionCookie(secure: boolean): CommercialApiCookie {
  return {
    ...createSessionCookie("", secure),
    maxAge: 0,
    expires: new Date(0),
  };
}

function isApiResponse(value: unknown): value is CommercialApiResponse {
  return typeof value === "object" && value !== null && "status" in value && "body" in value;
}

function requireParam(request: CommercialApiRequest, key: string): string {
  const value = request.params?.[key];
  if (!value) {
    throw new CommercialSimulationTaskServiceError("missing_param", `Missing ${key}.`);
  }
  return value;
}

function mapError(error: unknown): CommercialApiResponse<{ error: string }> {
  if (error instanceof CreditServiceError && error.code === "insufficient_credits") {
    return { status: 402, body: { error: error.code } };
  }
  if (error instanceof CommercialAuthServiceError) {
    return { status: error.code === "email_already_registered" ? 409 : 401, body: { error: error.code } };
  }
  if (error instanceof CommercialAdminServiceError) {
    const status = error.code === "admin_required"
      ? 403
      : error.code.endsWith("_not_found")
        ? 404
        : 400;
    return { status, body: { error: error.code } };
  }
  if (error instanceof FeedbackServiceError) {
    const status = error.code.endsWith("_not_found") ? 404 : 400;
    return { status, body: { error: error.code } };
  }
  if (error instanceof CreditServiceError) {
    return { status: 400, body: { error: error.code } };
  }
  if (error instanceof CommercialSimulationTaskServiceError) {
    const status = error.code === "task_not_found" ? 404 : error.code === "active_task_exists" ? 409 : 400;
    return { status, body: { error: error.code } };
  }
  return { status: 500, body: { error: `internal_error_${randomUUID().slice(0, 8)}` } };
}
