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
  handleGetAdminCostSummaryRequest,
  handleGetAdminCreditOperationsRequest,
  handleGetAdminFeedbackRequest,
  handleGetAdminOverviewRequest,
  handleGetAdminQueueRequest,
  handleGetAdminSettingsRequest,
  handleGetActiveCommercialTaskRequest,
  handleGetCommercialTaskReportRequest,
  handleGetCommercialTaskStatusRequest,
  handleListCommercialTasksRequest,
  handleResumeCommercialTaskRequest,
  handleGetCreditsRequest,
  handleGetMeRequest,
  handleDeleteModelProviderRequest,
  handleBulkAdminAccessCodesRequest,
  handleBulkAdminUsersRequest,
  handleCreateAdminUserRequest,
  handleDeleteAdminAccessCodeRequest,
  handleDeleteAdminUserRequest,
  handleDisableAdminAccessCodeRequest,
  handleGetModelProviderRequest,
  handleGetPlatformModelsRequest,
  handleListAdminAccessCodesRequest,
  handleListAdminModelProfilesRequest,
  handleListAdminModelProvidersRequest,
  handleListAdminProviderModelsRequest,
  handleListAdminAccessCodeBatchesRequest,
  handleListAdminAuditLogsRequest,
  handleListAdminTasksRequest,
  handleListAdminUsersRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRedeemAccessCodeRequest,
  handleRegisterRequest,
  handleRestoreAdminAccessCodeRequest,
  handleSaveModelProviderRequest,
  handleSaveAdminModelProfileRequest,
  handleSaveAdminModelProviderRequest,
  handleTestAdminModelProfileRequest,
  handleTestModelProviderRequest,
  handleTestAdminModelProviderRequest,
  handleUpdateAdminUserRequest,
  handleUpdateAdminPlatformModelsRequest,
} from "./commercial-api.js";
import { CommercialTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { ModelProviderService } from "./model-provider-service.js";
import { WorkerMonitoringService } from "./worker-monitoring.js";
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
  await seedAccessCode(deps.repository, {
    tier: "business",
    features: ["custom_model_provider"],
  });

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
  assert.equal(redeemed.body.user.tier, "business");
  assert.deepEqual(redeemed.body.user.features, ["custom_model_provider"]);
  assert.equal("codeHash" in redeemed.body, false);
  assert.equal("rawCode" in redeemed.body, false);
});

test("redeem access code returns effective timed entitlement and me falls back after expiry", async () => {
  const deps = makeDeps({
    clockValues: [
      "2026-07-07T00:00:00.000Z",
      "2026-07-07T00:01:00.000Z",
      "2026-07-07T00:02:00.000Z",
      "2026-07-07T00:03:00.000Z",
      "2026-07-07T00:04:00.000Z",
      "2026-07-09T00:00:00.000Z",
    ],
  });
  const sessionToken = await loginUser(deps);
  await seedAccessCode(deps.repository, {
    tier: "business",
    features: ["custom_model_provider"],
    entitlementDurationDays: 1,
  });

  const redeemed = await handleRedeemAccessCodeRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: { code: RAW_ACCESS_CODE, idempotencyKey: "redeem_timed" },
    }),
    deps,
  );
  const afterExpiry = await handleGetMeRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(redeemed.status, 200);
  assert.equal("user" in redeemed.body, true);
  if (!("user" in redeemed.body)) return;
  assert.equal(redeemed.body.user.tier, "business");
  assert.deepEqual(redeemed.body.user.features, ["custom_model_provider"]);
  assert.equal(
    redeemed.body.redemption.entitlementExpiresAt,
    "2026-07-08T00:03:00.000Z",
  );
  assert.equal(afterExpiry.status, 200);
  assert.equal("user" in afterExpiry.body, true);
  if (!("user" in afterExpiry.body)) return;
  assert.equal(afterExpiry.body.user.tier, "basic");
  assert.deepEqual(afterExpiry.body.user.features, []);
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
  await seedPlatformModelsEnabled(deps);

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
  await seedPlatformModelsEnabled(deps);

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

test("commercial task creation rejects when no fresh worker is available", async () => {
  const deps = makeDeps({ includeWorkerMonitoring: true });
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  await seedPlatformModelsEnabled(deps);

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

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: "Simulation workers are unavailable. Please retry shortly.",
    code: "worker_unavailable",
  });
  assert.equal((await deps.repository.getCreditAccount("user_1"))?.balance, 9);
  assert.equal((await deps.repository.getCreditAccount("user_1"))?.frozenCredits, 0);
});

test("commercial task creation preserves selected platform model in queue job", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  await seedPlatformModelsEnabled(deps);

  const created = await handleCreateCommercialTaskRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken },
      body: {
        userInput: makeUserInput(),
        interactionMode: "enabled",
        providerMode: "platform",
        modelSelection: { modelProfileId: "anthropic_sonnet_balanced" },
        idempotencyKey: "task-key-1",
      },
    }),
    deps,
  );

  assert.equal(created.status, 202);
  const claim = await deps.queue.claimNext();
  assert.deepEqual(claim?.job.modelSelection, {
    modelProfileId: "anthropic_sonnet_balanced",
  });
});

