import type { AgentAction, AgentVote, AgentVerdict, Event, WorldStateDelta } from "../../types.js";

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface WorldEventResponse {
  event: Event;
}

interface AgentActionsResponse {
  actions: AgentAction[];
  votes: AgentVote[];
}

interface ArbiterResponse {
  summary: string;
  acceptedAgentIds: string[];
  rejectedAgentIds: string[];
  verdict?: AgentVerdict;
  finalDelta: WorldStateDelta;
  keyDecision: string;
  nextSuggestion: string;
}

const eventTypes = new Set<Event["type"]>([
  "execution",
  "customer_feedback",
  "competitor_pressure",
  "platform_traffic",
  "external_influence",
  "monetization_attempt",
  "dating_response",
  "emotional_clash",
  "reality_check",
]);

const impacts = new Set<Event["impact"]>(["positive", "negative", "neutral"]);

const actionTypes = new Set<AgentAction["type"]>([
  "like",
  "dislike",
  "reply",
  "challenge",
  "support",
  "warn",
  "vote",
  "update_memory",
]);

const verdicts = new Set<AgentVerdict>(["continue", "pivot", "stop", "wait", "escalate"]);

const worldDeltaFields = new Set<keyof WorldStateDelta>([
  "day",
  "productClarity",
  "executionEnergy",
  "trafficProgress",
  "trialUsers",
  "paidUsers",
  "revenue",
  "riskLevel",
  "confidence",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringArray(value: unknown, label: string): string | null {
  if (!Array.isArray(value)) {
    return `${label} must be an array`;
  }

  if (!value.every((entry) => typeof entry === "string")) {
    return `${label} must contain only strings`;
  }

  return null;
}

function validateWorldStateDelta(value: unknown, label: string): string | null {
  if (!isObject(value)) {
    return `${label} must be an object`;
  }

  for (const [key, deltaValue] of Object.entries(value)) {
    if (!worldDeltaFields.has(key as keyof WorldStateDelta)) {
      return `${label} contains unknown field ${key}`;
    }
    if (typeof deltaValue !== "number" || !Number.isFinite(deltaValue)) {
      return `${label}.${key} must be a finite number`;
    }
  }

  return null;
}

function validateEvent(value: unknown): string | null {
  if (!isObject(value)) {
    return "event must be an object";
  }

  if (!eventTypes.has(value.type as Event["type"])) {
    return "event.type is invalid";
  }
  if (!isNonEmptyString(value.title)) {
    return "event.title must be a non-empty string";
  }
  if (!isNonEmptyString(value.description)) {
    return "event.description must be a non-empty string";
  }
  if (!impacts.has(value.impact as Event["impact"])) {
    return "event.impact is invalid";
  }

  return null;
}

function validateAction(value: unknown, index: number): string | null {
  if (!isObject(value)) {
    return `actions[${index}] must be an object`;
  }

  if (!isNonEmptyString(value.id)) {
    return `actions[${index}].id must be a non-empty string`;
  }
  if (!actionTypes.has(value.type as AgentAction["type"])) {
    return `actions[${index}].type has unknown action type`;
  }
  if (!isNonEmptyString(value.actorAgentId)) {
    return `actions[${index}].actorAgentId must be a non-empty string`;
  }
  if (value.targetAgentId !== undefined && !isNonEmptyString(value.targetAgentId)) {
    return `actions[${index}].targetAgentId must be a non-empty string when present`;
  }
  if (!isNonEmptyString(value.content)) {
    return `actions[${index}].content must be a non-empty string`;
  }
  if (!isNonEmptyString(value.reason)) {
    return `actions[${index}].reason must be a non-empty string`;
  }
  if (!impacts.has(value.impact as AgentAction["impact"])) {
    return `actions[${index}].impact is invalid`;
  }
  if (value.stateDeltaHint !== undefined) {
    return validateWorldStateDelta(value.stateDeltaHint, `actions[${index}].stateDeltaHint`);
  }

  return null;
}

function validateVote(value: unknown, index: number): string | null {
  if (!isObject(value)) {
    return `votes[${index}] must be an object`;
  }

  if (!isNonEmptyString(value.agentId)) {
    return `votes[${index}].agentId must be a non-empty string`;
  }
  if (!verdicts.has(value.verdict as AgentVerdict)) {
    return `votes[${index}].verdict is invalid`;
  }
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) {
    return `votes[${index}].confidence must be a finite number`;
  }

  const deltaError = validateWorldStateDelta(value.stateDeltaVote, `votes[${index}].stateDeltaVote`);
  if (deltaError) {
    return deltaError;
  }

  if (!isNonEmptyString(value.rationale)) {
    return `votes[${index}].rationale must be a non-empty string`;
  }

  return null;
}

export function validateWorldEventResponse(response: unknown): ValidationResult<WorldEventResponse> {
  if (!isObject(response)) {
    return { ok: false, error: "response must be an object" };
  }

  const eventError = validateEvent(response.event);
  if (eventError) {
    return { ok: false, error: eventError };
  }

  return {
    ok: true,
    value: {
      event: response.event as Event,
    },
  };
}

export function validateAgentActionsResponse(response: unknown): ValidationResult<AgentActionsResponse> {
  if (!isObject(response)) {
    return { ok: false, error: "response must be an object" };
  }
  if (!Array.isArray(response.actions)) {
    return { ok: false, error: "actions must be an array" };
  }
  if (!Array.isArray(response.votes)) {
    return { ok: false, error: "votes must be an array" };
  }

  for (const [index, action] of response.actions.entries()) {
    const actionError = validateAction(action, index);
    if (actionError) {
      return { ok: false, error: actionError };
    }
  }

  for (const [index, vote] of response.votes.entries()) {
    const voteError = validateVote(vote, index);
    if (voteError) {
      return { ok: false, error: voteError };
    }
  }

  return {
    ok: true,
    value: {
      actions: response.actions as AgentAction[],
      votes: response.votes as AgentVote[],
    },
  };
}

export function validateArbiterResponse(response: unknown): ValidationResult<ArbiterResponse> {
  if (!isObject(response)) {
    return { ok: false, error: "response must be an object" };
  }

  if (!isNonEmptyString(response.summary)) {
    return { ok: false, error: "summary must be a non-empty string" };
  }

  const acceptedError = validateStringArray(response.acceptedAgentIds, "acceptedAgentIds");
  if (acceptedError) {
    return { ok: false, error: acceptedError };
  }

  const rejectedError = validateStringArray(response.rejectedAgentIds, "rejectedAgentIds");
  if (rejectedError) {
    return { ok: false, error: rejectedError };
  }

  if (response.verdict !== undefined && !verdicts.has(response.verdict as AgentVerdict)) {
    return { ok: false, error: "verdict is invalid" };
  }

  const finalDeltaError = validateWorldStateDelta(response.finalDelta, "finalDelta");
  if (finalDeltaError) {
    return { ok: false, error: finalDeltaError };
  }

  if (!isNonEmptyString(response.keyDecision)) {
    return { ok: false, error: "keyDecision must be a non-empty string" };
  }

  if (!isNonEmptyString(response.nextSuggestion)) {
    return { ok: false, error: "nextSuggestion must be a non-empty string" };
  }

  return {
    ok: true,
    value: {
      summary: response.summary,
      acceptedAgentIds: response.acceptedAgentIds as string[],
      rejectedAgentIds: response.rejectedAgentIds as string[],
      verdict: response.verdict as AgentVerdict | undefined,
      finalDelta: response.finalDelta as WorldStateDelta,
      keyDecision: response.keyDecision,
      nextSuggestion: response.nextSuggestion,
    },
  };
}
