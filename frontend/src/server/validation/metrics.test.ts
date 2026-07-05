import assert from "node:assert/strict";
import test from "node:test";

import { summarizeValidationEvents } from "./metrics.js";

test("summarizeValidationEvents counts funnel events and rates", () => {
  const summary = summarizeValidationEvents([
    { type: "input_started" },
    { type: "simulation_requested" },
    { type: "simulation_completed" },
    { type: "report_viewed" },
    { type: "feedback_submitted", rating: "准", usefulness: "有用", priceIntent: "9.9" },
    { type: "paywall_clicked", priceIntent: "9.9" },
    { type: "paywall_lead_submitted", priceIntent: "9.9" },
    { type: "share_clicked" },
    { type: "deep_mode_requested" },
  ]);

  assert.equal(summary.inputStartedCount, 1);
  assert.equal(summary.simulationRequestedCount, 1);
  assert.equal(summary.simulationCompletedCount, 1);
  assert.equal(summary.reportViewedCount, 1);
  assert.equal(summary.feedbackCount, 1);
  assert.equal(summary.paywallClickCount, 1);
  assert.equal(summary.paywallLeadCount, 1);
  assert.equal(summary.shareClickCount, 1);
  assert.equal(summary.deepModeRequestCount, 1);
  assert.equal(summary.completionRate, 1);
  assert.equal(summary.feedbackRate, 1);
  assert.deepEqual(summary.priceIntentCounts, { "9.9": 3 });
});

test("summarizeValidationEvents reports agent sandbox validation metrics", () => {
  const summary = summarizeValidationEvents([
    { type: "simulation_requested", deepModeRequested: true },
    { type: "simulation_requested", deepModeRequested: false },
    { type: "simulation_completed", deepModeAvailable: true, fallbackStageCount: 1 },
    { type: "simulation_completed", deepModeAvailable: false, fallbackStageCount: 0 },
    { type: "report_viewed" },
    { type: "report_viewed" },
    { type: "deep_report_unlock_intent" },
    { type: "route_comparison_viewed" },
    { type: "simulation_outcome_feedback" },
  ]);

  assert.equal(summary.deepRequestRate, 0.5);
  assert.equal(summary.deepAvailableRate, 0.5);
  assert.equal(summary.fallbackRate, 0.5);
  assert.equal(summary.unlockIntentRate, 0.5);
  assert.equal(summary.routeComparisonViewRate, 0.5);
  assert.equal(summary.outcomeFeedbackReturnRate, 0.5);
});
