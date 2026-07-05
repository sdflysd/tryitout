import assert from "node:assert/strict";
import test from "node:test";

import { buildPaywallClickEvent, buildPaywallLeadEvent, getDeepReportPaywallCopy } from "./paywall-copy.js";
import type { Simulation } from "../types.js";

const simulation = {
  id: "sim_1",
  type: "side_hustle",
  userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
} as Simulation;

test("getDeepReportPaywallCopy returns scenario-specific deep report copy", () => {
  assert.match(getDeepReportPaywallCopy("dating").title, /完整情感沙盘/);
  assert.match(getDeepReportPaywallCopy("life_choice").title, /完整抉择沙盘/);
  assert.match(getDeepReportPaywallCopy("side_hustle").title, /完整搞钱沙盘/);
});

test("paywall event builders include price and contact", () => {
  assert.deepEqual(buildPaywallClickEvent(simulation, "9.9"), {
    type: "paywall_clicked",
    simulationId: "sim_1",
    scenarioType: "side_hustle",
    priceIntent: "9.9",
  });
  assert.deepEqual(buildPaywallLeadEvent(simulation, "9.9", "wechat-id"), {
    type: "paywall_lead_submitted",
    simulationId: "sim_1",
    scenarioType: "side_hustle",
    priceIntent: "9.9",
    contact: "wechat-id",
  });
});
