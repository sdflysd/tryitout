import assert from "node:assert/strict";
import test from "node:test";

import { getHomeHeroCopy } from "./home-copy.js";

test("home hero copy emphasizes simulate before action", () => {
  const copy = getHomeHeroCopy();
  assert.match(copy.title, /别急/);
  assert.match(copy.subtitle, /先模拟|试一次/);
});
