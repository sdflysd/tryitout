import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import UsersPage from "./UsersPage.js";
import {
  adjustAdminUserCredits,
  type AdminCreditOperationsDto,
  fetchAdminCreditOperations,
  fetchAdminUsers,
} from "./admin-client.js";
import type { AdminUserRowDto } from "./admin-client.js";

test("UsersPage renders user, credit, redemption, task, and activity controls", () => {
  const html = renderToStaticMarkup(
    <UsersPage users={[makeUser()]} language="en-US" />,
  );

  assert.match(html, /Accounts, credit health, redemption source, and task reliability/);
  assert.doesNotMatch(html, /Commercial accounts/);

  for (const text of [
    "Email",
    "Status",
    "Tier",
    "Available",
    "Frozen",
    "Redeemed Batches",
    "Tasks",
    "Completed",
    "Failed",
    "Recent Activity",
    "alice@example.test",
    "Credit Adjustment",
    "Confirm adjustment",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("UsersPage renders a live loading state before fetched users arrive", () => {
  const html = renderToStaticMarkup(
    <UsersPage fetchUsers={async () => [makeUser()]} />,
  );

  assert.match(html, /Loading commercial users/);
});

test("UsersPage renders Chinese operator copy", () => {
  const html = renderToStaticMarkup(
    <UsersPage users={[makeUser()]} language="zh-CN" />,
  );

  assert.match(html, /账号、额度健康、兑换来源和任务可靠性/);
  assert.doesNotMatch(html, /商业账号/);

  for (const text of [
    "用户运营",
    "邮箱",
    "状态",
    "等级",
    "可用额度",
    "冻结额度",
    "已兑换批次",
    "近期活动",
    "额度调整",
    "确认调整",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("admin client adjusts user credits through the admin endpoint", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse({
      account: {
        userId: "user_1",
        balance: 52,
        frozenCredits: 3,
        totalRedeemed: 100,
        totalCaptured: 48,
        updatedAt: "2026-07-07T00:20:00.000Z",
      },
      ledger: {
        id: "credit_ledger_1",
        userId: "user_1",
        entryType: "adjustment",
        amount: 10,
        balanceAfter: 52,
        frozenAfter: 3,
        idempotencyKey: "support-ticket-1",
        reason: "paid support grant",
        metadata: {},
        createdAt: "2026-07-07T00:20:00.000Z",
      },
    });
  };

  try {
    const result = await adjustAdminUserCredits("user_1", {
      amount: 10,
      reason: "paid support grant",
      idempotencyKey: "support-ticket-1",
    });

    assert.equal(result.account.balance, 52);
    assert.equal(result.ledger.entryType, "adjustment");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/admin/users/user_1/credits");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    amount: 10,
    reason: "paid support grant",
    idempotencyKey: "support-ticket-1",
  });
});

test("admin client fetches users and credit operations with credentials", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (String(input).endsWith("/credits")) {
      return jsonResponse({
        credits: {
          accounts: [
            {
              userId: "user_1",
              userEmail: "alice@example.test",
              balance: 42,
              frozenCredits: 3,
              totalRedeemed: 50,
              totalCaptured: 8,
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
          ],
          ledger: [],
        },
      });
    }
    return jsonResponse({
      users: {
        total: 1,
        items: [
          {
            id: "user_1",
            email: "alice@example.test",
            emailNormalized: "alice@example.test",
            role: "user",
            tier: "pro",
            status: "active",
            features: ["priority_queue"],
            createdAt: "2026-07-07T00:00:00.000Z",
            updatedAt: "2026-07-07T00:00:00.000Z",
            creditAccount: {
              balance: 42,
              frozenCredits: 3,
              totalRedeemed: 50,
              totalCaptured: 8,
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
            taskSummary: {
              total: 2,
              completed: 1,
              failed: 1,
              active: 0,
            },
          },
        ],
      },
    });
  };

  const users = await fetchAdminUsers(fetchImpl as typeof fetch);
  const credits = await fetchAdminCreditOperations(fetchImpl as typeof fetch);

  assert.equal(users[0]?.email, "alice@example.test");
  assert.equal(users[0]?.availableCredits, 42);
  assert.equal(credits.accounts[0]?.balance, 42);
  assert.deepEqual(
    calls.map((call) => ({ input: call.input, credentials: call.init?.credentials })),
    [
      { input: "/api/admin/users", credentials: "include" },
      { input: "/api/admin/credits", credentials: "include" },
    ],
  );
});

function makeUser(): AdminUserRowDto {
  return {
    id: "user_1",
    email: "alice@example.test",
    status: "active",
    tier: "pro",
    availableCredits: 42,
    frozenCredits: 3,
    redeemedBatchCount: 2,
    taskCount: 11,
    completedTaskCount: 8,
    failedTaskCount: 2,
    recentActivityAt: "2026-07-07T00:10:00.000Z",
  };
}

function makeCreditOperations(): AdminCreditOperationsDto {
  return {
    accounts: [],
    ledger: [],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
