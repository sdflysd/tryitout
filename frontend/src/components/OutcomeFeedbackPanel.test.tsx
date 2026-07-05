import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import OutcomeFeedbackPanel, {
  buildOutcomeFeedbackEvent,
  limitOutcomeFeedbackNote,
} from "./OutcomeFeedbackPanel.js";
import type { Simulation } from "../types.js";

test("outcome feedback panel renders adoption and outcome choices", () => {
  const html = renderToStaticMarkup(
    <OutcomeFeedbackPanel simulation={makeSimulation()} />,
  );

  assert.match(html, /已按建议执行/);
  assert.match(html, /部分采纳/);
  assert.match(html, /暂未采纳/);
  assert.match(html, /变好了/);
  assert.match(html, /差不多/);
  assert.match(html, /更糟了/);
  assert.match(html, /还没发生/);
  assert.match(html, /真实结果方向/);
  assert.doesNotMatch(html, /partially_adopted|not_yet|better|neutral|worse/);
});

test("buildOutcomeFeedbackEvent uses safe outcome fields", () => {
  assert.deepEqual(
    buildOutcomeFeedbackEvent(makeSimulation(), {
      adoptedRecommendation: "partially_adopted",
      outcomeCategory: "better",
      contact: " user@example.test ",
      note: "x".repeat(400),
    }),
    {
      type: "simulation_outcome_feedback",
      simulationId: "sim-outcome",
      scenarioType: "side_hustle",
      adoptedRecommendation: "partially_adopted",
      outcomeCategory: "better",
      contact: "user@example.test",
      text: "x".repeat(240),
    },
  );
});

test("limitOutcomeFeedbackNote caps optional note", () => {
  assert.equal(limitOutcomeFeedbackNote("a".repeat(300)).length, 240);
});

function makeSimulation(): Simulation {
  return {
    id: "sim-outcome",
    type: "side_hustle",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化" },
    agents: [],
    stages: [],
    createdAt: "2026-07-05T00:00:00.000Z",
    report: {
      projectName: "AI 简历优化",
      successProbability: 50,
      expectedRevenue: "100 元",
      riskLevel: "medium",
      finalRecommendation: "先小测。",
      scores: {
        demandStrength: 60,
        willingnessToPay: 50,
        acquisitionDifficulty: 40,
        competitionPressure: 50,
        executionFit: 70,
        monetizationClarity: 55,
      },
      finalOutcome: "可小测",
      opportunities: [],
      risks: [],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small",
    },
  };
}
