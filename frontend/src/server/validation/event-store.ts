import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const VALIDATION_EVENT_TYPES = [
  "input_started",
  "simulation_requested",
  "simulation_completed",
  "simulation_failed",
  "report_viewed",
  "feedback_submitted",
  "paywall_clicked",
  "paywall_lead_submitted",
  "share_clicked",
  "route_comparison_viewed",
  "deep_report_unlock_intent",
  "share_card_opened",
  "simulation_outcome_feedback",
  "review_requested",
  "deep_mode_requested",
  "followup_submitted",
] as const;

export type ValidationEventType = typeof VALIDATION_EVENT_TYPES[number];
export type ValidationScenarioType = "side_hustle" | "dating" | "life_choice";

export interface ValidationEvent {
  type: ValidationEventType;
  simulationId?: string;
  scenarioType?: ValidationScenarioType;
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
  createdAt?: string;
}

const EVENT_TYPES = new Set<string>(VALIDATION_EVENT_TYPES);
const SCENARIO_TYPES = new Set<string>(["side_hustle", "dating", "life_choice"]);

function readString(raw: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = raw[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function readBoolean(raw: Record<string, unknown>, key: string): boolean | undefined {
  const value = raw[key];
  return typeof value === "boolean" ? value : undefined;
}

function readDuration(raw: Record<string, unknown>): number | undefined {
  const value = raw.durationMs;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

function readNonNegativeInteger(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

export function sanitizeValidationEvent(input: unknown): ValidationEvent {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("validation event must be an object");
  }

  const raw = input as Record<string, unknown>;
  const type = readString(raw, "type", 80);
  if (!type || !EVENT_TYPES.has(type)) {
    throw new Error("unknown validation event type");
  }

  const scenarioType = readString(raw, "scenarioType", 40);
  if (scenarioType && !SCENARIO_TYPES.has(scenarioType)) {
    throw new Error("invalid scenarioType");
  }

  const event: ValidationEvent = {
    type: type as ValidationEventType,
  };

  if (scenarioType) event.scenarioType = scenarioType as ValidationScenarioType;
  event.simulationId = readString(raw, "simulationId", 80);
  event.rating = readString(raw, "rating", 40);
  event.usefulness = readString(raw, "usefulness", 40);
  event.shareIntent = readString(raw, "shareIntent", 40);
  event.priceIntent = readString(raw, "priceIntent", 40);
  event.text = readString(raw, "text", 240);
  event.contact = readString(raw, "contact", 120);
  event.errorCode = readString(raw, "errorCode", 120);
  event.durationMs = readDuration(raw);
  event.deepModeRequested = readBoolean(raw, "deepModeRequested");
  event.deepModeAvailable = readBoolean(raw, "deepModeAvailable");
  event.fallbackStageCount = readNonNegativeInteger(raw, "fallbackStageCount");
  event.adoptedRecommendation = readString(raw, "adoptedRecommendation", 40);
  event.outcomeCategory = readString(raw, "outcomeCategory", 40);

  return Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined),
  ) as ValidationEvent;
}

export async function appendValidationEvent(
  input: unknown,
  options: { filePath?: string } = {},
): Promise<ValidationEvent> {
  const event = {
    ...sanitizeValidationEvent(input),
    createdAt: new Date().toISOString(),
  };
  const filePath =
    options.filePath ??
    path.join(process.cwd(), "..", "output", "validation", "events.jsonl");

  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}
