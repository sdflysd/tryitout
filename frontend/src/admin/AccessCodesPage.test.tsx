import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AccessCodesPage, {
  getAccessCodeCreateFailureMessage,
  getAccessCodeOperationFailureMessage,
} from "./AccessCodesPage.js";
import {
  AdminClientError,
  bulkAdminAccessCodes,
  createAdminAccessCodeBatch,
  deleteAdminAccessCode,
  disableAdminAccessCode,
  disableAdminAccessCodeBatch,
  fetchAdminAccessCodes,
  fetchAdminAccessCodeBatches,
  restoreAdminAccessCode,
} from "./admin-client.js";
import type {
  AdminAccessCodeBatchDto,
  AdminAccessCodeRowDto,
  AdminCreateAccessCodeBatchResultDto,
} from "./admin-client.js";

test("AccessCodesPage renders creation first, code inventory, and batch summary", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage initialBatches={[makeBatch()]} initialAccessCodes={[makeAccessCode()]} language="en-US" />,
  );

  assert.ok(html.indexOf("Create Campaign Batch") < html.indexOf("Code Inventory"));
  assert.ok(html.indexOf("Code Inventory") < html.indexOf("Batch Summary"));
  for (const text of [
    "Code Inventory",
    "Code Mask",
    "Batch",
    "Redeemed User",
    "Bulk Action",
    "Batch Name",
    "Source",
    "Credits",
    "Features",
    "Created",
    "Redeemed",
    "Redemption Rate",
    "Status",
    "Founding Customers",
    "TIO-****-****-JK23",
    "alice@example.test",
    "sales-led",
    "priority_queue",
    "37.50%",
  ]) {
    assert.ok(html.includes(text), `Expected page markup to include ${text}`);
  }
});

test("AccessCodesPage renders Chinese operator copy", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage initialBatches={[makeBatch()]} initialAccessCodes={[makeAccessCode()]} language="zh-CN" />,
  );

  for (const text of [
    "访问码运营",
    "单码库存",
    "卡密码",
    "批次名称",
    "来源",
    "额度",
    "权益",
    "兑换率",
    "生成活动批次",
    "生成可复制原始码",
    "创建结果",
    "禁用",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("AccessCodesPage requires a campaign name before submitting", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage initialBatches={[]} language="zh-CN" />,
  );

  assert.match(
    html,
    /placeholder="Founding Customers"[^>]*required=""/,
  );
});

test("AccessCodesPage formats access-code creation failures in the active language", () => {
  const message = getAccessCodeCreateFailureMessage(
    "zh-CN",
    new AdminClientError(400, "name is required", "invalid_admin_input"),
  );

  assert.equal(message, "创建失败：name is required");
});

test("AccessCodesPage formats access-code operation failures in the active language", () => {
  const message = getAccessCodeOperationFailureMessage(
    "zh-CN",
    new AdminClientError(400, "admin_audit_logs action check failed", "invalid_admin_input"),
  );

  assert.equal(message, "操作失败：admin_audit_logs action check failed");
});

test("AccessCodesPage renders a business-ready creation form", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage initialBatches={[]} language="en-US" />,
  );

  for (const label of [
    "Campaign name",
    "Code count",
    "Credits per code",
    "Tier grant",
    "Features",
    "Redemption deadline",
    "Entitlement duration \\(days\\)",
    "Source",
    "Operator notes",
  ]) {
    assert.match(html, new RegExp(label));
  }
});

test("AccessCodesPage renders a live loading state before fetched batches arrive", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage fetchBatches={async () => [makeBatch()]} />,
  );

  assert.match(html, /Loading access-code batches/);
});

test("AccessCodesPage shows raw creation results only in the copy panel", () => {
  const created = makeCreatedBatch();
  const html = renderToStaticMarkup(
    <AccessCodesPage
      initialBatches={[makeBatch()]}
      initialCreationResult={created}
      language="en-US"
    />,
  );

  assert.match(html, /Copy All/);
  assert.match(html, /TIO-ABCD-EFGH-JK23/);
  assert.match(html, /TIO-ABCD-EFGH-JK24/);
  assert.match(html, /TIO-\*\*\*\*-\*\*\*\*-JK23/);
  assert.doesNotMatch(html, /hash_/);
});

