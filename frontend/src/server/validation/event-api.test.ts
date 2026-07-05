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
