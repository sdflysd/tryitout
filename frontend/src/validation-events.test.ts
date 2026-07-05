import assert from "node:assert/strict";
import test from "node:test";

import { postValidationEvent } from "./validation-events.js";

test("postValidationEvent posts to validation endpoint", async () => {
  const calls: unknown[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await postValidationEvent(
    { type: "simulation_requested", scenarioType: "dating", deepModeRequested: true },
    fetchImpl as typeof fetch,
  );

  assert.equal((calls[0] as any).url, "/api/validation/events");
  assert.equal((calls[0] as any).init.method, "POST");
  assert.match(String((calls[0] as any).init.body), /simulation_requested/);
});

test("ClientValidationEvent accepts commercial validation metadata", async () => {
  const event = {
    type: "simulation_outcome_feedback",
    simulationId: "sim_1",
    scenarioType: "dating",
    adoptedRecommendation: "adopted",
    outcomeCategory: "better",
    fallbackStageCount: 1,
  } satisfies import("./validation-events.js").ClientValidationEvent;

  assert.equal(event.adoptedRecommendation, "adopted");
});
