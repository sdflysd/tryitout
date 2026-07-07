import assert from "node:assert/strict";
import test from "node:test";

import { hashAccessCode } from "./access-code-secrets.js";
import { CommercialAuthService } from "./auth-service.js";
import {
  COMMERCIAL_SESSION_COOKIE_NAME,
  handleCancelCommercialTaskRequest,
  handleCreateCommercialTaskRequest,
  handleGetCommercialTaskReportRequest,
  handleGetCommercialTaskStatusRequest,
  handleGetCreditsRequest,
  handleGetMeRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRedeemAccessCodeRequest,
  handleRegisterRequest,
} from "./commercial-api.js";
import { CommercialTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
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

  return {
    authService,
    creditService,
    repository,
    taskService,
  };
}

async function registerUser(deps: ReturnType<typeof makeDeps>): Promise<void> {
  const result = await handleRegisterRequest(
    { email: "user@example.test", password: "commercial-secret" },
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