test("commercial task status includes latest worker step progress", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  const task = await createPaidTask(deps, sessionToken);
  await deps.taskService.markRunning({ taskId: task.id });
  await deps.repository.appendSimulationStepRunCost({
    id: "simulation_step_run_1",
    taskId: task.id,
    stepName: "generate_agent_actions",
    stageIndex: 2,
    status: "started",
    startedAt: "2026-07-07T00:03:00.000Z",
    metadata: {
      progressPercent: 43,
      progressMessage: "第 2 阶段 Agent 行动生成开始。",
    },
  });

  const status = await handleGetCommercialTaskStatusRequest(
    task.id,
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(status.status, 200);
  assert.equal("task" in status.body, true);
  if (!("task" in status.body)) return;
  assert.equal(status.body.task.id, task.id);
  assert.equal(status.body.task.currentStepName, "generate_agent_actions");
  assert.equal(status.body.task.currentStageIndex, 2);
  assert.equal(status.body.task.progressPercent, 43);
  assert.equal(status.body.task.progressMessage, "第 2 阶段 Agent 行动生成开始。");
});

test("commercial task status keeps progress percent monotonic across step updates", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  const task = await createPaidTask(deps, sessionToken);
  await deps.taskService.markRunning({ taskId: task.id });
  await deps.repository.appendSimulationStepRunCost({
    id: "simulation_step_run_high",
    taskId: task.id,
    stepName: "arbitrate_stage",
    stageIndex: 4,
    status: "completed",
    startedAt: "2026-07-07T00:03:00.000Z",
    completedAt: "2026-07-07T00:04:00.000Z",
    metadata: {
      progressPercent: 73,
      progressMessage: "第 4 阶段裁决完成。",
    },
  });
  await deps.repository.appendSimulationStepRunCost({
    id: "simulation_step_run_low",
    taskId: task.id,
    stepName: "generate_agent_actions",
    stageIndex: 5,
    status: "started",
    startedAt: "2026-07-07T00:05:00.000Z",
    metadata: {
      progressPercent: 67,
      progressMessage: "第 5 阶段 Agent 行动生成开始。",
    },
  });

  const status = await handleGetCommercialTaskStatusRequest(
    task.id,
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(status.status, 200);
  assert.equal("task" in status.body, true);
  if (!("task" in status.body)) return;
  assert.equal(status.body.task.currentStepName, "generate_agent_actions");
  assert.equal(status.body.task.currentStageIndex, 5);
  assert.equal(status.body.task.progressPercent, 73);
  assert.equal(status.body.task.progressMessage, "第 5 阶段 Agent 行动生成开始。");
});

test("commercial task list endpoint returns only the current user's tasks", async () => {
  const deps = makeDeps();
  const userOne = await createSignedInUser(deps, "one@example.com");
  const userTwo = await createSignedInUser(deps, "two@example.com");

  await deps.repository.saveCommercialTask(makeCommercialTask({
    id: "task_user_1",
    userId: userOne.user.id,
    status: "queued",
    createdAt: "2026-07-14T08:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z",
  }));
  await deps.repository.saveCommercialTask(makeCommercialTask({
    id: "task_user_2",
    userId: userTwo.user.id,
    status: "queued",
  }));

  const result = await handleListCommercialTasksRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: userOne.cookie } }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(
    "tasks" in result.body ? result.body.tasks.map((task) => task.id) : [],
    ["task_user_1"],
  );
});

test("commercial task list endpoint decorates progress and sorts newest first", async () => {
  const deps = makeDeps();
  const user = await createSignedInUser(deps, "current@example.com");
  const olderTask = makeCommercialTask({
    id: "task_older",
    userId: user.user.id,
    status: "queued",
    createdAt: "2026-07-14T07:00:00.000Z",
    updatedAt: "2026-07-14T07:10:00.000Z",
  });
  const newerTask = makeCommercialTask({
    id: "task_newer",
    userId: user.user.id,
    status: "running",
    createdAt: "2026-07-14T06:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z",
  });
  await deps.repository.saveCommercialTask(olderTask);
  await deps.repository.saveCommercialTask(newerTask);
  await deps.repository.appendSimulationStepRunCost({
    id: "simulation_step_run_list_latest",
    taskId: newerTask.id,
    stepName: "generate_report",
    status: "started",
    startedAt: "2026-07-14T08:01:00.000Z",
    metadata: {
      progressPercent: 86,
      progressMessage: "Report generation started.",
    },
  });

  const result = await handleListCommercialTasksRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: user.cookie } }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.equal("tasks" in result.body, true);
  if (!("tasks" in result.body)) return;
  assert.deepEqual(result.body.tasks.map((task) => task.id), [
    "task_newer",
    "task_older",
  ]);
  assert.equal(result.body.tasks[0]?.currentStepName, "generate_report");
  assert.equal(result.body.tasks[0]?.progressPercent, 86);
  assert.equal(result.body.tasks[0]?.progressMessage, "Report generation started.");
  assert.equal(result.body.tasks[1]?.progressPercent, 5);
});

