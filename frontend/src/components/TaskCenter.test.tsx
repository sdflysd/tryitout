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
  assert.doesNotMatch(html, /btn-task-cancel-completed_1/);
  assert.doesNotMatch(html, /btn-task-retry-completed_1/);
  assert.match(html, /task-center-row-running_1/);
  assert.match(html, /btn-task-cancel-running_1/);
  assert.doesNotMatch(html, /btn-task-report-running_1/);
  assert.doesNotMatch(html, /btn-task-retry-running_1/);
});

test("TaskCenter does not expose retry for non-recoverable failed task rows", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "failed_1", status: "failed", recoverable: false }),
        makeTask({ simulationId: "not_recoverable_1", status: "recoverable_failed", recoverable: false }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /task-center-row-failed_1/);
  assert.match(html, /task-center-row-not_recoverable_1/);
  assert.doesNotMatch(html, /btn-task-retry-failed_1/);
  assert.doesNotMatch(html, /btn-task-retry-not_recoverable_1/);
  assert.doesNotMatch(html, /btn-task-report-failed_1/);
  assert.doesNotMatch(html, /btn-task-cancel-failed_1/);
});

test("TaskCenter uses task-specific accessible labels for actions and progress", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "queued_1", status: "queued", progressPercent: 5 }),
        makeTask({ simulationId: "running_1", status: "running", progressPercent: 42 }),
        makeTask({ simulationId: "completed_1", status: "completed", progressPercent: 100 }),
      ]}
      language="en-US"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /id="btn-task-progress-queued_1"[^>]*aria-label="View progress queued_1"[^>]*title="View progress queued_1"/);
  assert.match(html, /id="btn-task-retry-queued_1"[^>]*aria-label="Retry task queued_1"[^>]*title="Retry task queued_1"/);
  assert.match(html, /id="btn-task-cancel-running_1"[^>]*aria-label="Cancel task running_1"[^>]*title="Cancel task running_1"/);
  assert.match(html, /id="btn-task-report-completed_1"[^>]*aria-label="View report completed_1"[^>]*title="View report completed_1"/);
  assert.match(html, /role="progressbar"[^>]*aria-label="Task progress queued_1"/);
  assert.match(html, /role="progressbar"[^>]*aria-label="Task progress running_1"/);
  assert.match(html, /role="progressbar"[^>]*aria-label="Task progress completed_1"/);
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

test("TaskCenter wraps long error strings inside the error banner", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[]}
      error="provider_timeout_with_a_very_long_unbroken_error_identifier_that_should_not_overflow_the_task_center_shell"
      language="en-US"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /Unable to load/);
  assert.match(html, /provider_timeout_with_a_very_long_unbroken_error_identifier/);
  assert.match(html, /min-w-0/);
  assert.match(html, /break-words/);
});
