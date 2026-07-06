import assert from "node:assert/strict";
import test from "node:test";

import { AnalyticsService } from "./analytics-service.js";
import { InMemoryCommercialRepository } from "./repository.js";

const now = new Date("2026-07-06T12:00:00.000Z");

test("stores sanitized validation events in repository", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = new AnalyticsService(repository, {
    now: () => now,
  });

  const event = await service.recordValidationEvent({
    type: "simulation_completed",
    simulationId: "sim_1",
    scenarioType: "side_hustle",
    durationMs: 1234,
    text: "private free text",
  });

  assert.equal(event.eventType, "simulation_completed");
  assert.equal(event.payload.simulationId, "sim_1");
  assert.equal(event.payload.scenarioType, "side_hustle");
  assert.equal(event.payload.durationMs, 1234);
  assert.equal(event.payload.text, "private free text");
  assert.equal(event.createdAt.toISOString(), now.toISOString());

  const stored = await repository.listAnalyticsEventsForTest();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.id, event.id);
});

test("rejects unsanitized unknown validation event types", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = new AnalyticsService(repository, {
    now: () => now,
  });

  await assert.rejects(
    service.recordValidationEvent({ type: "unknown_event" }),
    /unknown validation event type/,
  );
});
