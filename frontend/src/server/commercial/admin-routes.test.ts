import assert from "node:assert/strict";
import test from "node:test";

import { registerCommercialAdminRoutes } from "./admin-routes.js";

test("commercial admin routes register real platform endpoints", () => {
  const app = new FakeExpressApp();

  registerCommercialAdminRoutes(app as never, {} as never);

  assert.deepEqual(app.routes, [
    { method: "GET", path: "/api/admin/overview" },
    { method: "GET", path: "/api/admin/users" },
    { method: "GET", path: "/api/admin/access-codes/batches" },
    { method: "POST", path: "/api/admin/access-codes/batches" },
    { method: "POST", path: "/api/admin/access-codes/batches/:id/disable" },
    { method: "GET", path: "/api/admin/tasks" },
    { method: "GET", path: "/api/admin/credits" },
    { method: "GET", path: "/api/admin/costs" },
    { method: "GET", path: "/api/admin/queue" },
    { method: "GET", path: "/api/admin/feedback" },
    { method: "GET", path: "/api/admin/settings" },
    { method: "POST", path: "/api/admin/users/:id/credits" },
    { method: "GET", path: "/api/admin/audit-logs" },
  ]);
});

class FakeExpressApp {
  readonly routes: Array<{ method: "GET" | "POST"; path: string }> = [];

  get(path: string): void {
    this.routes.push({ method: "GET", path });
  }

  post(path: string): void {
    this.routes.push({ method: "POST", path });
  }
}
