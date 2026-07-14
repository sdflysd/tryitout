import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TaskCenter from "./TaskCenter.js";
import type { SimulationTaskStatusResponse } from "../contracts/simulation-task.js";

function makeTask(
  overrides: Partial<SimulationTaskStatusResponse> = {},
): SimulationTaskStatusResponse {
  return {
    simulationId: "task_1",
    scenarioType: "side_hustle",
    mode: "enabled",
    status: "queued",
    progressPercent: 0,
    recoverable: false,
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

test("TaskCenter renders retry actions for queued and recoverable tasks", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "queued_1", status: "queued" }),
        makeTask({ simulationId: "recoverable_1", status: "recoverable_failed", recoverable: true }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /我的任务/);
  assert.match(html, /task-center-row-queued_1/);
  assert.match(html, /btn-task-retry-queued_1/);
  assert.match(html, /btn-task-retry-recoverable_1/);
});

test("TaskCenter exposes report actions for completed tasks and cancel actions for running tasks", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "completed_1", status: "completed", progressPercent: 100 }),
        makeTask({ simulationId: "running_1", status: "running", progressPercent: 42 }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /task-center-row-completed_1/);
  assert.match(html, /btn-task-report-completed_1/);
  assert.match(html, /task-center-row-running_1/);
  assert.match(html, /btn-task-cancel-running_1/);
});

test("TaskCenter renders nothing when there is no visible task state", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.equal(html, "");
});
