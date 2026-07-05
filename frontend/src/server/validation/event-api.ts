import { appendValidationEvent, sanitizeValidationEvent } from "./event-store.js";
import type { ValidationEvent } from "./event-store.js";

interface Deps {
  appendEvent?: (event: unknown) => Promise<ValidationEvent>;
}

export async function handleValidationEventRequest(
  body: unknown,
  deps: Deps = {},
): Promise<{ status: number; body: { ok?: boolean; event?: ValidationEvent; error?: string } }> {
  try {
    const appendEvent = deps.appendEvent ?? appendValidationEvent;
    const sanitized = sanitizeValidationEvent(body);
    const event = await appendEvent(sanitized);
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
