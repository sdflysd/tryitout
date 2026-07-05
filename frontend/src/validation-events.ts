import type { SimulationType } from "./types";

export type ClientValidationEventType =
  | "input_started"
  | "simulation_requested"
  | "simulation_completed"
  | "simulation_failed"
  | "report_viewed"
  | "feedback_submitted"
  | "paywall_clicked"
  | "paywall_lead_submitted"
  | "share_clicked"
  | "route_comparison_viewed"
  | "deep_report_unlock_intent"
  | "share_card_opened"
  | "simulation_outcome_feedback"
  | "review_requested"
  | "deep_mode_requested"
  | "followup_submitted";

export interface ClientValidationEvent {
  type: ClientValidationEventType;
  simulationId?: string;
  scenarioType?: SimulationType;
  rating?: string;
  usefulness?: string;
  shareIntent?: string;
  priceIntent?: string;
  text?: string;
  contact?: string;
  errorCode?: string;
  durationMs?: number;
  deepModeRequested?: boolean;
  deepModeAvailable?: boolean;
  fallbackStageCount?: number;
  adoptedRecommendation?: string;
  outcomeCategory?: string;
}

export async function postValidationEvent(
  event: ClientValidationEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/validation/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    return response.ok;
  } catch {
    // Validation logging must never break the user's report flow.
    return false;
  }
}