test("active commercial task endpoint returns the current user's queued task", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  const task = await createPaidTask(deps, sessionToken);

  const missing = await handleGetActiveCommercialTaskRequest(request(), deps);
  const active = await handleGetActiveCommercialTaskRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(missing.status, 401);
  assert.equal(active.status, 200);
  assert.equal("task" in active.body, true);
  if (!("task" in active.body)) return;
  assert.equal(active.body.task?.id, task.id);
  assert.equal(active.body.task?.status, "queued");
  assert.equal(active.body.task?.userId, "user_1");
});

test("commercial resume endpoint requeues a recoverable task for the owner", async () => {
  const deps = makeDeps();
  const sessionToken = await loginUser(deps);
  await seedCredits(deps, sessionToken);
  const task = await createPaidTask(deps, sessionToken);
  await deps.queue.claimNext();
  await deps.taskService.markRunning({ taskId: task.id });
  await deps.taskService.markRecoverableFailed({
    taskId: task.id,
    error: "provider_error",
  });

  const result = await handleResumeCommercialTaskRequest(
    task.id,
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: sessionToken } }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.equal("ok" in result.body, true);
  if (!("ok" in result.body)) return;
  assert.equal(result.body.ok, true);
  assert.equal(result.body.task?.id, task.id);
  assert.equal(result.body.task?.status, "queued");
  assert.equal((await deps.queue.claimNext())?.job.taskId, task.id);
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

test("admin read endpoints reject non-admin sessions and return real safe operations data", async () => {
  const deps = makeDeps();
  const userSession = await loginUser(deps);
  const adminSession = await loginAdmin(deps);
  await registerUser(deps, "customer@example.test");
  const customer = await deps.repository.findUserByEmail("customer@example.test");
  assert.ok(customer);
  await deps.repository.saveAccessCodeBatch({
    id: "batch_existing",
    createdByUserId: "user_1",
    name: "Existing campaign",
    source: "sales",
    codeCount: 1,
    credits: 7,
    features: ["priority_queue"],
    metadata: {},
    createdAt: CREATED_AT,
  });
  await deps.repository.saveAccessCode({
    id: "code_existing",
    batchId: "batch_existing",
    codeHash: "do-not-leak",
    codeMask: "TIO-****-****-SAFE",
    status: "active",
    credits: 7,
    features: ["priority_queue"],
    createdAt: CREATED_AT,
  });
  await deps.repository.saveCommercialTask({
    id: "task_admin",
    userId: customer.id,
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "failed",
    creditCost: 3,
    queuedAt: CREATED_AT,
    startedAt: "2026-07-07T00:01:00.000Z",
    completedAt: "2026-07-07T00:02:00.000Z",
    errorCode: "model_timeout",
    createdAt: CREATED_AT,
    updatedAt: "2026-07-07T00:02:00.000Z",
  });
  await deps.repository.saveCommercialTask({
    id: "task_queued",
    userId: customer.id,
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    queuedAt: "2026-07-06T23:59:00.000Z",
    createdAt: "2026-07-06T23:59:00.000Z",
    updatedAt: "2026-07-06T23:59:00.000Z",
  });
  await deps.repository.appendSimulationTaskRun({
    id: "run_admin",
    taskId: "task_admin",
    workerId: "worker_api",
    status: "failed",
    startedAt: "2026-07-07T00:01:00.000Z",
    completedAt: "2026-07-07T00:02:00.000Z",
  });
  await deps.repository.appendSimulationStepRunCost({
    id: "cost_admin",
    taskRunId: "run_admin",
    taskId: "task_admin",
    stepName: "generate_report",
    provider: "openai",
    modelId: "gpt-5-mini",
    totalTokens: 1200,
    estimatedCost: 0.12,
    status: "failed",
    startedAt: "2026-07-07T00:01:10.000Z",
  });
  await deps.repository.appendUserFeedback({
    id: "feedback_admin",
    userId: customer.id,
    taskId: "task_admin",
    rating: 5,
    feedbackType: "quality",
    comment: "clear",
    metadata: {},
    createdAt: "2026-07-07T00:03:00.000Z",
  });
  await deps.repository.saveSystemSetting({
    key: "queue.paused",
    value: false,
    description: "Pause commercial queue",
    updatedByUserId: "user_1",
    createdAt: CREATED_AT,
    updatedAt: "2026-07-07T00:04:00.000Z",
  });

  const nonAdmin = request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: userSession } });
  assert.equal((await handleListAdminUsersRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleListAdminAccessCodeBatchesRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleListAdminTasksRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleGetAdminCreditOperationsRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleGetAdminCostSummaryRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleGetAdminQueueRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleGetAdminFeedbackRequest(nonAdmin, deps)).status, 403);
  assert.equal((await handleGetAdminSettingsRequest(nonAdmin, deps)).status, 403);

  const adminRequest = request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession } });
  const users = await handleListAdminUsersRequest(adminRequest, deps);
  const batches = await handleListAdminAccessCodeBatchesRequest(adminRequest, deps);
  const tasks = await handleListAdminTasksRequest(adminRequest, deps);
  const credits = await handleGetAdminCreditOperationsRequest(adminRequest, deps);
  const costs = await handleGetAdminCostSummaryRequest(adminRequest, deps);
  const queue = await handleGetAdminQueueRequest(adminRequest, deps);
  const feedback = await handleGetAdminFeedbackRequest(adminRequest, deps);
  const settings = await handleGetAdminSettingsRequest(adminRequest, deps);

  assert.equal(users.status, 200);
  assert.equal("users" in users.body, true);
  if (!("users" in users.body)) return;
  assert.equal(users.body.users.items.some((user) => user.email === "customer@example.test"), true);

  assert.equal(batches.status, 200);
  assert.equal("batches" in batches.body, true);
  if (!("batches" in batches.body)) return;
  assert.equal(batches.body.batches[0]?.name, "Existing campaign");
  assert.equal(JSON.stringify(batches.body).includes("do-not-leak"), false);

  assert.equal(tasks.status, 200);
  assert.equal("tasks" in tasks.body, true);
  if (!("tasks" in tasks.body)) return;
  assert.equal(tasks.body.tasks[0]?.workerId, "worker_api");

  assert.equal(credits.status, 200);
  assert.equal("credits" in credits.body, true);
  if (!("credits" in credits.body)) return;
  assert.equal(credits.body.credits.accounts.some((account) => account.userEmail === "customer@example.test"), true);

  assert.equal(costs.status, 200);
  assert.equal("summary" in costs.body, true);
  if (!("summary" in costs.body)) return;
  assert.equal(costs.body.summary.totalEstimatedCost, 0.12);

  assert.equal(queue.status, 200);
  assert.equal("queue" in queue.body, true);
  if (!("queue" in queue.body)) return;
  assert.equal(queue.body.queue.backlog, 1);

  assert.equal(feedback.status, 200);
  assert.equal("feedback" in feedback.body, true);
  if (!("feedback" in feedback.body)) return;
  assert.equal(feedback.body.feedback.summary.averageRating, 5);

  assert.equal(settings.status, 200);
  assert.equal("settings" in settings.body, true);
  if (!("settings" in settings.body)) return;
  assert.equal(settings.body.settings.items.find((item) => item.key === "queue.paused")?.configured, true);
});

