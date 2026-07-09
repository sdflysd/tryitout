import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SERVER_SOURCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../server.ts",
);

test("server does not expose the legacy unauthenticated admin task cost endpoint", () => {
  const source = readServerSource();

  assert.doesNotMatch(
    source,
    /\/api\/admin\/simulation-tasks\/:id\/cost-summary/,
  );
  assert.doesNotMatch(source, /handleGetSimulationCostSummaryRequest/);
});

test("server returns JSON 404 for unmatched API routes before frontend routing", () => {
  const source = readServerSource();
  const fallbackIndex = source.indexOf('app.use("/api"');
  const frontendRoutingIndex = source.indexOf("// Configure Vite or Static files serving");

  assert.notEqual(fallbackIndex, -1);
  assert.notEqual(frontendRoutingIndex, -1);
  assert.ok(fallbackIndex < frontendRoutingIndex);
  assert.match(source.slice(fallbackIndex, frontendRoutingIndex), /API route not found/);
});

test("server gates admin page routes before frontend routing", () => {
  const source = readServerSource();
  const guardIndex = source.indexOf('app.get(["/admin", "/admin/*"]');
  const frontendRoutingIndex = source.indexOf("// Configure Vite or Static files serving");

  assert.notEqual(guardIndex, -1);
  assert.notEqual(frontendRoutingIndex, -1);
  assert.ok(guardIndex < frontendRoutingIndex);
  const guardedSource = source.slice(guardIndex, frontendRoutingIndex);
  assert.match(guardedSource, /handleAdminPageRequest/);
  assert.match(guardedSource, /handleGetMeRequest/);
  assert.match(guardedSource, /isAdminRole/);
});

function readServerSource(): string {
  return readFileSync(SERVER_SOURCE_PATH, "utf8");
}
