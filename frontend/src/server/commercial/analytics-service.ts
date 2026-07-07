import { randomUUID } from "node:crypto";

import type { ValidationEvent } from "../validation/event-store.js";
import type { CommercialRepository } from "./repository.js";
import type { AnalyticsEventRecord, JsonObject } from "./types.js";

export interface CommercialAnalyticsServiceOptions {
  repository: CommercialRepository;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
}

export interface CommercialFunnelSummary {
  requested: number;
  completed: number;
  failed: number;
  reportViewed: number;
  paywallClicked: number;
  leads: number;
  deepModeRequested: number;
  completionRate: number;
  failureRate: number;
  leadRate: number;
}

export interface CommercialDeepModeHealth {
  requested: number;
  completed: number;
  failed: number;
  fallbackStageCount: number;
  completionRate: number;
  failureRate: number;
}

const PRIVATE_VALIDATION_FIELDS = new Set(["text", "contact"]);

export class CommercialAnalyticsService {
  private readonly repository: CommercialRepository;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;

  constructor(options: CommercialAnalyticsServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "analytics_event") => `${prefix}_${randomUUID()}`);
  }

  async recordEvent(event: AnalyticsEventRecord): Promise<void> {
    await this.repository.appendAnalyticsEvent(event);
  }

  async recordValidationEvent(event: ValidationEvent): Promise<AnalyticsEventRecord> {
    const record: AnalyticsEventRecord = {
      id: this.createId("analytics_event"),
      eventType: event.type,
      source: "validation",
      properties: validationEventProperties(event),
      occurredAt: event.createdAt ?? toIso(this.now()),
    };
    if (event.simulationId !== undefined) {
      record.taskId = event.simulationId;
    }

    await this.recordEvent(record);
    return record;
  }

  async summarizeFunnel(): Promise<CommercialFunnelSummary> {
    const events = await this.repository.listAnalyticsEvents();
    const requested = countEvents(events, "simulation_requested");
    const completed = countEvents(events, "simulation_completed");
    const failed = countEvents(events, "simulation_failed");
    const leads = countEvents(events, "paywall_lead_submitted");

    return {
      requested,
      completed,
      failed,
      reportViewed: countEvents(events, "report_viewed"),
      paywallClicked: countEvents(events, "paywall_clicked"),
      leads,
      deepModeRequested: events.filter(hasDeepModeRequested).length,
      completionRate: rate(completed, requested),
      failureRate: rate(failed, requested),
      leadRate: rate(leads, requested),
    };
  }

  async summarizeScenarioMix(): Promise<Record<string, number>> {
    const events = await this.repository.listAnalyticsEvents();
    const summary: Record<string, number> = {};
    for (const event of events) {
      const scenarioType = event.properties.scenarioType;
      if (typeof scenarioType === "string" && scenarioType.trim()) {
        summary[scenarioType] = (summary[scenarioType] ?? 0) + 1;
      }
    }
    return summary;
  }

  async summarizeDeepModeHealth(): Promise<CommercialDeepModeHealth> {
    const events = (await this.repository.listAnalyticsEvents()).filter(hasDeepModeRequested);
    const completed = countEvents(events, "simulation_completed");
    const failed = countEvents(events, "simulation_failed");
    const fallbackStageCount = events.reduce((total, event) => {
      const value = event.properties.fallbackStageCount;
      return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);

    return {
      requested: events.length,
      completed,
      failed,
      fallbackStageCount,
      completionRate: rate(completed, events.length),
      failureRate: rate(failed, events.length),
    };
  }
}

function validationEventProperties(event: ValidationEvent): JsonObject {
  return Object.fromEntries(
    Object.entries(event).filter(
      ([key, value]) =>
        value !== undefined &&
        key !== "type" &&
        key !== "simulationId" &&
        key !== "createdAt" &&
        !PRIVATE_VALIDATION_FIELDS.has(key),
    ),
  );
}

function countEvents(events: AnalyticsEventRecord[], eventType: string): number {
  return events.filter((event) => event.eventType === eventType).length;
}

function hasDeepModeRequested(event: AnalyticsEventRecord): boolean {
  return event.properties.deepModeRequested === true;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundRatio(numerator / denominator);
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid analytics clock value");
  }
  return date.toISOString();
}
