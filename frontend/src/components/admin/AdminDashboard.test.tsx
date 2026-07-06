import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminDashboard from "./AdminDashboard.js";

test("admin dashboard renders commercial operations sections", () => {
  const html = renderToStaticMarkup(<AdminDashboard adminEmail="admin@tryitout.ai" />);

  assert.match(html, /Commercial Admin/);
  assert.match(html, /admin@tryitout.ai/);
  assert.match(html, /Overview/);
  assert.match(html, /Users/);
  assert.match(html, /Access Codes/);
  assert.match(html, /Tasks/);
  assert.match(html, /Feedback/);
  assert.match(html, /Settings/);
  assert.match(html, /Audit Logs/);
  assert.match(html, /admin-dashboard-root/);
});

test("admin dashboard uses dense navigation and table placeholders", () => {
  const html = renderToStaticMarkup(<AdminDashboard />);

  assert.match(html, /role="tablist"/);
  assert.match(html, /User/);
  assert.match(html, /Status/);
  assert.match(html, /Balance/);
  assert.match(html, /Code/);
  assert.match(html, /Action/);
});
