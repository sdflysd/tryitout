import assert from "node:assert/strict";
import test from "node:test";

import { CommercialAnalyticsService } from "./analytics-service.js";
import { InMemoryCommercialRepository } from "./repository.js";

const NOW = "2026-07-07T00:00:00.000Z";

test("analytics service records sanitized validation events without raw private input", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = new CommercialAnalyticsService({
    repository: repo,
    now: () => NOW,
    createId: () => "event_1",
  });

  await service.recordValidationEvent({
    type: "paywall_lead_submitted",
    simulationId: "task_1",
    scenarioType: "life_choice",
    text: "I might quit my job and move cities",
    contact: "buyer@example.test",
    priceIntent: "high",
    deepModeRequested: true,
  });

  assert.deepEqual(await repo.listAnalyticsEvents(), [
    {
      id: "event_1",
      taskId: "task_1",
      eventType: "paywall_lead_submitted",
      source: "validation",
      properties: {
        scenarioType: "life_choice",
        priceIntent: "high",
        deepModeRequested: true,
      },
      occurredAt: NOW,
    },
  ]);
});

test("analytics service summarizes funnel, scenario mix, and deep mode health", async () => {
  const repo = new InMemoryCommercialRepository();
  const service = new CommercialAnalyticsService({
    repository: repo,
    now: () => NOW,
  });
  const events = [
    {
      eventType: "simulation_requested",
      properties: { scenarioType: "life_choice", deepModeRequested: true },
    },
    {
      eventType: "simulation_requested",
      properties: { scenarioType: "dating", deepModeRequested: false },
    },
    {
      eventType: "simulation_completed",
      properties: { scenarioType: "life_choice", deepModeRequested: true },
    },
    {
      eventType: "simulation_failed",
      properties: {
        scenarioType: "life_choice",
        deepModeRequested: true,
        fallbackStageCount: 2,
      },
    },
    {
      eventType: "report_viewed",
      properties: { scenarioType: "life_choice" },
    },
    {
      eventType: "paywall_clicked",
      properties: { scenarioType: "life_choice" },
    },
    {
      eventType: "paywall_lead_submitted",
      properties: { scenarioType: "dating" },
    },
  ];

  for (const [index, event] of events.entries()) {
    await service.recordEvent({
      id: `event_${index + 1}`,
      eventType: event.eventType,
      source: "test",
      properties: event.properties,
      occurredAt: `2026-07-07T00:0${index}:00.000Z`,
    });
  }

  assert.deepEqual(await service.summarizeFunnel(), {
    requested: 2,
    completed: 1,
    failed: 1,
    reportViewed: 1,
    paywallClicked: 1,
    leads: 1,
    deepModeRequested: 3,
    completionRate: 0.5,
    failureRate: 0.5,
    leadRate: 0.5,
  });
  assert.deepEqual(await service.summarizeScenarioMix(), {
    life_choice: 5,
    dating: 2,
  });
  assert.deepEqual(await service.summarizeDeepModeHealth(), {
    requested: 3,
    completed: 1,
    failed: 1,
    fallbackStageCount: 2,
    completionRate: 0.3333,
    failureRate: 0.3333,
  });
});
