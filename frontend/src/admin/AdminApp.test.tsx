import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminApp from "./AdminApp.js";
import { fetchAdminOverview } from "./admin-client.js";
import type { AdminOverviewDto } from "./admin-client.js";

test("AdminApp renders platform operations navigation", () => {
  const html = renderToStaticMarkup(<AdminApp overview={makeOverview()} />);

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

test("AdminApp renders supplied operating metrics and monitoring tables", () => {
  const html = renderToStaticMarkup(<AdminApp overview={makeOverview()} />);

  assert.match(html, /156/);
  assert.match(html, /42/);
  assert.match(html, /18\.75%/);
  assert.match(html, /¥128\.42/);
  assert.match(html, /Queue Backlog/);
  assert.match(html, /Recent Failures/);
  assert.match(html, /High Cost Tasks/);
  assert.match(html, /Redemption Watch/);
});

test("AdminApp can render an operations shell before overview data loads", () => {
  const html = renderToStaticMarkup(<AdminApp />);

  assert.match(html, /admin-app-shell/);
  assert.match(html, /Loading live metrics/);
});

test("AdminApp can render the access-code operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialView="Access Codes" />,
  );

  assert.match(html, /Access Code Operations/);
  assert.match(html, /Generate copyable raw codes/);
});

test("AdminApp can render the user operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialView="Users" />,
  );

  assert.match(html, /User Operations/);
  assert.match(html, /Credit Adjustment/);
});

test("AdminApp can render the task operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialView="Tasks" />,
  );

  assert.match(html, /Task Operations/);
  assert.match(html, /Step Cost Table/);
});

test("AdminApp can render the cost operations view", () => {
  const html = renderToStaticMarkup(
    <AdminApp overview={makeOverview()} initialView="Costs" />,
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
