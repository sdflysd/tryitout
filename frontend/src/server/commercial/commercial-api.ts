import { randomUUID } from "node:crypto";

import type { CommercialAuthService, PublicCommercialUser } from "./auth-service.js";
import { CommercialAuthServiceError } from "./auth-service.js";
import type { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { CommercialSimulationTaskServiceError } from "./commercial-task-service.js";
import { CreditServiceError, type CreditService } from "./credit-service.js";
import type { CommercialRepository } from "./repository.js";
import type { CommercialProviderMode } from "../../contracts/commercial.js";
import type { InteractionMode, SimulationType } from "../../types.js";

export interface CommercialApiServices {
  repository: CommercialRepository;
  authService: CommercialAuthService;
  creditService: CreditService;
  taskService: CommercialSimulationTaskService;
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
  if (error instanceof CreditServiceError) {
    return { status: 400, body: { error: error.code } };
  }
  if (error instanceof CommercialSimulationTaskServiceError) {
    const status = error.code === "task_not_found" ? 404 : error.code === "active_task_exists" ? 409 : 400;
    return { status, body: { error: error.code } };
  }
  return { status: 500, body: { error: `internal_error_${randomUUID().slice(0, 8)}` } };
}
