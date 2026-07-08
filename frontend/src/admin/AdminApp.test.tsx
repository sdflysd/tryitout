import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminApp from "./AdminApp.js";
import { AdminClientError, fetchAdminOverview } from "./admin-client.js";
import type { AdminOverviewDto } from "./admin-client.js";

test("AdminApp renders platform operations navigation", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialLanguage="en-US" />,
  );

  for (const label of [
    "Overview",
    "Users",
    "Access Codes",
    "Credits",
    "Tasks",
    "Queue",
    "Costs",
    "Feedback",
    "Settings",
    "Audit Logs",
  ]) {
    assert.match(html, new RegExp(label));
  }
});

test("AdminApp defaults the full admin shell to Chinese", () => {
  const html = renderToStaticMarkup(<AdminApp overview={makeOverview()} />);

  for (const text of [
    "平台控制中心",
    "概览",
    "用户",
    "访问码",
    "商业模式监控中",
    "队列积压",
    "总用户数",
    "近期失败",
    "兑换监控",
    "保护付费执行",
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /btn-admin-toggle-language/);
  assert.match(html, /aria-label="Switch language to English"/);
});

test("AdminApp can render the admin shell in English", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialLanguage="en-US" />,
  );

  assert.match(html, /Platform Control Center/);
  assert.match(html, /Overview/);
  assert.match(html, /Commercial mode monitored/);
  assert.match(html, /Total Users/);
  assert.match(html, />中</);
});

test("AdminApp renders supplied operating metrics and monitoring tables", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialLanguage="en-US" />,
  );

  assert.match(html, /156/);
  assert.match(html, /42/);
  assert.match(html, /18\.75%/);
  assert.match(html, /¥128\.42/);
  assert.match(html, /Queue Backlog/);
  assert.match(html, /Active Weight/);
  assert.match(html, /Stuck Tasks/);
  assert.match(html, /Recent Failures/);
  assert.match(html, /High Cost Tasks/);
  assert.match(html, /Redemption Watch/);
});

test("AdminApp can render an operations shell before overview data loads", () => {
  const html = renderToStaticMarkup(<AdminApp initialLanguage="en-US" />);

  assert.match(html, /admin-app-shell/);
  assert.match(html, /Loading live metrics/);
});

test("AdminApp renders a login callout when the admin session is missing", () => {
  const html = renderToStaticMarkup(
    <AdminApp
      initialLoadError={new AdminClientError(
        401,
        "Authentication required",
        "authentication_required",
      )}
    />,
  );

  assert.match(html, /请先登录管理员账号/);
  assert.match(html, /href="\/login"/);
  assert.match(html, /去登录/);
});

test("AdminApp can render the access-code operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp
      overview={makeOverview()}
      initialView="Access Codes"
      initialLanguage="en-US"
    />,
  );

  assert.match(html, /Access Code Operations/);
  assert.match(html, /Generate copyable raw codes/);
});

test("AdminApp can render the user operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp
      overview={makeOverview()}
      initialView="Users"
      initialLanguage="en-US"
    />,
  );

  assert.match(html, /User Operations/);
  assert.match(html, /Credit Adjustment/);
});

test("AdminApp can render the task operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp
      overview={makeOverview()}
      initialView="Tasks"
      initialLanguage="en-US"
    />,
  );

  assert.match(html, /Task Operations/);
  assert.match(html, /Step Cost Table/);
});

test("AdminApp can render the cost operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp
      overview={makeOverview()}
      initialView="Costs"
      initialLanguage="en-US"
    />,
  );

  assert.match(html, /Cost Operations/);
  assert.match(html, /Success \/ Failure/);
});

test("admin client fetches overview with credentials included", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ overview: makeOverview() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const overview = await fetchAdminOverview();
    assert.equal(overview.users.total, 156);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/admin/overview");
  assert.equal(calls[0]?.init?.credentials, "include");
});

function makeOverview(): AdminOverviewDto {
  return {
    users: {
      total: 156,
      active: 144,
      disabled: 12,
      redeemed: 42,
    },
    tasks: {
      total: 384,
      byStatus: {
        queued: 9,
        running: 3,
        completed: 300,
        failed: 72,
        cancelled: 0,
        refunded: 0,
      },
      completionRate: 0.78125,
      failureRate: 0.1875,
    },
    credits: {
      totalBalance: 928,
      totalFrozen: 21,
      totalRedeemed: 1400,
      consumed: 451,
    },
    costs: {
      estimatedTotal: 128.42,
    },
    queue: {
      backlog: 12,
      queued: 9,
      running: 3,
      retrying: 2,
      stuck: 1,
      activeWeight: 5,
      maxWeight: 12,
      oldestQueuedAt: "2026-07-07T00:20:00.000Z",
    },
    accessCodes: {
      total: 500,
      active: 320,
      redeemed: 150,
      disabled: 30,
      expired: 0,
    },
  };
}
