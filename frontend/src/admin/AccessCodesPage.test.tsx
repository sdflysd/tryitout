import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AccessCodesPage from "./AccessCodesPage.js";
import {
  createAdminAccessCodeBatch,
  disableAdminAccessCodeBatch,
} from "./admin-client.js";
import type {
  AdminAccessCodeBatchDto,
  AdminCreateAccessCodeBatchResultDto,
} from "./admin-client.js";

test("AccessCodesPage renders batch operating columns with campaign context", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage initialBatches={[makeBatch()]} />,
  );

  for (const text of [
    "Batch Name",
    "Source",
    "Credits",
    "Features",
    "Created",
    "Redeemed",
    "Redemption Rate",
    "Status",
    "Founding Customers",
    "sales-led",
    "priority_queue",
    "37.50%",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("AccessCodesPage renders a business-ready creation form", () => {
  const html = renderToStaticMarkup(<AccessCodesPage initialBatches={[]} />);

  for (const label of [
    "Campaign name",
    "Code count",
    "Credits per code",
    "Tier grant",
    "Features",
    "Expiration",
    "Source",
    "Operator notes",
  ]) {
    assert.match(html, new RegExp(label));
  }
});

test("AccessCodesPage shows raw creation results only in the copy panel", () => {
  const created = makeCreatedBatch();
  const html = renderToStaticMarkup(
    <AccessCodesPage
      initialBatches={[makeBatch()]}
      initialCreationResult={created}
    />,
  );

  assert.match(html, /Copy All/);
  assert.match(html, /TIO-ABCD-EFGH-JK23/);
  assert.match(html, /TIO-ABCD-EFGH-JK24/);
  assert.match(html, /TIO-\*\*\*\*-\*\*\*\*-JK23/);
  assert.doesNotMatch(html, /hash_/);
});

test("admin client creates and disables access-code batches through admin endpoints", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (String(input).endsWith("/disable")) {
      return jsonResponse({ batch: { ...makeBatch(), disabledAt: "2026-07-08T00:00:00.000Z" }, disabledCodeCount: 8 });
    }
    return jsonResponse(makeCreatedBatch());
  };

  try {
    const created = await createAdminAccessCodeBatch({
      name: "Founding Customers",
      codeCount: 2,
      credits: 25,
      tier: "pro",
      features: ["priority_queue"],
      source: "sales-led",
      expiresAt: "2026-08-01T00:00:00.000Z",
      notes: "Q3 launch",
    });
    const disabled = await disableAdminAccessCodeBatch("batch_1", "campaign ended");

    assert.equal(created.codes[0]?.rawCode, "TIO-ABCD-EFGH-JK23");
    assert.equal(disabled.disabledCodeCount, 8);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    calls.map((call) => ({
      input: call.input,
      method: call.init?.method,
      credentials: call.init?.credentials,
    })),
    [
      {
        input: "/api/admin/access-codes/batches",
        method: "POST",
        credentials: "include",
      },
      {
        input: "/api/admin/access-codes/batches/batch_1/disable",
        method: "POST",
        credentials: "include",
      },
    ],
  );
});

function makeBatch(): AdminAccessCodeBatchDto {
  return {
    id: "batch_1",
    name: "Founding Customers",
    source: "sales-led",
    codeCount: 40,
    credits: 25,
    tier: "pro",
    features: ["priority_queue", "deep_mode"],
    expiresAt: "2026-08-01T00:00:00.000Z",
    notes: "Q3 launch",
    createdAt: "2026-07-07T00:00:00.000Z",
    status: "active",
    redeemedCount: 15,
    activeCount: 25,
    disabledCount: 0,
    expiredCount: 0,
    redemptionRate: 0.375,
  };
}

function makeCreatedBatch(): AdminCreateAccessCodeBatchResultDto {
  return {
    batch: {
      id: "batch_2",
      name: "Manual VIP",
      source: "support",
      codeCount: 2,
      credits: 30,
      tier: "pro",
      features: ["priority_queue"],
      expiresAt: "2026-08-01T00:00:00.000Z",
      notes: "VIP recovery",
      metadata: {},
      createdAt: "2026-07-07T00:01:00.000Z",
    },
    codes: [
      {
        id: "code_1",
        rawCode: "TIO-ABCD-EFGH-JK23",
        codeMask: "TIO-****-****-JK23",
        status: "active",
        credits: 30,
        tier: "pro",
        features: ["priority_queue"],
        expiresAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-07-07T00:01:00.000Z",
      },
      {
        id: "code_2",
        rawCode: "TIO-ABCD-EFGH-JK24",
        codeMask: "TIO-****-****-JK24",
        status: "active",
        credits: 30,
        tier: "pro",
        features: ["priority_queue"],
        expiresAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-07-07T00:01:00.000Z",
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
