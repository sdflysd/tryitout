import assert from "node:assert/strict";
import test from "node:test";

import { AccessCodeService } from "./access-code-service.js";
import { AdminAuditService } from "./audit-service.js";
import { hashAccessCode } from "./access-code-secrets.js";
import { CommercialAdminService } from "./admin-service.js";
import { CommercialAuthService } from "./auth-service.js";
import {
  COMMERCIAL_SESSION_COOKIE_NAME,
  handleAdjustAdminUserCreditsRequest,
  handleCancelCommercialTaskRequest,
  handleCreateAdminAccessCodeBatchRequest,
  handleCreateCommercialTaskRequest,
  handleDisableAdminAccessCodeBatchRequest,
  handleGetAdminOverviewRequest,
  handleGetCommercialTaskReportRequest,
  handleGetCommercialTaskStatusRequest,
  handleGetCreditsRequest,
  handleGetMeRequest,
  handleDeleteModelProviderRequest,
  handleGetModelProviderRequest,
  handleListAdminAuditLogsRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRedeemAccessCodeRequest,
  handleRegisterRequest,
  handleSaveModelProviderRequest,
  handleTestModelProviderRequest,
} from "./commercial-api.js";
import { CommercialTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { ModelProviderService } from "./model-provider-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { InMemorySimulationQueue } from "./simulation-queue.js";
import type { CommercialRepository } from "./repository.js";
import type {
  AccessCodeBatchRecord,
  AccessCodeRecord,
  CommercialSimulationTaskRecord,
} from "./types.js";
import type {
  Report,
  SimulationApiResponse,
  UserInput,
} from "../../types.js";

const ACCESS_CODE_PEPPER = "commercial-api-pepper";
const SESSION_SECRET = "commercial-api-session-secret-with-at-least-32-chars";
const CREATED_AT = "2026-07-07T00:00:00.000Z";
const RAW_ACCESS_CODE = "TIO-ABCD-EFGH-JKLM";
const RAW_ADMIN_CODES = [
  "TIO-ABCD-EFGH-JK23",
  "TIO-ABCD-EFGH-JK24",
  "TIO-ABCD-EFGH-JK25",
];
const MODEL_PROVIDER_KEY = Buffer.alloc(32, 8);

test("register creates a user DTO without returning password hash", async () => {
  const deps = makeDeps();

  const result = await handleRegisterRequest(
    {
      email: " User@Example.TEST ",
      password: "commercial-secret",
    },
    deps,
  );

  assert.equal(result.status, 201);
  assert.equal("user" in result.body, true);
  if (!("user" in result.body)) return;
  assert.equal(result.body.user.emailNormalized, "user@example.test");
  assert.equal("passwordHash" in result.body.user, false);
  assert.equal((await deps.repository.getCreditAccount(result.body.user.id))?.balance, 0);
});

test("login returns a secure session cookie descriptor without password hash", async () => {
  const deps = makeDeps();
  await registerUser(deps);

  const result = await handleLoginRequest(
    {
      email: "user@example.test",
      password: "commercial-secret",
    },
    deps,
    { production: true },
  );

  assert.equal(result.status, 200);
  assert.equal("user" in result.body, true);
  if (!("user" in result.body)) return;
  assert.equal("passwordHash" in result.body.user, false);
  assert.deepEqual(result.cookies, [
    {
      name: COMMERCIAL_SESSION_COOKIE_NAME,
      value: "session-token-1",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 2_592_000_000,
      },
    },
  ]);
});

test("logout revokes session and clears the session cookie", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);

  const logout = await handleLogoutRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );
  const me = await handleGetMeRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(logout.status, 200);
  assert.deepEqual(logout.body, { ok: true });
  assert.equal(logout.cookies?.[0]?.name, COMMERCIAL_SESSION_COOKIE_NAME);
  assert.equal(logout.cookies?.[0]?.value, "");
  assert.equal(logout.cookies?.[0]?.options.maxAge, 0);
  assert.equal(me.status, 401);
});

test("GET /api/me requires a session and returns the current user", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);

  const missing = await handleGetMeRequest(request(), deps);
  const result = await handleGetMeRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(missing.status, 401);
  assert.equal(result.status, 200);
  assert.equal("user" in result.body, true);
  if (!("user" in result.body)) return;
  assert.equal(result.body.user.email, "user@example.test");
  assert.equal("passwordHash" in result.body.user, false);
});

