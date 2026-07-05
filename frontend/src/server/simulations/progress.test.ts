import assert from "node:assert/strict";
import test from "node:test";

import { emitSimulationProgress } from "./progress.js";
import type { SimulationProgressEvent } from "../../types.js";

test("interactive stage progress events do not regress within a stage", () => {
  const events: SimulationProgressEvent[] = [];
  const onProgress = (event: SimulationProgressEvent) => events.push(event);

  for (const step of [
    "generate_world_event",
    "generate_agent_actions",
    "arbitrate_stage",
  ] as const) {
    emitSimulationProgress({
      simulationId: "sim-progress",
      step,
      stageIndex: 2,
      status: "started",
      onProgress,
    });
    emitSimulationProgress({
      simulationId: "sim-progress",
      step,
      stageIndex: 2,
      status: "completed",
      onProgress,
    });
  }

  const percents = events.map((event) => event.percent);
  assert.deepEqual(
    percents,
    [...percents].sort((left, right) => left - right),
  );
  assert.equal(percents.at(-1), 50);
});

test("route comparison progress uses final optional step copy", () => {
  const events: SimulationProgressEvent[] = [];

  emitSimulationProgress({
    simulationId: "sim-route-progress",
    step: "generate_route_comparison",
    status: "completed",
    onProgress: (event) => events.push(event),
  });

  assert.equal(events[0].percent, 100);
  assert.match(events[0].message, /路线对比/);
});