test("admin platform model settings drive the public platform model list", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);

  assert.deepEqual(
    (await handleGetPlatformModelsRequest(deps)).body,
    { models: [] },
  );

  const updated = await handleUpdateAdminPlatformModelsRequest(
    request({
      cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession },
      body: {
        enabledModelProfileIds: ["anthropic_sonnet_balanced"],
      },
    }),
    deps,
  );
  const publicModels = await handleGetPlatformModelsRequest(deps);

  assert.equal(updated.status, 200);
  assert.equal("settings" in updated.body, true);
  if (!("settings" in updated.body)) return;
  assert.deepEqual(updated.body.settings.platformModels.enabledModelProfileIds, [
    "anthropic_sonnet_balanced",
  ]);
  assert.deepEqual(
    publicModels.body.models.map((model) => model.id),
    ["anthropic_sonnet_balanced"],
  );
});

test("repository-backed platform profiles require admin enablement before appearing publicly", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });
  const savedProvider = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "openai_compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
      status: "active",
    }),
    deps,
  );
  assert.equal("provider" in savedProvider.body, true);
  if (!("provider" in savedProvider.body)) return;
  await handleSaveAdminModelProfileRequest(
    adminRequest({
      id: "openrouter_balanced",
      providerConfigId: savedProvider.body.provider.id,
      label: "OpenRouter Balanced",
      modelId: "vendor/balanced",
      quality: "balanced",
      visibleToUser: true,
      status: "active",
    }),
    deps,
  );
  await handleSaveAdminModelProfileRequest(
    adminRequest({
      id: "openrouter_hidden",
      providerConfigId: savedProvider.body.provider.id,
      label: "OpenRouter Hidden",
      modelId: "vendor/hidden",
      quality: "fast",
      visibleToUser: false,
      status: "active",
    }),
    deps,
  );

  const hiddenUntilEnabled = await handleGetPlatformModelsRequest(deps);
  assert.deepEqual(hiddenUntilEnabled.body, { models: [] });

  await handleUpdateAdminPlatformModelsRequest(
    adminRequest({
      enabledModelProfileIds: ["openrouter_balanced"],
    }),
    deps,
  );
  const publicModels = await handleGetPlatformModelsRequest(deps);

  assert.deepEqual(publicModels.body, {
    models: [
      {
        id: "openrouter_balanced",
        label: "OpenRouter Balanced",
        providerLabel: "OpenRouter",
        modelId: "vendor/balanced",
        quality: "balanced",
      },
    ],
  });
});

