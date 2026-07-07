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

test("handleValidationEventRequest stores validation events in commercial analytics when provided", async () => {
  let localAppendCalled = false;
  const commercialEvents: unknown[] = [];

  const result = await handleValidationEventRequest(
    {
      type: "paywall_lead_submitted",
      simulationId: "task_1",
      scenarioType: "life_choice",
      text: "private decision details",
      contact: "buyer@example.test",
    },
    {
      appendEvent: async () => {
        localAppendCalled = true;
        throw new Error("local JSONL append should not run");
      },
      analyticsService: {
        recordValidationEvent: async (event) => {
          commercialEvents.push(event);
        },
      },
    },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(localAppendCalled, false);
  assert.deepEqual(commercialEvents, [
    {
      type: "paywall_lead_submitted",
      simulationId: "task_1",
      scenarioType: "life_choice",
    },
  ]);
});
