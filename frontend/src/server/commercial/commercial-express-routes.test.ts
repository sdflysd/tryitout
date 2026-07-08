import assert from "node:assert/strict";
import test from "node:test";

import {
  registerCommercialAdminRoutes,
  type CommercialExpressRouteHandler,
} from "./commercial-express-routes.js";
import type { CommercialApiResponse } from "./commercial-api.js";

interface RegisteredRoute {
  method: "GET" | "POST";
  path: string;
  handler: CommercialExpressRouteHandler;
}

class FakeExpressApp {
  routes: RegisteredRoute[] = [];

  post(path: string, handler: CommercialExpressRouteHandler): void {
    this.routes.push({ method: "POST", path, handler });
  }

  get(path: string, handler: CommercialExpressRouteHandler): void {
    this.routes.push({ method: "GET", path, handler });
  }
}

test("registerCommercialAdminRoutes mounts audited admin APIs", () => {
  const app = new FakeExpressApp();

  registerCommercialAdminRoutes({
    app,
    requireCommercialServices: () => createFakeServices(),
    getSessionToken: () => "session_1",
    sendCommercialApiResponse: () => undefined,
  });

  assert.deepEqual(
    app.routes.map((route) => `${route.method} ${route.path}`),
    [
      "GET /api/admin/summary",
      "POST /api/admin/access-codes",
      "POST /api/admin/access-codes/batch",
      "POST /api/admin/access-codes/:accessCodeId/disable",
      "POST /api/admin/credits/adjust",
      "POST /api/admin/settings/:key",
      "GET /api/admin/audit-logs",
    ],
  );
});

test("admin access code disable route forwards params, body, and session token", async () => {
  const app = new FakeExpressApp();
  const calls: unknown[] = [];

  registerCommercialAdminRoutes({
    app,
    requireCommercialServices: () => createFakeServices(calls),
    getSessionToken: () => "session_admin",
    sendCommercialApiResponse: (_res, result) => {
      calls.push({ sentStatus: result.status });
    },
  });

  const route = app.routes.find(
    (candidate) => candidate.path === "/api/admin/access-codes/:accessCodeId/disable",
  );
  assert.ok(route);

  await route.handler(
    {
      body: { reason: "rotated" },
      params: { accessCodeId: "code_1" },
      headers: {},
    },
    {},
  );

  assert.deepEqual(calls, [
    {
      handler: "disableAdminAccessCode",
      request: {
        body: { reason: "rotated" },
        params: { accessCodeId: "code_1" },
        sessionToken: "session_admin",
      },
    },
    { sentStatus: 200 },
  ]);
});

test("admin setting route forwards key, body, and session token", async () => {
  const app = new FakeExpressApp();
  const calls: unknown[] = [];

  registerCommercialAdminRoutes({
    app,
    requireCommercialServices: () => createFakeServices(calls),
    getSessionToken: () => "session_admin",
    sendCommercialApiResponse: (_res, result) => {
      calls.push({ sentStatus: result.status });
    },
  });

  const route = app.routes.find(
    (candidate) => candidate.path === "/api/admin/settings/:key",
  );
  assert.ok(route);

  await route.handler(
    {
      body: { value: { value: 6 } },
      params: { key: "max_weighted_concurrency" },
      headers: {},
    },
    {},
  );

  assert.deepEqual(calls, [
    {
      handler: "updateAdminSystemSetting",
      request: {
        body: { value: { value: 6 } },
        params: { key: "max_weighted_concurrency" },
        sessionToken: "session_admin",
      },
    },
    { sentStatus: 200 },
  ]);
});

function createFakeServices(calls: unknown[] = []) {
  const ok = (handler: string, request: unknown): CommercialApiResponse => {
    calls.push({ handler, request });
    return { status: 200, body: { ok: true } };
  };

  return {
    apiHandlers: {
      createAdminAccessCode: (request: unknown) => ok("createAdminAccessCode", request),
      createAdminAccessCodeBatch: (request: unknown) => ok("createAdminAccessCodeBatch", request),
      disableAdminAccessCode: (request: unknown) => ok("disableAdminAccessCode", request),
      adjustAdminCredits: (request: unknown) => ok("adjustAdminCredits", request),
      updateAdminSystemSetting: (request: unknown) => ok("updateAdminSystemSetting", request),
      getAdminDashboardSummary: (request: unknown) => ok("getAdminDashboardSummary", request),
      listAdminAuditLogs: (request: unknown) => ok("listAdminAuditLogs", request),
    },
  };
}