test("disabled repository-backed platform profiles are removed from public model list", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });
  const savedProvider = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "openai_compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
      status: "active",
    }),
    deps,
  );
  assert.equal("provider" in savedProvider.body, true);
  if (!("provider" in savedProvider.body)) return;
  await handleSaveAdminModelProfileRequest(
    adminRequest({
      id: "openrouter_balanced",
      providerConfigId: savedProvider.body.provider.id,
      label: "OpenRouter Balanced",
      modelId: "vendor/balanced",
      quality: "balanced",
      visibleToUser: true,
      status: "active",
    }),
    deps,
  );
  await handleUpdateAdminPlatformModelsRequest(
    adminRequest({
      enabledModelProfileIds: ["openrouter_balanced"],
    }),
    deps,
  );

  await handleSaveAdminModelProfileRequest(
    adminRequest({
      providerConfigId: savedProvider.body.provider.id,
      label: "OpenRouter Balanced",
      modelId: "vendor/balanced",
      quality: "balanced",
      visibleToUser: true,
      status: "disabled",
    }),
    deps,
    "openrouter_balanced",
  );
  const publicModels = await handleGetPlatformModelsRequest(deps);

  assert.deepEqual(publicModels.body, { models: [] });
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
        entitlementDurationDays: 30,
        metadata: { channel: "manual" },
      },
    }),
    deps,
  );

  assert.equal(result.status, 201);
  assert.equal("batch" in result.body, true);
  if (!("batch" in result.body)) return;
  assert.equal(result.body.batch.createdByUserId, "user_1");
  assert.equal(result.body.batch.entitlementDurationDays, 30);
  assert.deepEqual(result.body.codes.map((code) => code.rawCode), [RAW_ADMIN_CODES[0]]);
  assert.equal(result.body.codes[0]?.codeMask, "TIO-****-****-JK23");
  assert.equal(result.body.codes[0]?.entitlementDurationDays, 30);
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
        entitlementDurationDays: 45,
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
  assert.equal(created.body.batch.entitlementDurationDays, 45);
  assert.deepEqual(
    created.body.codes.map((code) => code.rawCode),
    RAW_ADMIN_CODES.slice(0, 2),
  );
  assert.deepEqual(
    created.body.codes.map((code) => code.entitlementDurationDays),
    [45, 45],
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

test("admin user mutation endpoints create, update, delete, and bulk-disable users", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });

  const created = await handleCreateAdminUserRequest(
    adminRequest({
      email: "operator@example.test",
      password: "temporary-secret",
      role: "admin",
      tier: "business",
      features: ["admin_ops", "priority_queue"],
      initialCredits: 8,
      reason: "ops bootstrap",
    }),
    deps,
  );

  assert.equal(created.status, 201);
  assert.equal("user" in created.body, true);
  if (!("user" in created.body)) return;
  assert.equal(created.body.user.email, "operator@example.test");
  assert.equal(created.body.user.role, "admin");
  assert.equal(created.body.user.creditAccount?.balance, 8);
  assert.equal(JSON.stringify(created.body).includes("passwordHash"), false);

  const updated = await handleUpdateAdminUserRequest(
    created.body.user.id,
    adminRequest({
      email: "operator-updated@example.test",
      role: "user",
      tier: "pro",
      features: ["deep_mode"],
      reason: "scope changed",
    }),
    deps,
  );
  assert.equal(updated.status, 200);
  assert.equal("user" in updated.body, true);
  if (!("user" in updated.body)) return;
  assert.equal(updated.body.user.email, "operator-updated@example.test");
  assert.deepEqual(updated.body.user.features, ["deep_mode"]);

  const deleted = await handleDeleteAdminUserRequest(
    created.body.user.id,
    adminRequest({ reason: "offboarded" }),
    deps,
  );
  assert.equal(deleted.status, 200);
  assert.equal("user" in deleted.body, true);
  if (!("user" in deleted.body)) return;
  assert.equal(deleted.body.user.status, "deleted");

  const bulkTarget = await handleCreateAdminUserRequest(
    adminRequest({
      email: "bulk-target@example.test",
      password: "temporary-secret",
      reason: "batch setup",
    }),
    deps,
  );
  assert.equal("user" in bulkTarget.body, true);
  if (!("user" in bulkTarget.body)) return;
  const bulk = await handleBulkAdminUsersRequest(
    adminRequest({
      userIds: [bulkTarget.body.user.id, "missing_user"],
      operation: "disable",
      reason: "risk review",
    }),
    deps,
  );
  assert.equal(bulk.status, 200);
  assert.deepEqual(bulk.body, {
    result: {
      updatedUserIds: [bulkTarget.body.user.id],
      skipped: [{ id: "missing_user", reason: "not_found" }],
    },
  });

  const bulkEntitlementTarget = await handleCreateAdminUserRequest(
    adminRequest({
      email: "bulk-entitlement@example.test",
      password: "temporary-secret",
      reason: "batch setup",
    }),
    deps,
  );
  assert.equal("user" in bulkEntitlementTarget.body, true);
  if (!("user" in bulkEntitlementTarget.body)) return;
  const bulkEntitlements = await handleBulkAdminUsersRequest(
    adminRequest({
      userIds: [bulkEntitlementTarget.body.user.id],
      operation: "update_entitlements",
      role: "admin",
      tier: "business",
      features: ["admin_ops"],
      reason: "ops migration",
    }),
    deps,
  );
  assert.equal(bulkEntitlements.status, 200);
  assert.equal(
    (await deps.repository.getUser(bulkEntitlementTarget.body.user.id))?.role,
    "admin",
  );
  assert.equal(
    (await deps.repository.getUser(bulkEntitlementTarget.body.user.id))?.tier,
    "business",
  );
});

