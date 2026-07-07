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
        features: ["priority_queue"],
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
