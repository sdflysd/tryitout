import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedbackEvent,
  buildReportViewedEvent,
  createReportViewedTracker,
} from "./report-feedback.js";
import type { Simulation } from "../types.js";

const simulation = {
  id: "sim_1",
  type: "dating",
  userInput: { type: "dating", chatLogOrIssue: "TA 冷淡了" },
  agents: [],
  stages: [],
  createdAt: "2026-06-30T00:00:00.000Z",
  report: {
    projectName: "冷淡破冰",
    successProbability: 66,
    expectedRevenue: "关系缓和",
    riskLevel: "medium",
    finalRecommendation: "先降压",
    scores: {
      demandStrength: 60,
      willingnessToPay: 50,
      acquisitionDifficulty: 40,
      competitionPressure: 55,
      executionFit: 70,
      monetizationClarity: 50,
    },
    finalOutcome: "缓和",
    opportunities: [],
    risks: [],
    pivotSuggestions: [],
    actionPlan7Days: [],
    shouldDo: "test_small",
  },
} satisfies Simulation;

test("buildFeedbackEvent includes simulation id and selected answers", () => {
  assert.deepEqual(
    buildFeedbackEvent(simulation, {
      rating: "准",
      usefulness: "有用",
      price: "9.9",
      text: "很像我的情况",
    }),
    {
      type: "feedback_submitted",
      simulationId: "sim_1",
      scenarioType: "dating",
      rating: "准",
      usefulness: "有用",
      priceIntent: "9.9",
      text: "很像我的情况",
    },
  );
});

test("buildReportViewedEvent creates a report_viewed event", () => {
  assert.deepEqual(buildReportViewedEvent(simulation), {
    type: "report_viewed",
    simulationId: "sim_1",
    scenarioType: "dating",
  });
});

test("createReportViewedTracker only allows a report id once", () => {
  const tracker = createReportViewedTracker();

  assert.equal(tracker.shouldPost(simulation), true);
  assert.equal(tracker.shouldPost(simulation), false);
  assert.equal(
    tracker.shouldPost({ ...simulation, id: "sim_2" }),
    true,
  );
});
