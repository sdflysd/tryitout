import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendValidationEvent,
  sanitizeValidationEvent,
} from "./event-store.js";

test("sanitizeValidationEvent accepts known events and strips unsafe fields", () => {
  const event = sanitizeValidationEvent({
    type: "simulation_completed",
    simulationId: " sim_123 ",
    scenarioType: "dating",
    durationMs: 12345,
    deepModeRequested: true,
    deepModeAvailable: false,
    createdAt: "client forged timestamp",
    userInput: "must not be stored",
    unexpected: "remove me",
  });

  assert.deepEqual(event, {
    type: "simulation_completed",
    simulationId: "sim_123",
    scenarioType: "dating",
    durationMs: 12345,
    deepModeRequested: true,
    deepModeAvailable: false,
  });
});

test("sanitizeValidationEvent rejects unknown type and scenario", () => {
  assert.throws(
    () => sanitizeValidationEvent({ type: "random_event" }),
    /unknown validation event type/,
  );
  assert.throws(
    () => sanitizeValidationEvent({ type: "report_viewed", scenarioType: "finance" }),
    /invalid scenarioType/,
  );
});

test("sanitizeValidationEvent limits text and contact length", () => {
  const event = sanitizeValidationEvent({
    type: "feedback_submitted",
    text: "x".repeat(800),
    contact: "a".repeat(300),
  });

  assert.equal(event.text?.length, 240);
  assert.equal(event.contact?.length, 120);
});

test("appendValidationEvent writes one JSON line with server timestamp", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tryitout-validation-"));
  const filePath = path.join(dir, "events.jsonl");

  await appendValidationEvent(
    {
      type: "paywall_clicked",
      simulationId: "sim_abc",
      scenarioType: "side_hustle",
      priceIntent: "9.9",
    },
    { filePath },
  );

  const lines = (await readFile(filePath, "utf8")).trim().split("\n");
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.type, "paywall_clicked");
  assert.equal(parsed.simulationId, "sim_abc");
  assert.equal(typeof parsed.createdAt, "string");
});

test("sanitizeValidationEvent accepts commercial validation events and strips private free text", () => {
  const event = sanitizeValidationEvent({
    type: "simulation_outcome_feedback",
    simulationId: "sim_123",
    scenarioType: "life_choice",
    priceIntent: "9.9",
    deepModeRequested: true,
    deepModeAvailable: true,
    fallbackStageCount: 2,
    adoptedRecommendation: "partially_adopted",
    outcomeCategory: "better",
    text: "x".repeat(1_000),
    rawChatLog: "private",
    selectedPrice: "do-not-store",
  });

  assert.deepEqual(event, {
    type: "simulation_outcome_feedback",
    simulationId: "sim_123",
    scenarioType: "life_choice",
    priceIntent: "9.9",
    text: "x".repeat(240),
    deepModeRequested: true,
    deepModeAvailable: true,
    fallbackStageCount: 2,
    adoptedRecommendation: "partially_adopted",
    outcomeCategory: "better",
  });
});

test("sanitizeValidationEvent accepts new funnel event types", () => {
  for (const type of [
    "route_comparison_viewed",
    "deep_report_unlock_intent",
    "share_card_opened",
    "review_requested",
  ] as const) {
    assert.equal(sanitizeValidationEvent({ type }).type, type);
  }
});