test("admin access-code inventory endpoints list, disable, delete, and bulk-operate on individual codes", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });
  await deps.repository.saveAccessCodeBatch({
    id: "batch_inventory",
    name: "Inventory",
    codeCount: 3,
    credits: 10,
    features: [],
    metadata: {},
    createdAt: CREATED_AT,
  });
  await deps.repository.saveAccessCode({
    id: "code_disable",
    batchId: "batch_inventory",
    codeHash: "hash_disable",
    codeMask: "TIO-****-****-0001",
    status: "active",
    credits: 10,
    features: [],
    createdAt: CREATED_AT,
  });
  await deps.repository.saveAccessCode({
    id: "code_delete",
    batchId: "batch_inventory",
    codeHash: "hash_delete",
    codeMask: "TIO-****-****-0002",
    status: "active",
    credits: 10,
    features: [],
    createdAt: CREATED_AT,
  });
  await deps.repository.saveAccessCode({
    id: "code_redeemed",
    batchId: "batch_inventory",
    codeHash: "hash_redeemed",
    codeMask: "TIO-****-****-0003",
    status: "redeemed",
    credits: 10,
    features: [],
    redeemedByUserId: "user_1",
    redeemedAt: CREATED_AT,
    createdAt: CREATED_AT,
  });

  const listed = await handleListAdminAccessCodesRequest(adminRequest(), deps);
  assert.equal(listed.status, 200);
  assert.equal("accessCodes" in listed.body, true);
  if (!("accessCodes" in listed.body)) return;
  assert.equal(listed.body.accessCodes.total, 3);
  assert.equal(JSON.stringify(listed.body).includes("hash_"), false);

  const disabled = await handleDisableAdminAccessCodeRequest(
    "code_disable",
    adminRequest({ reason: "fraud risk" }),
    deps,
  );
  const restored = await handleRestoreAdminAccessCodeRequest(
    "code_disable",
    adminRequest({ reason: "risk cleared" }),
    deps,
  );
  const deleted = await handleDeleteAdminAccessCodeRequest(
    "code_delete",
    adminRequest({ reason: "void generated code" }),
    deps,
  );
  const bulk = await handleBulkAdminAccessCodesRequest(
    adminRequest({
      accessCodeIds: ["code_redeemed", "missing_code"],
      operation: "delete",
      reason: "cleanup",
    }),
    deps,
  );

  assert.equal(disabled.status, 200);
  assert.equal("accessCode" in disabled.body, true);
  if (!("accessCode" in disabled.body)) return;
  assert.equal(disabled.body.accessCode.status, "disabled");
  assert.equal(restored.status, 200);
  assert.equal("accessCode" in restored.body, true);
  if (!("accessCode" in restored.body)) return;
  assert.equal(restored.body.accessCode.status, "active");
  assert.equal(deleted.status, 200);
  assert.equal("accessCode" in deleted.body, true);
  if (!("accessCode" in deleted.body)) return;
  assert.equal(typeof deleted.body.accessCode.deletedAt, "string");
  assert.equal(
    (await deps.repository.listAccessCodes()).some((code) => code.id === "code_delete"),
    false,
  );
  assert.deepEqual(bulk.body, {
    result: {
      updatedCodeIds: ["code_redeemed"],
      skipped: [
        { id: "missing_code", reason: "not_found" },
      ],
    },
  });
});