test("AccessCodesPage renders individual code actions and selection controls", () => {
  const html = renderToStaticMarkup(
    <AccessCodesPage
      initialBatches={[makeBatch()]}
      initialAccessCodes={[makeAccessCode(), makeAccessCode({ id: "code_2", codeMask: "TIO-****-****-JK24", status: "disabled" })]}
      language="en-US"
    />,
  );

  assert.match(html, /aria-label="Select TIO-\*\*\*\*-\*\*\*\*-JK23"/);
  assert.match(html, /aria-label="Select all visible access codes"/);
  assert.match(html, /Search code, batch, or user/);
  assert.match(html, /Status filter/);
  assert.match(html, /name="access-code-bulk-operation"/);
  assert.match(html, /Disable/);
  assert.match(html, /Restore/);
  assert.match(html, /Delete/);
  assert.doesNotMatch(html, /rawCode/);
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
      entitlementDurationDays: 30,
      notes: "Q3 launch",
    });
    const disabled = await disableAdminAccessCodeBatch("batch_1", "campaign ended");

    assert.equal(created.codes[0]?.rawCode, "TIO-ABCD-EFGH-JK23");
    assert.equal(created.batch.entitlementDurationDays, 30);
    assert.equal(created.codes[0]?.entitlementDurationDays, 30);
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
  assert.deepEqual(
    JSON.parse(String(calls[0]?.init?.body)),
    {
      name: "Founding Customers",
      codeCount: 2,
      credits: 25,
      tier: "pro",
      features: ["priority_queue"],
      source: "sales-led",
      expiresAt: "2026-08-01T00:00:00.000Z",
      entitlementDurationDays: 30,
      notes: "Q3 launch",
    },
  );
});

test("admin client manages individual access codes through admin endpoints", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (String(input).endsWith("/bulk")) {
      return jsonResponse({ result: { updatedCodeIds: ["code_1"], skipped: [] } });
    }
    if (String(input).endsWith("/disable")) {
      return jsonResponse({ accessCode: { ...makeAccessCode(), status: "disabled", disabledAt: "2026-07-08T00:00:00.000Z" } });
    }
    if (String(input).endsWith("/restore")) {
      return jsonResponse({ accessCode: { ...makeAccessCode(), status: "active" } });
    }
    if (init?.method === "DELETE") {
      return jsonResponse({ accessCode: { ...makeAccessCode(), deletedAt: "2026-07-08T00:00:00.000Z" } });
    }
    return jsonResponse({ accessCodes: { total: 1, items: [makeAccessCode()] } });
  };

  const listed = await fetchAdminAccessCodes(fetchImpl as typeof fetch);
  await disableAdminAccessCode("code_1", "risk", fetchImpl as typeof fetch);
  await restoreAdminAccessCode("code_1", "risk cleared", fetchImpl as typeof fetch);
  await deleteAdminAccessCode("code_1", "void", fetchImpl as typeof fetch);
  await bulkAdminAccessCodes({ accessCodeIds: ["code_1"], operation: "delete", reason: "cleanup" }, fetchImpl as typeof fetch);

  assert.equal(listed.items[0]?.codeMask, "TIO-****-****-JK23");
  assert.deepEqual(
    calls.map((call) => ({ input: call.input, method: call.init?.method, credentials: call.init?.credentials })),
    [
      { input: "/api/admin/access-codes", method: undefined, credentials: "include" },
      { input: "/api/admin/access-codes/code_1/disable", method: "POST", credentials: "include" },
      { input: "/api/admin/access-codes/code_1/restore", method: "POST", credentials: "include" },
      { input: "/api/admin/access-codes/code_1", method: "DELETE", credentials: "include" },
      { input: "/api/admin/access-codes/bulk", method: "POST", credentials: "include" },
    ],
  );
});

test("admin client fetches existing access-code batches through the admin endpoint", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const batches = await fetchAdminAccessCodeBatches((async (input, init) => {
    calls.push({ input, init });
    return jsonResponse({ batches: [makeBatch()] });
  }) as typeof fetch);

  assert.equal(batches[0]?.name, "Founding Customers");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/admin/access-codes/batches");
  assert.equal(calls[0]?.init?.credentials, "include");
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
    entitlementDurationDays: 30,
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
      entitlementDurationDays: 30,
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
        entitlementDurationDays: 30,
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
        entitlementDurationDays: 30,
        createdAt: "2026-07-07T00:01:00.000Z",
      },
    ],
  };
}

function makeAccessCode(overrides: Partial<AdminAccessCodeRowDto> = {}): AdminAccessCodeRowDto {
  return {
    id: "code_1",
    batchId: "batch_1",
    batchName: "Founding Customers",
    codeMask: "TIO-****-****-JK23",
    status: "active",
    credits: 25,
    tier: "pro",
    features: ["priority_queue"],
    expiresAt: "2026-08-01T00:00:00.000Z",
    entitlementDurationDays: 30,
    redeemedByUserId: "user_1",
    redeemedByUserEmail: "alice@example.test",
    redeemedAt: "2026-07-07T00:02:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
