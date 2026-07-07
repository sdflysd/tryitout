import assert from "node:assert/strict";
import test from "node:test";

import {
  createCommercialApiHandlers,
  type CommercialApiServices,
} from "./commercial-api.js";
import { hashAccessCode, maskAccessCode } from "./access-codes.js";
import { CommercialAdminService } from "./admin-service.js";
import { CommercialAuthService } from "./auth-service.js";
import { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { FeedbackService } from "./feedback-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { InMemorySimulationQueue } from "./simulation-queue.js";
import type { CommercialRepository } from "./repository.js";
import type { Report, SimulationApiResponse } from "../../types.js";

const now = new Date("2026-07-06T12:00:00.000Z");
const pepper = "pepper";

const sampleReport: Report = {
  projectName: "Launch",
  successProbability: 72,
  expectedRevenue: "$1000",
  riskLevel: "medium",
  finalRecommendation: "test small",
  scores: {
    demandStrength: 70,
    willingnessToPay: 60,
    acquisitionDifficulty: 40,
    competitionPressure: 30,
    executionFit: 80,
    monetizationClarity: 65,
  },
  finalOutcome: "validated",
  opportunities: ["niche"],
  risks: ["time"],
  pivotSuggestions: [],
  actionPlan7Days: [{ day: 1, title: "Interview", action: "Talk to users" }],
  shouldDo: "test_small",
};

const sampleSimulationResponse: SimulationApiResponse = {
  id: "task_1",
  status: "completed",
  agents: [],
  stages: [],
  report: sampleReport,
  createdAt: now.toISOString(),
  interactionModeUsed: "legacy",
};

interface BalanceBody {
  balance: number;
}

interface TaskBody {
  taskId: string;
  status: string;
}

interface ReportBody {
  report: SimulationApiResponse;
}

interface CreatedAccessCodeBody {
  accessCode: {
    accessCodeId: string;
    rawCode: string;
    maskedCode: string;
  };
}

interface CreatedAccessCodeBatchBody {
  accessCodes: Array<{
    accessCodeId: string;
    rawCode: string;
    maskedCode: string;
  }>;
}

interface AuditLogsBody {
  auditLogs: Array<{
    action: string;
    targetId: string;
  }>;
}

interface FeedbackBody {
  feedback: {
    taskId: string;
    reportId: string;
    rating: number;
    useful: boolean;
    text?: string;
  };
}

function createHarness(): {
  repository: InMemoryCommercialRepository;
  handlers: ReturnType<typeof createCommercialApiHandlers>;
  authService: CommercialAuthService;
  taskService: CommercialSimulationTaskService;
} {
  const repository = new InMemoryCommercialRepository();
  const authService = new CommercialAuthService(repository, {
    now: () => now,
  });
  const creditService = new CreditService(repository, {
    accessCodePepper: pepper,
    now: () => now,
  });
  const adminService = new CommercialAdminService(repository, creditService, {
    accessCodePepper: pepper,
    now: () => now,
  });
  const taskService = new CommercialSimulationTaskService(
    repository,
    creditService,
    new InMemorySimulationQueue(),
    { now: () => now },
  );
  const services: CommercialApiServices = {
    repository,
    authService,
    creditService,
    taskService,
    adminService,
    feedbackService: new FeedbackService(repository, { now: () => now }),
  };
  return {
    repository,
    authService,
    handlers: createCommercialApiHandlers(services, {
      secureCookies: true,
      now: () => now,
    }),
    taskService,
  };
}

async function seedAccessCode(repository: CommercialRepository): Promise<void> {
  await repository.saveUser({
    id: "admin_1",
    email: "admin@tryitout.ai",
    passwordHash: "hash",
    tier: "business",
    features: [],
    isAdmin: true,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveAccessCode({
    id: "code_1",
    codeHash: hashAccessCode("TIO-ABCD-1234-WXYZ", pepper),
    maskedCode: maskAccessCode("TIO-ABCD-1234-WXYZ"),
    status: "active",
    creditAmount: 10,
    tier: "pro",
    features: ["custom_model_provider"],
    expiresAt: undefined,
    redeemedByUserId: undefined,
    redeemedAt: undefined,
    disabledAt: undefined,
    createdByAdminUserId: "admin_1",
    createdAt: now,
    updatedAt: now,
  });
}

async function registerAndLogin(
  handlers: ReturnType<typeof createCommercialApiHandlers>,
): Promise<string> {
  await handlers.register({ body: { email: "founder@tryitout.ai", password: "password-1" } });
  const login = await handlers.login({
    body: { email: "founder@tryitout.ai", password: "password-1" },
  });
  return login.cookies?.[0].value ?? "";
}

async function createAdminSession(
  repository: CommercialRepository,
  authService: CommercialAuthService,
  handlers: ReturnType<typeof createCommercialApiHandlers>,
): Promise<string> {
  await handlers.register({ body: { email: "admin@tryitout.ai", password: "password-1" } });
  const admin = await repository.findUserByEmail("admin@tryitout.ai");
  assert.ok(admin);
  await repository.saveUser({
    ...admin,
    tier: "business",
    features: ["custom_model_provider"],
    isAdmin: true,
    updatedAt: now,
  });

  const login = await authService.login({
    email: "admin@tryitout.ai",
    password: "password-1",
  });
  return login.sessionToken;
}

test("register and login handlers return public users and session cookie", async () => {
  const { handlers } = createHarness();

  const registered = await handlers.register({
    body: { email: " Founder@TryItOut.AI ", password: "password-1" },
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.email, "founder@tryitout.ai");
  assert.equal(Object.hasOwn(registered.body.user, "passwordHash"), false);

  const login = await handlers.login({
    body: { email: "founder@tryitout.ai", password: "password-1" },
  });

  assert.equal(login.status, 200);
  assert.equal(Object.hasOwn(login.body.user, "passwordHash"), false);
  assert.equal(login.cookies?.[0].httpOnly, true);
  assert.equal(login.cookies?.[0].sameSite, "lax");
  assert.equal(login.cookies?.[0].secure, true);
});

test("auth-required handlers reject missing session and logout clears cookie", async () => {
  const { handlers } = createHarness();

  assert.equal((await handlers.me({ sessionToken: undefined })).status, 401);

  const token = await registerAndLogin(handlers);
  const me = await handlers.me({ sessionToken: token });
  assert.equal(me.status, 200);

  const logout = await handlers.logout({ sessionToken: token });
  assert.equal(logout.status, 204);
  assert.equal(logout.cookies?.[0].maxAge, 0);
  assert.equal((await handlers.me({ sessionToken: token })).status, 401);
});

test("redeem access code and get credits", async () => {
  const { repository, handlers } = createHarness();
  await seedAccessCode(repository);
  const token = await registerAndLogin(handlers);

  const redeem = await handlers.redeemAccessCode({
    sessionToken: token,
    body: { code: "tio-abcd-1234-wxyz" },
  });
  assert.equal(redeem.status, 200);
  assert.equal((redeem.body as BalanceBody).balance, 10);

  const credits = await handlers.getCredits({ sessionToken: token });
  assert.equal(credits.status, 200);
  assert.equal((credits.body as BalanceBody).balance, 10);
});

test("task creation rejects insufficient credits and returns queued status when funded", async () => {
  const { repository, handlers } = createHarness();
  await seedAccessCode(repository);
  const token = await registerAndLogin(handlers);

  const insufficient = await handlers.createTask({
    sessionToken: token,
    body: {
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "legacy",
      providerMode: "platform",
    },
  });
  assert.equal(insufficient.status, 402);

  await handlers.redeemAccessCode({ sessionToken: token, body: { code: "TIO-ABCD-1234-WXYZ" } });
  const created = await handlers.createTask({
    sessionToken: token,
    body: {
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "legacy",
      providerMode: "platform",
    },
  });

  assert.equal(created.status, 202);
  assert.equal((created.body as TaskBody).status, "queued");
});

test("task creation preserves structured frontend user input as JSON", async () => {
  const { repository, handlers } = createHarness();
  await seedAccessCode(repository);
  const token = await registerAndLogin(handlers);
  await handlers.redeemAccessCode({ sessionToken: token, body: { code: "TIO-ABCD-1234-WXYZ" } });

  const created = await handlers.createTask({
    sessionToken: token,
    body: {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI resume optimizer",
        targetUser: "job seekers",
      },
      interactionMode: "legacy",
      providerMode: "platform",
    },
  });
  const task = await repository.getCommercialTask((created.body as TaskBody).taskId);

  assert.equal(created.status, 202);
  assert.equal(task?.scenario, "side_hustle");
  assert.deepEqual(JSON.parse(task?.userInput ?? ""), {
    type: "side_hustle",
    projectIdea: "AI resume optimizer",
    targetUser: "job seekers",
  });
});

test("task status, report, and cancel handlers use session user", async () => {
  const { repository, handlers, taskService } = createHarness();
  await seedAccessCode(repository);
  const token = await registerAndLogin(handlers);
  await handlers.redeemAccessCode({ sessionToken: token, body: { code: "TIO-ABCD-1234-WXYZ" } });
  const created = await handlers.createTask({
    sessionToken: token,
    body: {
      scenario: "side_hustle",
      userInput: "private details",
      interactionMode: "legacy",
      providerMode: "platform",
    },
  });

  const taskId = (created.body as TaskBody).taskId;
  const status = await handlers.getTaskStatus({ sessionToken: token, params: { taskId } });
  assert.equal(status.status, 200);
  assert.equal(Object.hasOwn(status.body as object, "userInput"), false);

  await taskService.markCompleted({ taskId, report: { ...sampleSimulationResponse, id: taskId } });
  const report = await handlers.getTaskReport({ sessionToken: token, params: { taskId } });
  assert.equal(report.status, 200);
  assert.equal((report.body as ReportBody).report.id, taskId);
  assert.equal((report.body as ReportBody).report.report.projectName, "Launch");

  const cancelled = await handlers.cancelTask({ sessionToken: token, params: { taskId } });
  assert.equal(cancelled.status, 200);
  assert.equal((cancelled.body as TaskBody).status, "completed");
});

test("report feedback handler requires auth and stores owner feedback", async () => {
  const { repository, handlers, taskService } = createHarness();
  await seedAccessCode(repository);
  const token = await registerAndLogin(handlers);
  await handlers.redeemAccessCode({ sessionToken: token, body: { code: "TIO-ABCD-1234-WXYZ" } });
  const created = await handlers.createTask({
    sessionToken: token,
    body: {
      scenario: "side_hustle",
      userInput: "launch",
      interactionMode: "legacy",
      providerMode: "platform",
    },
  });
  const taskId = (created.body as TaskBody).taskId;
  const completed = await taskService.markCompleted({ taskId, report: sampleReport });
  assert.ok(completed.reportId);

  const missingAuth = await handlers.handleReportFeedbackRequest({
    body: { taskId, reportId: completed.reportId, rating: 4, useful: true },
  });
  assert.equal(missingAuth.status, 401);

  const submitted = await handlers.handleReportFeedbackRequest({
    sessionToken: token,
    body: {
      taskId,
      reportId: completed.reportId,
      rating: 4,
      useful: true,
      text: "  helpful report  ",
    },
  });

  assert.equal(submitted.status, 201);
  const body = submitted.body as FeedbackBody;
  assert.equal(body.feedback.taskId, taskId);
  assert.equal(body.feedback.reportId, completed.reportId);
  assert.equal(body.feedback.rating, 4);
  assert.equal(body.feedback.useful, true);
  assert.equal(body.feedback.text, "helpful report");
});

test("admin handlers reject non-admin sessions", async () => {
  const { handlers } = createHarness();
  const token = await registerAndLogin(handlers);

  const response = await handlers.createAdminAccessCode({
    sessionToken: token,
    body: { creditAmount: 10, tier: "pro", features: [] },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: "admin_required" });
});

test("admin can create one access code", async () => {
  const { repository, authService, handlers } = createHarness();
  const adminToken = await createAdminSession(repository, authService, handlers);

  const response = await handlers.createAdminAccessCode({
    sessionToken: adminToken,
    body: {
      creditAmount: 30,
      tier: "pro",
      features: ["custom_model_provider"],
    },
  });

  assert.equal(response.status, 201);
  const body = response.body as CreatedAccessCodeBody;
  assert.match(body.accessCode.rawCode, /^TIO-/);
  assert.match(body.accessCode.maskedCode, /\*\*\*\*/);
  const stored = await repository.getAccessCode(body.accessCode.accessCodeId);
  assert.equal(stored?.creditAmount, 30);
  assert.equal((stored as { rawCode?: string } | undefined)?.rawCode, undefined);
});

test("admin can batch create access codes", async () => {
  const { repository, authService, handlers } = createHarness();
  const adminToken = await createAdminSession(repository, authService, handlers);

  const response = await handlers.createAdminAccessCodeBatch({
    sessionToken: adminToken,
    body: {
      count: 3,
      creditAmount: 12,
      tier: "basic",
      features: [],
    },
  });

  assert.equal(response.status, 201);
  const body = response.body as CreatedAccessCodeBatchBody;
  assert.equal(body.accessCodes.length, 3);
  assert.equal(new Set(body.accessCodes.map((code) => code.rawCode)).size, 3);
  for (const code of body.accessCodes) {
    assert.equal((await repository.getAccessCode(code.accessCodeId))?.status, "active");
  }
});

test("admin can disable code and list audit logs", async () => {
  const { repository, authService, handlers } = createHarness();
  const adminToken = await createAdminSession(repository, authService, handlers);
  const created = await handlers.createAdminAccessCode({
    sessionToken: adminToken,
    body: { creditAmount: 10, tier: "basic", features: [] },
  });
  const accessCodeId = (created.body as CreatedAccessCodeBody).accessCode.accessCodeId;

  const disabled = await handlers.disableAdminAccessCode({
    sessionToken: adminToken,
    params: { accessCodeId },
    body: { reason: "leaked" },
  });
  assert.equal(disabled.status, 200);
  assert.equal((await repository.getAccessCode(accessCodeId))?.status, "disabled");

  const logs = await handlers.listAdminAuditLogs({ sessionToken: adminToken });
  assert.equal(logs.status, 200);
  assert.equal((logs.body as AuditLogsBody).auditLogs.at(-1)?.action, "access_code.disabled");
});

test("admin can adjust credits", async () => {
  const { repository, authService, handlers } = createHarness();
  const adminToken = await createAdminSession(repository, authService, handlers);
  const userToken = await registerAndLogin(handlers);
  const user = (await handlers.me({ sessionToken: userToken })).body.user;
  assert.ok(user);

  const response = await handlers.adjustAdminCredits({
    sessionToken: adminToken,
    body: {
      userId: user.id,
      amount: 9,
      reason: "beta grant",
    },
  });

  assert.equal(response.status, 200);
  assert.equal((response.body as BalanceBody).balance, 9);
  assert.equal((await repository.getCreditAccount(user.id))?.balance, 9);
});