test("redeem access code requires auth and applies credits through the ledger", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedAccessCode(deps.repository);

  const missing = await handleRedeemAccessCodeRequest(
    request({ body: { code: RAW_ACCESS_CODE, idempotencyKey: "redeem_1" } }),
    deps,
  );
  const redeemed = await handleRedeemAccessCodeRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: { code: RAW_ACCESS_CODE, idempotencyKey: "redeem_1" },
    }),
    deps,
  );

  assert.equal(missing.status, 401);
  assert.equal(redeemed.status, 200);
  assert.equal("account" in redeemed.body, true);
  if (!("account" in redeemed.body)) return;
  assert.equal(redeemed.body.account.balance, 9);
  assert.equal(redeemed.body.ledger.entryType, "redeem");
  assert.equal(redeemed.body.redemption.credits, 9);
  assert.equal("codeHash" in redeemed.body, false);
  assert.equal("rawCode" in redeemed.body, false);
});

test("credits endpoint requires auth and returns the account balance", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);

  const missing = await handleGetCreditsRequest(request(), deps);
  const result = await handleGetCreditsRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(missing.status, 401);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    account: {
      userId: "user_1",
      balance: 0,
      frozenCredits: 0,
      totalRedeemed: 0,
      totalCaptured: 0,
      updatedAt: CREATED_AT,
    },
  });
});

test("commercial task creation rejects insufficient credits", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);

  const result = await handleCreateCommercialTaskRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: {
        userInput: makeUserInput(),
        interactionMode: "enabled",
        idempotencyKey: "task-key-1",
      },
    }),
    deps,
  );

  assert.equal(result.status, 402);
  assert.deepEqual(result.body, {
    error: "Available credit balance is insufficient",
    code: "insufficient_credits",
  });
});

test("commercial task creation holds credits and returns task status", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);

  const created = await handleCreateCommercialTaskRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: {
        userInput: makeUserInput(),
        interactionMode: "enabled",
        idempotencyKey: "task-key-1",
        priority: 7,
      },
    }),
    deps,
  );

  assert.equal(created.status, 202);
  assert.equal("task" in created.body, true);
  if (!("task" in created.body)) return;
  assert.equal(created.body.task.status, "queued");
  assert.equal(created.body.task.creditCost, 3);
  assert.equal(created.body.account.balance, 6);
  assert.equal(created.body.account.frozenCredits, 3);

  const status = await handleGetCommercialTaskStatusRequest(
    created.body.task.id,
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(status.status, 200);
  assert.equal("task" in status.body, true);
  if (!("task" in status.body)) return;
  assert.equal(status.body.task.id, created.body.task.id);
  assert.equal(status.body.task.userId, "user_1");
});

test("task report is returned only to the task owner after completion", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  const task = await createPaidTask(deps, sessionToken);
  await deps.taskService.markRunning({ taskId: task.id });
  await deps.taskService.markCompleted({
    taskId: task.id,
    publicReport: makePublicReport(task.id),
    deepReport: makeDeepReport(),
    shareCard: { title: "Share" },
  });

  const result = await handleGetCommercialTaskReportRequest(
    task.id,
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.equal("report" in result.body, true);
  if (!("report" in result.body)) return;
  assert.equal(result.body.report.taskId, task.id);
  assert.equal(result.body.report.publicReport?.id, task.id);
});

test("cancel task requires auth and releases held credits", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  const task = await createPaidTask(deps, sessionToken);

  const missing = await handleCancelCommercialTaskRequest(task.id, request(), deps);
  const result = await handleCancelCommercialTaskRequest(
    task.id,
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(missing.status, 401);
  assert.equal(result.status, 200);
  assert.equal("task" in result.body, true);
  if (!("task" in result.body)) return;
  assert.equal(result.body.task.status, "cancelled");
  assert.equal(result.body.account?.balance, 9);
  assert.equal(result.body.account?.frozenCredits, 0);
});

