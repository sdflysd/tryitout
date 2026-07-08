import { appendValidationEvent, sanitizeValidationEvent } from "./event-store.js";
import type { ValidationEvent } from "./event-store.js";
import {
  analyticsRecordToValidationEvent,
  type AnalyticsService,
} from "../commercial/analytics-service.js";

interface Deps {
  appendEvent?: (event: unknown) => Promise<ValidationEvent>;
  analyticsService?: {
    recordValidationEvent(event: ValidationEvent): Promise<unknown>;
  };
}

export async function handleValidationEventRequest(
  body: unknown,
  deps: Deps = {},
): Promise<{ status: number; body: { ok?: boolean; event?: ValidationEvent; error?: string } }> {
  try {
    const sanitized = sanitizeValidationEvent(body);
    const event =
      deps.analyticsService === undefined
        ? await (deps.appendEvent ?? appendValidationEvent)(sanitized)
        : await recordCommercialValidationEvent(sanitized, deps.analyticsService);
    return { status: 200, body: { ok: true, event } };
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error instanceof Error ? error.message : "invalid validation event",
      },
    };
  }
}

async function recordCommercialValidationEvent(
  event: ValidationEvent,
  analyticsService: NonNullable<Deps["analyticsService"]>,
): Promise<ValidationEvent> {
  const publicEvent = stripPrivateValidationFields(event);
  await analyticsService.recordValidationEvent(publicEvent);
  return publicEvent;
}

function stripPrivateValidationFields(event: ValidationEvent): ValidationEvent {
  const { text: _text, contact: _contact, ...publicEvent } = event;
  return publicEvent;
}