test("admin platform model endpoints save masked providers, test them, and save profiles", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });

  const savedProvider = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "openai_compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
      status: "active",
    }),
    deps,
  );

  assert.equal(savedProvider.status, 200);
  assert.equal("provider" in savedProvider.body, true);
  if (!("provider" in savedProvider.body)) return;
  assert.equal(savedProvider.body.provider.apiKeyMask, "sk-pla...1234");
  assert.equal(JSON.stringify(savedProvider.body).includes("sk-platform-secret1234"), false);

  const tested = await handleTestAdminModelProviderRequest(
    savedProvider.body.provider.id,
    adminRequest(),
    deps,
  );
  assert.equal(tested.status, 200);
  assert.equal("provider" in tested.body, true);
  if (!("provider" in tested.body)) return;
  assert.equal(tested.body.provider.lastTestStatus, "passed");

  const savedProfile = await handleSaveAdminModelProfileRequest(
    adminRequest({
      id: "openrouter_balanced",
      providerConfigId: savedProvider.body.provider.id,
      label: "OpenRouter Balanced",
      modelId: "vendor/balanced",
      quality: "balanced",
      visibleToUser: true,
      status: "active",
      capabilities: { vision: true },
      limits: { contextWindow: 128000 },
    }),
    deps,
  );
  assert.equal(savedProfile.status, 200);
  assert.deepEqual(savedProfile.body, {
    profile: {
      id: "openrouter_balanced",
      providerConfigId: savedProvider.body.provider.id,
      label: "OpenRouter Balanced",
      providerLabel: "OpenRouter",
      modelId: "vendor/balanced",
      quality: "balanced",
      source: "admin",
      visibleToUser: true,
      status: "active",
    },
  });

  const providers = await handleListAdminModelProvidersRequest(adminRequest(), deps);
  const profiles = await handleListAdminModelProfilesRequest(adminRequest(), deps);
  assert.equal("providers" in providers.body, true);
  assert.equal("profiles" in profiles.body, true);
  if (!("providers" in providers.body) || !("profiles" in profiles.body)) return;
  assert.equal(providers.body.providers.length, 1);
  assert.equal(profiles.body.profiles[0]?.id, "openrouter_balanced");
});

test("admin platform provider save maps duplicate display names to structured errors", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });

  const first = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "openai_compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
    }),
    deps,
  );
  assert.equal(first.status, 200);

  const duplicate = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "gemini",
      displayName: "OpenRouter",
      apiKey: "gemini-platform-secret1234",
    }),
    deps,
  );

  assert.deepEqual(duplicate, {
    status: 400,
    body: {
      error: "Display name is already used by another platform model provider",
      code: "platform_model_provider_display_name_taken",
    },
  });
});

test("admin model profile inventory excludes fallback platform models", async () => {
  const deps = makeDeps();
  const adminSession = await loginAdmin(deps);

  const profiles = await handleListAdminModelProfilesRequest(
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession } }),
    deps,
  );

  assert.deepEqual(profiles.body, { profiles: [] });
});

test("admin can fetch provider model catalog without exposing provider secrets", async () => {
  const deps = makeDeps({
    discoverPlatformProviderModels: async (input) => {
      assert.deepEqual(input, {
        provider: "openai_compatible",
        baseUrl: "https://openrouter.example/api/v1",
        apiKey: "sk-platform-secret1234",
      });
      return {
        models: [
          { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
          { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
        ],
      };
    },
  });
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });
  const savedProvider = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "openai_compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
      status: "active",
    }),
    deps,
  );
  assert.equal("provider" in savedProvider.body, true);
  if (!("provider" in savedProvider.body)) return;

  const catalogResult = await handleListAdminProviderModelsRequest(
    savedProvider.body.provider.id,
    adminRequest(),
    deps,
  );

  assert.equal(catalogResult.status, 200);
  assert.deepEqual(catalogResult.body, {
    catalog: {
      providerId: savedProvider.body.provider.id,
      provider: "openai_compatible",
      models: [
        { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
        { id: "openai/gpt-4.1-mini", label: "GPT 4.1 Mini" },
      ],
      unsupported: false,
    },
  });
  assert.equal(JSON.stringify(catalogResult.body).includes("sk-platform-secret1234"), false);
});

