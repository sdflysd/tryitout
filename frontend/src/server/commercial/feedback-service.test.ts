import assert from "node:assert/strict";
import test from "node:test";

import {
  FeedbackService,
  FeedbackServiceError,
} from "./feedback-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import type { UserFeedbackRecord } from "./types.js";
import type { Report } from "../../types.js";

const now = new Date("2026-07-06T12:00:00.000Z");
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

class CapturingRepository extends InMemoryCommercialRepository {
  readonly capturedFeedback: UserFeedbackRecord[] = [];

  override async appendUserFeedback(feedback: UserFeedbackRecord): Promise<void> {
    this.capturedFeedback.push(feedback);
    await super.appendUserFeedback(feedback);
  }
}

async function seedCompletedTask(
  repository: InMemoryCommercialRepository,
  options: { userId?: string; taskId?: string; reportId?: string } = {},
): Promise<void> {
  const userId = options.userId ?? "user_1";
  const taskId = options.taskId ?? "task_1";
  const reportId = options.reportId ?? "report_1";
  await repository.saveUser({
    id: userId,
    email: `${userId}@tryitout.ai`,
    passwordHash: "hash",
    tier: "basic",
    features: [],
    isAdmin: false,
    disabledAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveCommercialTask({
    id: taskId,
    userId,
    status: "completed",
    scenario: "side_hustle",
    userInput: "private details",
    interactionMode: "legacy",
    providerMode: "platform",
    creditCost: 1,
    creditHoldLedgerEntryId: "ledger_hold",
    creditCapturedLedgerEntryId: "ledger_capture",
    creditReleasedLedgerEntryId: undefined,
    queueJobId: "job_1",
    reportId,
    errorCode: undefined,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveSimulationReport({
    id: reportId,
    taskId,
    userId,
    report: sampleReport,
    createdAt: now,
  });
}

test("authenticated task owner can submit report feedback", async () => {
  const repository = new CapturingRepository();
  await seedCompletedTask(repository);
  const service = new FeedbackService(repository, { now: () => now });

  const feedback = await service.submitFeedback({
    userId: "user_1",
    taskId: "task_1",
    reportId: "report_1",
    rating: 5,
    useful: true,
    text: "  useful signal  ",
  });

  assert.equal(feedback.userId, "user_1");
  assert.equal(feedback.taskId, "task_1");
  assert.equal(feedback.reportId, "report_1");
  assert.equal(feedback.rating, 5);
  assert.equal(feedback.useful, true);
  assert.equal(feedback.text, "useful signal");
  assert.equal(feedback.createdAt, now);
  assert.equal(repository.capturedFeedback.length, 1);
});

test("feedback text is trimmed and capped", async () => {
  const repository = new CapturingRepository();
  await seedCompletedTask(repository);
  const service = new FeedbackService(repository, { now: () => now, textLimit: 12 });

  const feedback = await service.submitFeedback({
    userId: "user_1",
    taskId: "task_1",
    reportId: "report_1",
    rating: 4,
    useful: false,
    text: `  ${"a".repeat(20)}  `,
  });

  assert.equal(feedback.text, "a".repeat(12));
});

test("invalid ratings are rejected", async () => {
  const repository = new CapturingRepository();
  await seedCompletedTask(repository);
  const service = new FeedbackService(repository, { now: () => now });

  await assert.rejects(
    service.submitFeedback({
      userId: "user_1",
      taskId: "task_1",
      reportId: "report_1",
      rating: 6,
      useful: true,
      text: "too high",
    }),
    new FeedbackServiceError("invalid_rating", "Rating must be an integer from 1 to 5."),
  );
});

test("feedback must link to the task owner and matching report", async () => {
  const repository = new CapturingRepository();
  await seedCompletedTask(repository, { userId: "owner_1", taskId: "task_1", reportId: "report_1" });
  await seedCompletedTask(repository, { userId: "owner_2", taskId: "task_2", reportId: "report_2" });
  const service = new FeedbackService(repository, { now: () => now });

  await assert.rejects(
    service.submitFeedback({
      userId: "owner_2",
      taskId: "task_1",
      reportId: "report_1",
      rating: 4,
      useful: true,
    }),
    new FeedbackServiceError("task_not_found", "Task was not found."),
  );

  await assert.rejects(
    service.submitFeedback({
      userId: "owner_1",
      taskId: "task_1",
      reportId: "report_2",
      rating: 4,
      useful: true,
    }),
    new FeedbackServiceError("report_not_found", "Report was not found."),
  );
});