test("admin overview rejects non-admin sessions and returns operating metrics to admins", async () => {
  const deps = makeDeps();
  const userSession = await loginUser(deps);
  const adminSession = await loginAdmin(deps);

  const forbidden = await handleGetAdminOverviewRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: userSession } }),
    deps,
  );
  const overview = await handleGetAdminOverviewRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession } }),
    deps,
  );

  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.body, {
    error: "Admin privileges required",
    code: "admin_required",
  });
  assert.equal(overview.status, 200);
  assert.equal("overview" in overview.body, true);
  if (!("overview" in overview.body)) return;
  assert.equal(overview.body.overview.users.total, 2);
  assert.equal(overview.body.overview.users.active, 2);
  assert.equal(overview.body.overview.credits.totalBalance, 0);
});

test("admin can create a single copyable access code without exposing stored hashes", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);

  const result = await handleCreateAdminAccessCodeBatchRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession },
      body: {
        name: "VIP recovery",
        codeCount: 1,
        credits: 20,
        tier: "pro",
        features: ["priority_queue"],
        metadata: { channel: "manual" },
      },
    }),
    deps,
  );

  assert.equal(result.status, 201);
  assert.equal("batch" in result.body, true);
  if (!("batch" in result.body)) return;
  assert.equal(result.body.batch.createdByUserId, "user_1");
  assert.deepEqual(result.body.codes.map((code) => code.rawCode), [RAW_ADMIN_CODES[0]]);
  assert.equal(result.body.codes[0]?.codeMask, "TIO-****-****-JK23");
  assert.equal("codeHash" in result.body.codes[0]!, false);
  assert.equal(JSON.stringify(await deps.repository.listAccessCodes()).includes(RAW_ADMIN_CODES[0]), false);
});

test("admin can create and disable access-code batches", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);

  const created = await handleCreateAdminAccessCodeBatchRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession },
      body: {
        name: "Launch partners",
        source: "sales",
        codeCount: 2,
        credits: 12,
        features: ["deep_mode", "priority_queue"],
        expiresAt: "2026-08-01T00:00:00.000Z",
        notes: "Q3 signed customers",
      },
    }),
    deps,
  );
  assert.equal(created.status, 201);
  assert.equal("batch" in created.body, true);
  if (!("batch" in created.body)) return;

  const disabled = await handleDisableAdminAccessCodeBatchRequest(
    created.body.batch.id,
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession },
      body: { reason: "campaign ended" },
    }),
    deps,
  );

  assert.equal(created.body.codes.length, 2);
  assert.deepEqual(
    created.body.codes.map((code) => code.rawCode),
    RAW_ADMIN_CODES.slice(0, 2),
  );
  assert.equal(disabled.status, 200);
  assert.deepEqual(disabled.body, {
    batch: {
      ...created.body.batch,
      disabledAt: "2026-07-07T00:06:00.000Z",
    },
    disabledCodeCount: 2,
  });
  assert.deepEqual(
    (await deps.repository.listAccessCodes()).map((code) => code.status),
    ["disabled", "disabled"],
  );
});

test("admin can adjust user credits and list resulting audit logs", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  await registerUser(deps, "customer@example.test");
  const customer = await deps.repository.findUserByEmail("customer@example.test");
  assert.ok(customer);

  const adjusted = await handleAdjustAdminUserCreditsRequest(
    customer.id,
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession },
      body: {
        amount: 15,
        reason: "offline_invoice_paid",
        idempotencyKey: "adjust_customer_invoice_1",
        metadata: { invoiceId: "INV-1001" },
      },
    }),
    deps,
  );
  const auditLogs = await handleListAdminAuditLogsRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession } }),
    deps,
  );

  assert.equal(adjusted.status, 200);
  assert.equal("account" in adjusted.body, true);
  if (!("account" in adjusted.body)) return;
  assert.equal(adjusted.body.account.balance, 15);
  assert.equal(adjusted.body.ledger.entryType, "adjustment");
  assert.equal(auditLogs.status, 200);
  assert.equal("auditLogs" in auditLogs.body, true);
  if (!("auditLogs" in auditLogs.body)) return;
  assert.deepEqual(
    auditLogs.body.auditLogs.map((log) => ({
      action: log.action,
      actorUserId: log.actorUserId,
      targetId: log.targetId,
      metadata: log.metadata,
    })),
    [
      {
        action: "credits_adjusted",
        actorUserId: "user_1",
        targetId: customer.id,
        metadata: {
          amount: 15,
          creditLedgerId: "credit_ledger_1",
          reason: "offline_invoice_paid",
          invoiceId: "INV-1001",
        },
      },
    ],
  );
});