test("admin can test a provider-backed model id before publishing it", async () => {
  const observed: unknown[] = [];
  const deps = makeDeps({
    testPlatformModelConnection: async (input) => {
      observed.push(input);
      return { ok: true };
    },
  });
  const adminSession = await loginAdmin(deps);
  const adminRequest = (body?: unknown) =>
    request({ cookies: { [COMMERCIAL_SESSION_COOKIE_NAME]: adminSession }, body });
  const savedProvider = await handleSaveAdminModelProviderRequest(
    adminRequest({
      provider: "openai_compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
      status: "active",
    }),
    deps,
  );
  assert.equal("provider" in savedProvider.body, true);
  if (!("provider" in savedProvider.body)) return;

  const result = await handleTestAdminModelProfileRequest(
    "openrouter_balanced",
    adminRequest({
      providerConfigId: savedProvider.body.provider.id,
      modelId: "vendor/balanced",
    }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    result: {
      providerConfigId: savedProvider.body.provider.id,
      profileId: "openrouter_balanced",
      modelId: "vendor/balanced",
      ok: true,
      checkedAt: "2026-07-07T00:06:00.000Z",
    },
  });
  assert.deepEqual(observed, [
    {
      provider: "openai_compatible",
      baseUrl: "https://openrouter.example/api/v1",
      apiKey: "sk-platform-secret1234",
      modelId: "vendor/balanced",
    },
  ]);
  assert.equal(JSON.stringify(result.body).includes("sk-platform-secret1234"), false);
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

function makeDeps(options: {
  discoverPlatformProviderModels?: ConstructorParameters<typeof CommercialAdminService>[0]["discoverPlatformProviderModels"];
  testPlatformModelConnection?: ConstructorParameters<typeof CommercialAdminService>[0]["testPlatformModelConnection"];
  clockValues?: string[];
  includeWorkerMonitoring?: boolean;
} = {}) {
  const repository = new InMemoryCommercialRepository();
  const ids = new TestIds();
  const clock = new TestClock(options.clockValues ?? [
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
  const queue = new InMemorySimulationQueue({ maxActiveWeight: 6 });
  const taskService = new CommercialTaskService({
    repository,
    creditService,
    queue,
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
    testPlatformProviderConnection: async () => ({ ok: true }),
    discoverPlatformProviderModels: options.discoverPlatformProviderModels,
    testPlatformModelConnection: options.testPlatformModelConnection,
  });
  const modelProviderService = new ModelProviderService({
    repository,
    encryptionKey: MODEL_PROVIDER_KEY,
    createId,
    now,
    resolveHostname: async () => ["172.64.154.211"],
    testProviderConnection: async () => ({ ok: true }),
  });
  const workerMonitoringService = options.includeWorkerMonitoring
    ? new WorkerMonitoringService({
        repository,
        maxActiveWeight: 6,
        now,
      })
    : undefined;

  return {
    adminService,
    authService,
    creditService,
    modelProviderService,
    queue,
    repository,
    taskService,
    ...(workerMonitoringService !== undefined ? { workerMonitoringService } : {}),
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

async function createSignedInUser(
  deps: ReturnType<typeof makeDeps>,
  email: string,
): Promise<{ user: Awaited<ReturnType<typeof deps.authService.register>>["user"]; cookie: string }> {
  await registerUser(deps, email);
  const login = await handleLoginRequest(
    { email, password: "commercial-secret" },
    deps,
  );
  assert.equal(login.status, 200);
  assert.ok(login.cookies?.[0]);
  assert.equal("user" in login.body, true);
  if (!("user" in login.body)) {
    throw new Error("login failed");
  }
  return {
    user: login.body.user,
    cookie: login.cookies[0].value,
  };
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

async function seedAccessCode(
  repository: CommercialRepository,
  overrides: Partial<
    Pick<
      AccessCodeBatchRecord | AccessCodeRecord,
      "tier" | "features" | "entitlementDurationDays"
    >
  > = {},
): Promise<void> {
  const batch: AccessCodeBatchRecord = {
    id: "batch_1",
    createdByUserId: "admin_1",
    name: "Launch batch",
    source: "launch",
    codeCount: 1,
    credits: 9,
    features: overrides.features ?? [],
    entitlementDurationDays: overrides.entitlementDurationDays,
    metadata: {},
    createdAt: CREATED_AT,
  };
  if (overrides.tier !== undefined) {
    batch.tier = overrides.tier;
  }
  const code: AccessCodeRecord = {
    id: "access_code_1",
    batchId: batch.id,
    codeHash: hashAccessCode(RAW_ACCESS_CODE, ACCESS_CODE_PEPPER),
    codeMask: "TIO-****-****-JKLM",
    status: "active",
    credits: 9,
    features: overrides.features ?? [],
    entitlementDurationDays: overrides.entitlementDurationDays,
    createdAt: CREATED_AT,
  };
  if (overrides.tier !== undefined) {
    code.tier = overrides.tier;
  }

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
  await seedPlatformModelsEnabled(deps);
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

async function seedPlatformModelsEnabled(
  deps: ReturnType<typeof makeDeps>,
): Promise<void> {
  await deps.repository.saveSystemSetting({
    key: "platform.models.enabled",
    value: ["anthropic_sonnet_balanced"],
    description: "Platform model profiles enabled for users",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
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

function makeCommercialTask(
  overrides: Partial<CommercialSimulationTaskRecord> = {},
): CommercialSimulationTaskRecord {
  return {
    id: "task_test",
    userId: "user_1",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "queued",
    creditCost: 3,
    queuedAt: "2026-07-14T07:00:00.000Z",
    createdAt: "2026-07-14T07:00:00.000Z",
    updatedAt: "2026-07-14T07:00:00.000Z",
    ...overrides,
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
