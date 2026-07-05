import assert from "node:assert/strict";
import test from "node:test";

import {
  getVisibleActionPlan,
  hasAgentInteractions,
  shouldShowDeepSection,
} from "./report-access.js";
import type { Simulation } from "../types.js";

test("getVisibleActionPlan limits free report to first three days", () => {
  const plan = Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    title: `Day ${index + 1}`,
    action: "do it",
  }));

  assert.equal(getVisibleActionPlan(plan, false).length, 3);
  assert.equal(getVisibleActionPlan(plan, true).length, 7);
});

test("shouldShowDeepSection requires unlock and available interaction data", () => {
  const simulation = {
    stages: [{ interactions: { votes: [] } }],
  } as unknown as Simulation;

  assert.equal(hasAgentInteractions(simulation), true);
  assert.equal(shouldShowDeepSection(simulation, false), false);
  assert.equal(shouldShowDeepSection(simulation, true), true);
});
