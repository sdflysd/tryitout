import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustAdminCredits,
  createAdminAccessCode,
  disableAdminAccessCode,
  getAdminDashboardSummary,
  getCommercialCredits,
  loginCommercialUser,
  redeemCommercialAccessCode,
  registerCommercialUser,
  updateAdminSystemSetting,
} from "./commercial-client.js";

test("login and register clients include credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        user: {
          id: "user_1",
          email: "founder@tryitout.ai",
          tier: "basic",
          features: [],
          isAdmin: false,
        },
      }),
      { status: 200 },
    );
  };

  await registerCommercialUser(
    { email: "founder@tryitout.ai", password: "password-1" },
    fetchImpl as typeof fetch,
  );
  await loginCommercialUser(
    { email: "founder@tryitout.ai", password: "password-1" },
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(
    calls.map((call) => [call.url, call.init?.method, call.init?.credentials]),
    [
      ["/api/auth/register", "POST", "include"],
      ["/api/auth/login", "POST", "include"],
    ],
  );
});

test("credit redemption client calls commercial credits endpoint", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ balance: 10 }), { status: 200 });
  };

  const result = await redeemCommercialAccessCode("TIO-ABCD-1234-WXYZ", fetchImpl as typeof fetch);

  assert.equal(result.balance, 10);
  assert.equal(calls[0].url, "/api/credits/redeem");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.credentials, "include");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { code: "TIO-ABCD-1234-WXYZ" });
});

test("commercial credits client surfaces API errors", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  await assert.rejects(
    () => getCommercialCredits(fetchImpl as typeof fetch),
    /auth_required/,
  );
});

test("admin dashboard client calls live admin endpoints with credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === "/api/admin/summary") {
      return new Response(JSON.stringify({ overview: {}, users: [], accessCodes: [], tasks: [], feedback: [], auditLogs: [] }), { status: 200 });
    }
    if (url === "/api/admin/access-codes") {
      return new Response(JSON.stringify({ accessCode: { rawCode: "TIO-ABCD-1234-WXYZ" } }), { status: 201 });
    }
    return new Response(JSON.stringify({ ok: true, balance: 11 }), { status: 200 });
  };

  await getAdminDashboardSummary(fetchImpl as typeof fetch);
  await createAdminAccessCode({ creditAmount: 10, tier: "basic", features: [] }, fetchImpl as typeof fetch);
  await disableAdminAccessCode("code_1", "测试禁用", fetchImpl as typeof fetch);
  await adjustAdminCredits({ userId: "user_1", amount: 5, reason: "测试赠送" }, fetchImpl as typeof fetch);
  await updateAdminSystemSetting(
    { key: "max_weighted_concurrency", value: { value: 6 } },
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(
    calls.map((call) => [call.url, call.init?.method ?? "GET", call.init?.credentials]),
    [
      ["/api/admin/summary", "GET", "include"],
      ["/api/admin/access-codes", "POST", "include"],
      ["/api/admin/access-codes/code_1/disable", "POST", "include"],
      ["/api/admin/credits/adjust", "POST", "include"],
      ["/api/admin/settings/max_weighted_concurrency", "POST", "include"],
    ],
  );
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    creditAmount: 10,
    tier: "basic",
    features: [],
  });
  assert.deepEqual(JSON.parse(String(calls[4].init?.body)), {
    value: { value: 6 },
  });
});
