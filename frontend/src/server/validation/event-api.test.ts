import assert from "node:assert/strict";
import test from "node:test";

import { handleValidationEventRequest } from "./event-api.js";

test("handleValidationEventRequest rejects invalid body", async () => {
  const result = await handleValidationEventRequest(undefined, {
    appendEvent: async () => {
      throw new Error("should not write");
    },
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /object/);
});

test("handleValidationEventRequest persists valid event", async () => {
  let stored: unknown;
  const result = await handleValidationEventRequest(
    { type: "share_clicked", simulationId: "sim_1" },
    {
      appendEvent: async (event) => {
        stored = event;
        return { type: "share_clicked", simulationId: "sim_1" };
      },
    },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(stored, { type: "share_clicked", simulationId: "sim_1" });
});

test("handleValidationEventRequest stores through commercial analytics when injected", async () => {
  let stored: unknown;
  const result = await handleValidationEventRequest(
    { type: "simulation_completed", simulationId: "sim_1", durationMs: 120.4 },
    {
      analyticsService: {
        recordValidationEvent: async (event: unknown) => {
          stored = event;
          return {
            id: "analytics_1",
            eventType: "simulation_completed",
            payload: event as Record<string, unknown>,
            createdAt: new Date("2026-07-06T12:00:00.000Z"),
          };
        },
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(stored, {
    type: "simulation_completed",
    simulationId: "sim_1",
    durationMs: 120,
  });
  assert.equal(result.body.event?.type, "simulation_completed");
  assert.equal(result.body.event?.createdAt, "2026-07-06T12:00:00.000Z");
});

test("handleValidationEventRequest still falls back to local append when commercial analytics is absent", async () => {
  let stored: unknown;
  const result = await handleValidationEventRequest(
    { type: "share_clicked", simulationId: "sim_1" },
    {
      appendEvent: async (event) => {
        stored = event;
        return {
          type: "share_clicked",
          simulationId: "sim_1",
          createdAt: "2026-07-06T12:00:00.000Z",
        };
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(stored, { type: "share_clicked", simulationId: "sim_1" });
  assert.equal(result.body.event?.createdAt, "2026-07-06T12:00:00.000Z");
});
