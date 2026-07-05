import type { WorldState, WorldStateDelta } from "../../types.js";

const SCORE_FIELDS = [
  "productClarity",
  "executionEnergy",
  "trafficProgress",
  "riskLevel",
  "confidence",
] as const;

const COUNT_FIELDS = ["trialUsers", "paidUsers", "revenue"] as const;
const DELTA_NUMBER_FIELDS = [...SCORE_FIELDS, ...COUNT_FIELDS] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function applyStateDelta(state: WorldState, delta: WorldStateDelta): WorldState {
  return {
    day: delta.day ?? state.day,
    productClarity: clamp(state.productClarity + (delta.productClarity ?? 0), 0, 100),
    executionEnergy: clamp(state.executionEnergy + (delta.executionEnergy ?? 0), 0, 100),
    trafficProgress: clamp(state.trafficProgress + (delta.trafficProgress ?? 0), 0, 100),
    trialUsers: Math.max(0, Math.round(state.trialUsers + (delta.trialUsers ?? 0))),
    paidUsers: Math.max(0, Math.round(state.paidUsers + (delta.paidUsers ?? 0))),
    revenue: Math.max(0, Math.round(state.revenue + (delta.revenue ?? 0))),
    riskLevel: clamp(state.riskLevel + (delta.riskLevel ?? 0), 0, 100),
    confidence: clamp(state.confidence + (delta.confidence ?? 0), 0, 100),
  };
}

export function mergeStateDeltas(deltas: WorldStateDelta[]): WorldStateDelta {
  if (deltas.length === 0) {
    return {};
  }

  const merged: WorldStateDelta = {};

  for (const field of SCORE_FIELDS) {
    const values = deltas
      .map((delta) => delta[field])
      .filter((value): value is number => typeof value === "number");

    if (values.length > 0) {
      merged[field] = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    }
  }

  for (const field of COUNT_FIELDS) {
    const values = deltas
      .map((delta) => delta[field])
      .filter((value): value is number => typeof value === "number");

    if (values.length > 0) {
      merged[field] = Math.round(values.reduce((sum, value) => sum + value, 0));
    }
  }

  const dayValues = deltas
    .map((delta) => delta.day)
    .filter((value): value is number => typeof value === "number");

  if (dayValues.length > 0) {
    merged.day = Math.max(...dayValues);
  }

  return merged;
}

export function clampStateDelta(delta: WorldStateDelta, maxAbsChange = 25): WorldStateDelta {
  const clamped: WorldStateDelta = {};
  if (typeof delta.day === "number") {
    clamped.day = delta.day;
  }

  for (const field of DELTA_NUMBER_FIELDS) {
    const value = delta[field];
    if (typeof value === "number") {
      clamped[field] = Math.max(-maxAbsChange, Math.min(maxAbsChange, Math.round(value)));
    }
  }

  return clamped;
}