test("user model provider endpoints save, mask, test, and delete BYOK configuration", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  const user = await deps.repository.findUserByEmail("user@example.test");
  assert.ok(user);
  await deps.repository.saveUser({
    ...user,
    tier: "pro",
    features: ["custom_model_provider"],
  });

  const saved = await handleSaveModelProviderRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: {
        provider: "openai",
        displayName: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-live-secret123456",
      },
    }),
    deps,
  );
  const fetched = await handleGetModelProviderRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );
  const tested = await handleTestModelProviderRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );
  const deleted = await handleDeleteModelProviderRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(saved.status, 200);
  assert.equal("provider" in saved.body, true);
  if (!("provider" in saved.body)) return;
  assert.equal(saved.body.provider.apiKeyMask, "sk-liv...3456");
  assert.equal(JSON.stringify(saved.body).includes("encryptedApiKey"), false);
  assert.equal(
    JSON.stringify(await deps.repository.listUserModelProviders(user.id)).includes("sk-live-secret123456"),
    false,
  );
  assert.deepEqual(fetched.body, { provider: saved.body.provider });
  assert.equal(tested.status, 200);
  assert.equal("provider" in tested.body, true);
  if (!("provider" in tested.body)) return;
  assert.equal(tested.body.provider.lastTestStatus, "passed");
  assert.equal(deleted.status, 200);
  assert.equal("provider" in deleted.body, true);
  if (!("provider" in deleted.body)) return;
  assert.equal(deleted.body.provider.status, "disabled");
});

function makeDeps() {
  const repository = new InMemoryCommercialRepository();
  const ids = new TestIds();
  const clock = new TestClock([
    CREATED_AT,
    "2026-07-07T00:01:00.000Z",
    "2026-07-07T00:02:00.000Z",
    "2026-07-07T00:03:00.000Z",
    "2026-07-07T00:04:00.000Z",
    "2026-07-07T00:05:00.000Z",
    "2026-07-07T00:06:00.000Z",
    "2026-07-07T00:07:00.000Z",
    "2026-07-07T00:08:00.000Z",
    "2026-07-07T00:09:00.000Z",
    "2026-07-07T00:10:00.000Z",
  ]);
  const createId = (prefix = "id") => ids.create(prefix);
  const now = () => clock.next();
  const creditService = new CreditService({
    repository,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId,
    hashAccessCode,
    now,
  });
  const taskService = new CommercialTaskService({
    repository,
    creditService,
    queue: new InMemorySimulationQueue({ maxActiveWeight: 6 }),
    createId,
    now,
  });
  const authService = new CommercialAuthService({
    repository,
    sessionSecret: SESSION_SECRET,
    createId,
    createSessionToken: () => `session-token-${ids.next("session_token")}`,
    now,
  });
  const accessCodeService = new AccessCodeService({
    repository,
    accessCodePepper: ACCESS_CODE_PEPPER,
    createId,
    generateAccessCode: () => RAW_ADMIN_CODES[ids.next("raw_code") - 1]!,
    hashAccessCode,
    now,
  });
  const auditService = new AdminAuditService({
    repository,
    createId,
    now,
  });
  const adminService = new CommercialAdminService({
    repository,
    accessCodeService,
    creditService,
    auditService,
    now,
  });
  const modelProviderService = new ModelProviderService({
    repository,
    encryptionKey: MODEL_PROVIDER_KEY,
    createId,
    now,
    resolveHostname: async () => ["172.64.154.211"],
    testProviderConnection: async () => ({ ok: true }),
  });

  return {
    adminService,
    authService,
    creditService,
    modelProviderService,
    repository,
    taskService,
  };
}

async function registerUser(
  deps: ReturnType<typeof makeDeps>,
  email = "user@example.test",
): Promise<void> {
  const result = await handleRegisterRequest(
    { email, password: "commercial-secret" },
    deps,
  );
  assert.equal(result.status, 201);
}

