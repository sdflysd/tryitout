import assert from "node:assert/strict";
import test from "node:test";

import {
  createCommercialApiHandlers,
  type CommercialApiServices,
} from "./commercial-api.js";
import { hashAccessCode, maskAccessCode } from "./access-codes.js";
import { CommercialAuthService } from "./auth-service.js";
import { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { CreditService } from "./credit-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { InMemorySimulationQueue } from "./simulation-queue.js";
import type { CommercialRepository } from "./repository.js";
import type { Report } from "../../types.js";

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

interface BalanceBody {
  balance: number;
}

interface TaskBody {
  taskId: string;
  status: string;
}

interface ReportBody {
  report: Report;
}

function createHarness(): {
  repository: InMemoryCommercialRepository;
  handlers: ReturnType<typeof createCommercialApiHandlers>;
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
  };
  return {
    repository,
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

  await taskService.markCompleted({ taskId, report: sampleReport });
  const report = await handlers.getTaskReport({ sessionToken: token, params: { taskId } });
  assert.equal(report.status, 200);
  assert.equal((report.body as ReportBody).report.projectName, "Launch");

  const cancelled = await handlers.cancelTask({ sessionToken: token, params: { taskId } });
  assert.equal(cancelled.status, 200);
  assert.equal((cancelled.body as TaskBody).status, "completed");
});
