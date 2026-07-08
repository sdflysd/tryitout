import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AccountPanel from "./AccountPanel.js";

test("account panel shows commercial identity, tier, balance, frozen credits, and redeem form", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      user={{
        id: "user_1",
        email: "buyer@example.test",
        emailNormalized: "buyer@example.test",
        role: "user",
        tier: "pro",
        status: "active",
        features: ["priority_queue", "custom_model_provider"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "user_1",
        balance: 18,
        frozenCredits: 3,
        totalRedeemed: 30,
        totalCaptured: 9,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      onRedeem={async () => undefined}
      modelProvider={{
        id: "provider_1",
        provider: "openai",
        displayName: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMask: "sk-liv...3456",
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
    />,
  );

  assert.match(html, /buyer@example\.test/);
  assert.match(html, /pro/);
  assert.match(html, /Available credits/);
  assert.match(html, />18</);
  assert.match(html, /Frozen credits/);
  assert.match(html, />3</);
  assert.match(html, /Access code/);
  assert.match(html, /Redeem code/);
  assert.match(html, /Model provider/);
  assert.match(html, /sk-liv\.\.\.3456/);
});

test("account panel exposes an admin console link for owner accounts", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      user={{
        id: "owner_1",
        email: "admin@example.test",
        emailNormalized: "admin@example.test",
        role: "owner",
        tier: "business",
        status: "active",
        features: ["admin_ops"],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
      account={{
        userId: "owner_1",
        balance: 0,
        frozenCredits: 0,
        totalRedeemed: 0,
        totalCaptured: 0,
        updatedAt: "2026-07-07T00:00:00.000Z",
      }}
    />,
  );

  assert.match(html, /href="\/admin"/);
  assert.match(html, /进入后台/);
});

test("account panel renders a compact login and registration form when signed out", () => {
  const html = renderToStaticMarkup(
    <AccountPanel
      onLogin={async () => undefined}
      onRegister={async () => undefined}
    />,
  );

  assert.match(html, /Commercial account/);
  assert.match(html, /Email/);
  assert.match(html, /Password/);
  assert.match(html, /Sign in/);
  assert.match(html, /Create account/);
});
