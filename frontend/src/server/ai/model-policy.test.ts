import test from "node:test";
import assert from "node:assert/strict";

import { getPolicyForScenario } from "./model-policy.js";

test("model policy includes route comparison generation step", () => {
  const policy = getPolicyForScenario("life_choice");
  const step = policy.steps.generate_route_comparison;

  assert.equal(step.quality, "balanced");
  assert.equal(step.maxOutputTokens, 8192);
  assert.equal(step.timeoutMs, 60000);
  assert.equal(step.maxRetries, 1);
});

test("model policy treats agent actions as a core heavy interaction step", () => {
  const policy = getPolicyForScenario("life_choice");
  const step = policy.steps.generate_agent_actions;

  assert.equal(step.quality, "balanced");
  assert.equal(step.maxOutputTokens, 8192);
  assert.equal(step.timeoutMs, 150000);
  assert.equal(step.maxRetries, 1);
});

test("model policy gives agent generation enough time for role-card output", () => {
  const policy = getPolicyForScenario("life_choice");
  const step = policy.steps.generate_agents;

  assert.equal(step.quality, "balanced");
  assert.equal(step.maxOutputTokens, 8192);
  assert.equal(step.timeoutMs, 120000);
  assert.equal(step.maxRetries, 3);
});