async function loginUser(deps: ReturnType<typeof makeDeps>): Promise<string> {
  await registerUser(deps);
  const login = await handleLoginRequest(
    { email: "user@example.test", password: "commercial-secret" },
    deps,
  );
  assert.equal(login.status, 200);
  assert.ok(login.cookies?.[0]);
  return login.cookies[0].value;
}

async function loginAdmin(deps: ReturnType<typeof makeDeps>): Promise<string> {
  await registerUser(deps, "admin@example.test");
  const admin = await deps.repository.findUserByEmail("admin@example.test");
  assert.ok(admin);
  await deps.repository.saveUser({
    ...admin,
    role: "admin",
    tier: "business",
    features: ["admin_ops"],
  });
  const login = await handleLoginRequest(
    { email: "admin@example.test", password: "commercial-secret" },
    deps,
  );
  assert.equal(login.status, 200);
  assert.ok(login.cookies?.[0]);
  return login.cookies[0].value;
}

async function seedAccessCode(repository: CommercialRepository): Promise<void> {
  const batch: AccessCodeBatchRecord = {
    id: "batch_1",
    createdByUserId: "admin_1",
    name: "Launch batch",
    source: "launch",
    codeCount: 1,
    credits: 9,
    features: [],
    metadata: {},
    createdAt: CREATED_AT,
  };
  const code: AccessCodeRecord = {
    id: "access_code_1",
    batchId: batch.id,
    codeHash: hashAccessCode(RAW_ACCESS_CODE, ACCESS_CODE_PEPPER),
    codeMask: "TIO-****-****-JKLM",
    status: "active",
    credits: 9,
    features: [],
    createdAt: CREATED_AT,
  };

  await repository.createAccessCodeBatchWithCodes(batch, [code]);
}

async function seedCredits(
  deps: ReturnType<typeof makeDeps>,
  sessionToken: string,
): Promise<void> {
  await seedAccessCode(deps.repository);
  const result = await handleRedeemAccessCodeRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: { code: RAW_ACCESS_CODE, idempotencyKey: "redeem_credits" },
    }),
    deps,
  );
  assert.equal(result.status, 200);
}

async function createPaidTask(
  deps: ReturnType<typeof makeDeps>,
  sessionToken: string,
): Promise<CommercialSimulationTaskRecord> {
  const result = await handleCreateCommercialTaskRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: {
        userInput: makeUserInput(),
        interactionMode: "enabled",
        idempotencyKey: "task-key-1",
      },
    }),
    deps,
  );
  assert.equal(result.status, 202);
  assert.equal("task" in result.body, true);
  if (!("task" in result.body)) {
    throw new Error("task creation failed");
  }
  return result.body.task;
}

function request({
  body,
  cookies,
  headers,
}: {
  body?: unknown;
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
} = {}) {
  return {
    body,
    cookies: cookies ?? {},
    headers: headers ?? {},
  };
}

function makeUserInput(): UserInput {
  return {
    type: "life_choice",
    decisionContext: "Should I quit my job?",
    optionA: "Stay",
    optionB: "Quit",
  };
}

function makePublicReport(taskId: string): SimulationApiResponse {
  return {
    id: taskId,
    status: "completed",
    agents: [],
    stages: [],
    report: makeDeepReport(),
    createdAt: CREATED_AT,
  };
}

function makeDeepReport(): Report {
  return {
    projectName: "Decision report",
    successProbability: 62,
    expectedRevenue: "n/a",
    riskLevel: "medium",
    finalRecommendation: "Test small",
    scores: {
      demandStrength: 60,
      willingnessToPay: 50,
      acquisitionDifficulty: 40,
      competitionPressure: 30,
      executionFit: 70,
      monetizationClarity: 55,
    },
    finalOutcome: "A cautious path",
    opportunities: [],
    risks: [],
    pivotSuggestions: [],
    actionPlan7Days: [],
    shouldDo: "test_small",
  };
}

class TestIds {
  private readonly counters = new Map<string, number>();

  create(prefix = "id"): string {
    return `${prefix}_${this.next(prefix)}`;
  }

  next(prefix: string): number {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return next;
  }
}

class TestClock {
  private index = 0;

  constructor(private readonly values: string[]) {}

  next(): string {
    const value = this.values[Math.min(this.index, this.values.length - 1)]!;
    this.index += 1;
    return value;
  }
}
