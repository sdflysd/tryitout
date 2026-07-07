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
import type { CommercialRepository } from "./repository.js";
import type {
  CommercialSimulationReportRecord,
  CommercialSimulationTaskRecord,
  JsonObject,
  UserCreditAccountRecord,
} from "./types.js";
import { assessUserInputSafety } from "../simulations/safety.js";
import type {
  InteractionMode,
  SimulationType,
  UserInput,
} from "../../types.js";
import type { ProviderMode } from "../../contracts/commercial.js";

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
  authService: CommercialAuthService;
  creditService: CreditService;
  repository: CommercialRepository;
  taskService: CommercialTaskService;
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

    return {
      status: 200,
      body: {
        account: result.account,
        ledger: result.ledger,
        redemption: result.redemption,
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
    const result = await deps.taskService.createTask({
      userId: auth.user.id,
      userInput: parsed.value.userInput,
      interactionMode: parsed.value.interactionMode,
      providerMode: parsed.value.providerMode,
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
): Promise<CommercialApiResult<{ task: CommercialSimulationTaskRecord } | CommercialApiErrorBody>> {
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
      body: { task },
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

function parseCreateTaskBody(
  body: unknown,
):
  | {
      ok: true;
      value: {
        userInput: UserInput;
        interactionMode?: InteractionMode;
        providerMode?: ProviderMode;
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

function isInteractionMode(value: unknown): value is InteractionMode {
  return value === "legacy" || value === "enabled";
}

function isProviderMode(value: unknown): value is ProviderMode {
  return value === "platform" || value === "byok";
}
