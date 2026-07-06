import { randomUUID } from "node:crypto";

import type { ValidationEvent } from "../validation/event-store.js";
import { sanitizeValidationEvent } from "../validation/event-store.js";
import type { CommercialRepository } from "./repository.js";
import type { AnalyticsEventRecord } from "./types.js";

export interface AnalyticsServiceOptions {
  now?: () => Date;
}

export class AnalyticsService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: CommercialRepository,
    options: AnalyticsServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async recordValidationEvent(input: unknown): Promise<AnalyticsEventRecord> {
    const event = sanitizeValidationEvent(input);
    const record: AnalyticsEventRecord = {
      id: createId("analytics"),
      userId: undefined,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
      createdAt: this.now(),
    };

    await this.repository.appendAnalyticsEvent(record);
    return record;
  }
}

export function analyticsRecordToValidationEvent(record: AnalyticsEventRecord): ValidationEvent {
  return {
    ...(record.payload as Partial<ValidationEvent>),
    type: record.eventType as ValidationEvent["type"],
    createdAt: record.createdAt.toISOString(),
  };
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
