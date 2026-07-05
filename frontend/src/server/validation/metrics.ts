import type { ValidationEvent } from "./event-store.js";

function count(events: ValidationEvent[], type: ValidationEvent["type"]): number {
  return events.filter((event) => event.type === type).length;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

export function summarizeValidationEvents(events: ValidationEvent[]): {
  inputStartedCount: number;
  simulationRequestedCount: number;
  simulationCompletedCount: number;
  simulationFailedCount: number;
  reportViewedCount: number;
  feedbackCount: number;
  paywallClickCount: number;
  paywallLeadCount: number;
  shareClickCount: number;
  shareCardOpenedCount: number;
  deepModeRequestCount: number;
  routeComparisonViewedCount: number;
  deepReportUnlockIntentCount: number;
  outcomeFeedbackCount: number;
  completionRate: number;
  reportViewRate: number;
  feedbackRate: number;
  shareRate: number;
  paywallClickRate: number;
  paywallLeadRate: number;
  deepRequestRate: number;
  deepAvailableRate: number;
  fallbackRate: number;
  unlockIntentRate: number;
  routeComparisonViewRate: number;
  outcomeFeedbackReturnRate: number;
  priceIntentCounts: Record<string, number>;
} {
  const inputStartedCount = count(events, "input_started");
  const simulationRequestedCount = count(events, "simulation_requested");
  const simulationCompletedCount = count(events, "simulation_completed");
  const simulationFailedCount = count(events, "simulation_failed");
  const reportViewedCount = count(events, "report_viewed");
  const feedbackCount = count(events, "feedback_submitted");
  const paywallClickCount = count(events, "paywall_clicked");
  const paywallLeadCount = count(events, "paywall_lead_submitted");
  const shareClickCount = count(events, "share_clicked");
  const shareCardOpenedCount = count(events, "share_card_opened");
  const deepModeRequestCount = count(events, "deep_mode_requested");
  const routeComparisonViewedCount = count(events, "route_comparison_viewed");
  const deepReportUnlockIntentCount = count(events, "deep_report_unlock_intent");
  const outcomeFeedbackCount = count(events, "simulation_outcome_feedback");
  const priceIntentCounts: Record<string, number> = {};
  const deepRequestedCount = events.filter((event) => event.deepModeRequested).length;
  const deepAvailableCount = events.filter((event) => event.type === "simulation_completed" && event.deepModeAvailable).length;
  const fallbackCount = events.filter(
    (event) => event.type === "simulation_completed" && (event.fallbackStageCount ?? 0) > 0,
  ).length;

  for (const event of events) {
    if (event.priceIntent) {
      priceIntentCounts[event.priceIntent] = (priceIntentCounts[event.priceIntent] ?? 0) + 1;
    }
  }

  return {
    inputStartedCount,
    simulationRequestedCount,
    simulationCompletedCount,
    simulationFailedCount,
    reportViewedCount,
    feedbackCount,
    paywallClickCount,
    paywallLeadCount,
    shareClickCount,
    shareCardOpenedCount,
    deepModeRequestCount,
    routeComparisonViewedCount,
    deepReportUnlockIntentCount,
    outcomeFeedbackCount,
    completionRate: ratio(simulationCompletedCount, simulationRequestedCount),
    reportViewRate: ratio(reportViewedCount, simulationCompletedCount),
    feedbackRate: ratio(feedbackCount, reportViewedCount),
    shareRate: ratio(shareClickCount, reportViewedCount),
    paywallClickRate: ratio(paywallClickCount, reportViewedCount),
    paywallLeadRate: ratio(paywallLeadCount, paywallClickCount),
    deepRequestRate: ratio(deepRequestedCount, simulationRequestedCount),
    deepAvailableRate: ratio(deepAvailableCount, simulationCompletedCount),
    fallbackRate: ratio(fallbackCount, simulationCompletedCount),
    unlockIntentRate: ratio(deepReportUnlockIntentCount, reportViewedCount),
    routeComparisonViewRate: ratio(routeComparisonViewedCount, reportViewedCount),
    outcomeFeedbackReturnRate: ratio(outcomeFeedbackCount, reportViewedCount),
    priceIntentCounts,
  };
}
