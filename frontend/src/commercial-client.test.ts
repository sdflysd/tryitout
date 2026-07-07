import assert from "node:assert/strict";
import test from "node:test";

import {
  CommercialClientError,
  fetchCommercialCredits,
  fetchCommercialMe,
  loginCommercialUser,
  logoutCommercialUser,
  redeemAccessCode,
  registerCommercialUser,
} from "./commercial-client.js";

test("register and login post credentials with session cookies enabled", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify({ user: makeUser() }), { status: 200 });
  };

  await registerCommercialUser(
    { email: "buyer@example.test", password: "commercial-secret" },
    fetchImpl as typeof fetch,
  );
  await loginCommercialUser(
    { email: "buyer@example.test", password: "commercial-secret" },
    fetchImpl as typeof fetch,
  );

  assert.equal(calls[0]?.url, "/api/auth/register");
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0]?.init.body as string), {
    email: "buyer@example.test",
    password: "commercial-secret",
  });
  assert.equal(calls[1]?.url, "/api/auth/login");
  assert.equal(calls[1]?.init.method, "POST");
  assert.equal(calls[1]?.init.credentials, "include");
});

test("logout, me, credits, and redeem use commercial endpoints with credentials", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    if (url === "/api/me") {
      return new Response(JSON.stringify({ user: makeUser() }), { status: 200 });
    }
    if (url === "/api/credits") {
      return new Response(JSON.stringify({ account: makeAccount() }), { status: 200 });
    }
    if (url === "/api/credits/redeem") {
      return new Response(
        JSON.stringify({
          account: makeAccount({ balance: 24, totalRedeemed: 24 }),
          ledger: {
            id: "ledger_1",
            userId: "user_1",
            entryType: "redeem",
            amount: 24,
            balanceAfter: 24,
            frozenAfter: 0,
            idempotencyKey: "redeem_1",
            createdAt: "2026-07-07T00:00:00.000Z",
          },
          redemption: {
            id: "redemption_1",
            accessCodeId: "access_code_1",
            userId: "user_1",
            credits: 24,
            featuresGranted: ["priority_queue"],
            redeemedAt: "2026-07-07T00:00:00.000Z",
            metadata: {},
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await logoutCommercialUser(fetchImpl as typeof fetch);
  await fetchCommercialMe(fetchImpl as typeof fetch);
  await fetchCommercialCredits(fetchImpl as typeof fetch);
  await redeemAccessCode(
    { code: "TIO-ABCD-EFGH-JKLM", idempotencyKey: "redeem_1" },
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(
    calls.map((call) => `${call.init.method ?? "GET"} ${call.url}`),
    [
      "POST /api/auth/logout",
      "GET /api/me",
      "GET /api/credits",
      "POST /api/credits/redeem",
    ],
  );
  assert.equal(calls.every((call) => call.init.credentials === "include"), true);
  assert.deepEqual(JSON.parse(calls[3]?.init.body as string), {
    code: "TIO-ABCD-EFGH-JKLM",
    idempotencyKey: "redeem_1",
  });
});

test("commercial client surfaces structured API errors", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: "Available credit balance is insufficient",
        code: "insufficient_credits",
      }),
      { status: 402 },
    );

  await assert.rejects(
    () => fetchCommercialCredits(fetchImpl as typeof fetch),
    (error) =>
      error instanceof CommercialClientError &&
      error.status === 402 &&
      error.code === "insufficient_credits" &&
      /insufficient/.test(error.message),
  );
});

function makeUser() {
  return {
    id: "user_1",
    email: "buyer@example.test",
    emailNormalized: "buyer@example.test",
    role: "user",
    tier: "pro",
    status: "active",
    features: ["priority_queue"],
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  };
}

type TestAccount = {
  userId: string;
  balance: number;
  frozenCredits: number;
  totalRedeemed: number;
  totalCaptured: number;
  updatedAt: string;
};

function makeAccount(overrides: Partial<TestAccount> = {}): TestAccount {
  return {
    userId: "user_1",
    balance: 12,
    frozenCredits: 2,
    totalRedeemed: 20,
    totalCaptured: 6,
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}
