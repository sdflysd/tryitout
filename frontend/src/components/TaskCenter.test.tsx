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

test("TaskCenter renders readable task titles and folds long task lists", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "task_1", displayTitle: "AI 简历优化小程序" }),
        makeTask({ simulationId: "task_2", displayTitle: "冷战三天后的破冰沟通" }),
        makeTask({ simulationId: "task_3", displayTitle: "考公考研还是直接工作" }),
        makeTask({ simulationId: "task_4", displayTitle: "小红书穿搭账号" }),
        makeTask({ simulationId: "task_5", displayTitle: "闲鱼虚拟资料项目" }),
        makeTask({ simulationId: "task_6", displayTitle: "不应默认露出的第六个任务" }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
      onDelete={() => undefined}
    />,
  );

  assert.match(html, /AI 简历优化小程序/);
  assert.match(html, /task_1/);
  assert.match(html, /btn-task-center-toggle/);
  assert.match(html, /展开全部/);
  assert.doesNotMatch(html, /不应默认露出的第六个任务/);
});

test("TaskCenter lets cancelled tasks continue or delete without opening failed progress", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({
          simulationId: "cancelled_1",
          status: "cancelled",
          progressPercent: 90,
          recoverable: true,
          displayTitle: "被取消但可继续的报告",
        }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
      onDelete={() => undefined}
    />,
  );

  assert.match(html, /task-center-row-cancelled_1/);
  assert.match(html, /btn-task-retry-cancelled_1/);
  assert.match(html, />继续</);
  assert.match(html, /btn-task-delete-cancelled_1/);
  assert.doesNotMatch(html, /btn-task-progress-cancelled_1/);
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

test("TaskCenter does not expose terminal actions for paused task rows", () => {
  const html = renderToStaticMarkup(
    <TaskCenter
      tasks={[
        makeTask({ simulationId: "paused_1", status: "paused", recoverable: false }),
      ]}
      language="zh-CN"
      onViewProgress={() => undefined}
      onRetry={() => undefined}
      onCancel={() => undefined}
      onViewReport={() => undefined}
    />,
  );

  assert.match(html, /task-center-row-paused_1/);
  assert.match(html, /btn-task-progress-paused_1/);
  assert.doesNotMatch(html, /btn-task-cancel-paused_1/);
  assert.doesNotMatch(html, /btn-task-report-paused_1/);
  assert.doesNotMatch(html, /btn-task-retry-paused_1/);
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
