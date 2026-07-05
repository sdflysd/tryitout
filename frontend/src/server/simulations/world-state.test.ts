import assert from "node:assert/strict";
import test from "node:test";
import type { WorldState, WorldStateDelta } from "../../types.js";
import { applyStateDelta, clampStateDelta, mergeStateDeltas } from "./world-state.js";

test("applyStateDelta clamps score fields and prevents negative count fields", () => {
  const state: WorldState = {
    day: 0,
    productClarity: 95,
    executionEnergy: 5,
    trafficProgress: 50,
    trialUsers: 1,
    paidUsers: 0,
    revenue: 0,
    riskLevel: 98,
    confidence: 2,
  };

  const delta: WorldStateDelta = {
    day: 3,
    productClarity: 20,
    executionEnergy: -20,
    trialUsers: -5,
    paidUsers: -1,
    revenue: -100,
    riskLevel: 20,
    confidence: -10,
  };

  assert.deepEqual(applyStateDelta(state, delta), {
    day: 3,
    productClarity: 100,
    executionEnergy: 0,
    trafficProgress: 50,
    trialUsers: 0,
    paidUsers: 0,
    revenue: 0,
    riskLevel: 100,
    confidence: 0,
  });
});

test("mergeStateDeltas averages score votes and sums count votes", () => {
  const votes: WorldStateDelta[] = [
    { confidence: -10, riskLevel: 20, trialUsers: 2, revenue: 10 },
    { confidence: -4, riskLevel: 10, trialUsers: 4, revenue: 20 },
  ];

  assert.deepEqual(mergeStateDeltas(votes), {
    confidence: -7,
    riskLevel: 15,
    trialUsers: 6,
    revenue: 30,
  });
});

test("mergeStateDeltas handles empty, partial, and fractional votes deterministically", () => {
  assert.deepEqual(mergeStateDeltas([]), {});

  assert.deepEqual(
    mergeStateDeltas([
      { confidence: 1.4, trialUsers: 1.2 },
      { confidence: 2.6, revenue: 2.5 },
    ]),
    {
      confidence: 2,
      trialUsers: 1,
      revenue: 3,
    },
  );
});

test("clampStateDelta limits score changes but keeps explicit day", () => {
  assert.deepEqual(clampStateDelta({ day: 7, confidence: -80, riskLevel: 40 }, 10), {
    day: 7,
    confidence: -10,
    riskLevel: 10,
  });
});
