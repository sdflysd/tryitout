import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSimulationCompletedEvent,
  buildSimulationFailedEvent,
  hasDeepInteractions,
} from "./simulation-analytics.js";
import type { SimulationApiResponse } from "./types.js";

const response = {
  id: "sim_1",
  status: "completed",
  createdAt: "2026-06-30T00:00:00.000Z",
  agents: [],
  report: {} as SimulationApiResponse["report"],
  stages: [
    {
      interactions: {
        activatedAgentIds: ["a"],
        actions: [],
        votes: [],
        relationships: [],
        mergedVoteDelta: {},
        finalDelta: {},
        arbiterSummary: "done",
      },
    } as SimulationApiResponse["stages"][number],
  ],
} satisfies SimulationApiResponse;

test("hasDeepInteractions detects stage-level interaction data", () => {
  assert.equal(hasDeepInteractions(response), true);
});

test("buildSimulationCompletedEvent records duration and deep mode availability", () => {
  assert.deepEqual(
    buildSimulationCompletedEvent({
      response,
      scenarioType: "dating",
      durationMs: 1200,
      deepModeRequested: true,
    }),
    {
      type: "simulation_completed",
      simulationId: "sim_1",
      scenarioType: "dating",
      durationMs: 1200,
      deepModeRequested: true,
      deepModeAvailable: true,
    },
  );
});

test("buildSimulationFailedEvent stores safe error code only", () => {
  assert.equal(
    buildSimulationFailedEvent({
      scenarioType: "life_choice",
      durationMs: 500,
      deepModeRequested: false,
      error: new Error("Provider key is missing"),
    }).errorCode,
    "Provider key is missing",
  );
});
