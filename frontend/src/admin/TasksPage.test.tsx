import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TasksPage from "./TasksPage.js";
import type { AdminTaskRowDto } from "./admin-client.js";

test("TasksPage renders task operations table and task detail timeline", () => {
  const html = renderToStaticMarkup(<TasksPage tasks={[makeTask()]} />);

  for (const text of [
    "Task ID",
    "User",
    "Scenario",
    "Mode",
    "Status",
    "Queue Wait",
    "Run Duration",
    "Credits",
    "Tokens",
    "Cost",
    "Error",
    "Worker",
    "Timeline",
    "Step Cost Table",
    "model_timeout",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

function makeTask(): AdminTaskRowDto {
  return {
    id: "task_1",
    userEmail: "alice@example.test",
    scenarioType: "life_choice",
    interactionMode: "enabled",
    providerMode: "platform",
    status: "failed",
    queueWaitMs: 4200,
    runDurationMs: 98200,
    credits: 3,
    promptTokens: 1400,
    completionTokens: 900,
    estimatedCost: 0.42,
    errorCode: "model_timeout",
    workerId: "worker_a",
    timeline: [
      { label: "Queued", at: "2026-07-07T00:00:00.000Z" },
      { label: "Running", at: "2026-07-07T00:00:04.200Z" },
      { label: "Failed", at: "2026-07-07T00:01:42.400Z" },
    ],
    stepCosts: [
      {
        stepName: "generate_report",
        provider: "openai",
        modelId: "gpt-5-mini",
        tokens: 2300,
        estimatedCost: 0.42,
        status: "failed",
      },
    ],
  };
}
