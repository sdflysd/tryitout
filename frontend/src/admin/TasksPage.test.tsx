import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TasksPage from "./TasksPage.js";
import { fetchAdminTasks } from "./admin-client.js";
import type { AdminTaskRowDto } from "./admin-client.js";

test("TasksPage renders task operations table and task detail timeline", () => {
  const html = renderToStaticMarkup(
    <TasksPage tasks={[makeTask()]} language="en-US" />,
  );

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

test("TasksPage renders a live loading state before fetched tasks arrive", () => {
  const html = renderToStaticMarkup(
    <TasksPage fetchTasks={async () => [makeTask()]} />,
  );

  assert.match(html, /Loading commercial tasks/);
});

test("admin client fetches task operations rows with credentials", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const tasks = await fetchAdminTasks((async (input, init) => {
    calls.push({ input, init });
    return jsonResponse({ tasks: [makeTask()] });
  }) as typeof fetch);

  assert.equal(tasks[0]?.id, "task_1");
  assert.equal(tasks[0]?.workerId, "worker_a");
  assert.equal(calls[0]?.input, "/api/admin/tasks");
  assert.equal(calls[0]?.init?.credentials, "include");
});

test("TasksPage renders Chinese operator copy", () => {
  const html = renderToStaticMarkup(
    <TasksPage tasks={[makeTask()]} language="zh-CN" />,
  );

  for (const text of [
    "任务运营",
    "任务 ID",
    "用户",
    "场景",
    "模式",
    "状态",
    "排队等待",
    "运行时长",
    "时间线",
    "步骤成本表",
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
