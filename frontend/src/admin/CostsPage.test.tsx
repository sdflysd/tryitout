import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CostsPage from "./CostsPage.js";
import type { AdminCostSummaryDto } from "./admin-client.js";

test("CostsPage groups cost by provider, model, step, task, and outcome", () => {
  const html = renderToStaticMarkup(<CostsPage summary={makeSummary()} />);

  for (const text of [
    "Provider",
    "Model",
    "Step",
    "Task",
    "Success / Failure",
    "openai",
    "gpt-5-mini",
    "generate_report",
    "task_1",
    "failed",
    "¥18.72",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

function makeSummary(): AdminCostSummaryDto {
  return {
    totalEstimatedCost: 18.72,
    providerGroups: [{ key: "openai", cost: 10.5, tokens: 92000 }],
    modelGroups: [{ key: "gpt-5-mini", cost: 8.22, tokens: 68000 }],
    stepGroups: [{ key: "generate_report", cost: 4.2, tokens: 23000 }],
    taskGroups: [{ key: "task_1", cost: 0.42, tokens: 2300 }],
    outcomeGroups: [
      { key: "completed", cost: 14.52, tokens: 89000 },
      { key: "failed", cost: 4.2, tokens: 26000 },
    ],
  };
}
