import type {
  Agent,
  RouteComparison,
  SimulationRoute,
  SimulationStage,
  SimulationType,
  UserInput,
  WorldState,
} from "../../types.js";

export function buildRouteComparisonPrompt(params: {
  type: SimulationType;
  userInput: UserInput;
  agents: Agent[];
  stages: SimulationStage[];
}): string {
  const routeLanguage = {
    side_hustle:
      "Compare 2-3 routes: original route, MVP/manual validation route, and pivot route.",
    dating:
      "Compare 2-3 routes: direct route, space/low-pressure route, and repair route.",
    life_choice:
      "Compare 2-3 routes based on the user's lifeChoiceOptions, including hybrid or fallback routes only when useful.",
  }[params.type];

  return `
${routeLanguage}

User input:
${JSON.stringify(params.userInput, null, 2)}

Agents:
${JSON.stringify(
  params.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    stance: agent.stance,
    keyJudgment: agent.keyJudgment,
    objection: agent.objection,
  })),
  null,
  2,
)}

Completed stages:
${JSON.stringify(
  params.stages.map((stage) => ({
    stageIndex: stage.stageIndex,
    title: stage.title,
    summary: stage.summary,
    stateAfter: stage.stateAfter,
    keyDecision: stage.keyDecision,
    nextSuggestion: stage.nextSuggestion,
  })),
  null,
  2,
)}

Return only JSON:
{
  "routeComparison": {
    "recommendedRouteId": "stable_route_id",
    "routes": [
      {
        "id": "stable_route_id",
        "label": "A",
        "title": "route title",
        "premise": "what this route assumes",
        "stageSummaries": ["how this route evolves"],
        "finalState": {
          "day": 30,
          "productClarity": 0,
          "executionEnergy": 0,
          "trafficProgress": 0,
          "trialUsers": 0,
          "paidUsers": 0,
          "revenue": 0,
          "riskLevel": 0,
          "confidence": 0
        },
        "successProbability": 0,
        "regretRisk": 0,
        "upside": "best case",
        "downside": "main cost",
        "triggerToChoose": "observable signal that makes this route right"
      }
    ],
    "tradeoffs": ["tradeoff"],
    "sensitivityVariables": ["variable"],
    "sevenDayProbe": ["day 1-7 validation action"]
  }
}
Rules: include 2-3 routes only, clamp numeric scores to 0-100, keep copy concise and specific.
`;
}

export function normalizeRouteComparison(
  value: unknown,
  fallbackState: WorldState,
): RouteComparison | undefined {
  const raw = unwrapRouteComparison(value);
  if (!raw || !Array.isArray(raw.routes)) {
    return undefined;
  }

  const routes = raw.routes
    .map((route) => normalizeRoute(route, fallbackState))
    .filter((route): route is SimulationRoute => Boolean(route))
    .slice(0, 3);

  if (routes.length < 2) {
    return undefined;
  }

  const recommendedRouteId = readString(raw.recommendedRouteId, 80) || routes[0].id;
  const recommendedExists = routes.some((route) => route.id === recommendedRouteId);

  return {
    recommendedRouteId: recommendedExists ? recommendedRouteId : routes[0].id,
    routes,
    tradeoffs: readStringArray(raw.tradeoffs, 5, 120),
    sensitivityVariables: readStringArray(raw.sensitivityVariables, 5, 120),
    sevenDayProbe: readStringArray(raw.sevenDayProbe, 7, 160),
  };
}

function unwrapRouteComparison(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const nested = raw.routeComparison;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return raw;
}

function normalizeRoute(
  value: unknown,
  fallbackState: WorldState,
): SimulationRoute | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const id = readString(raw.id, 80);
  const title = readString(raw.title, 120);
  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    label: readString(raw.label, 20) || id,
    title,
    premise: readString(raw.premise, 240) || "",
    stageSummaries: readStringArray(raw.stageSummaries, 5, 200),
    finalState: normalizeWorldState(raw.finalState, fallbackState),
    successProbability: clampScore(raw.successProbability),
    regretRisk: clampScore(raw.regretRisk),
    upside: readString(raw.upside, 200) || "",
    downside: readString(raw.downside, 200) || "",
    triggerToChoose: readString(raw.triggerToChoose, 200) || "",
  };
}

function normalizeWorldState(value: unknown, fallbackState: WorldState): WorldState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallbackState;
  }

  const raw = value as Record<string, unknown>;
  return {
    day: readNumber(raw.day, fallbackState.day),
    productClarity: clampScore(raw.productClarity, fallbackState.productClarity),
    executionEnergy: clampScore(raw.executionEnergy, fallbackState.executionEnergy),
    trafficProgress: clampScore(raw.trafficProgress, fallbackState.trafficProgress),
    trialUsers: readNumber(raw.trialUsers, fallbackState.trialUsers),
    paidUsers: readNumber(raw.paidUsers, fallbackState.paidUsers),
    revenue: readNumber(raw.revenue, fallbackState.revenue),
    riskLevel: clampScore(raw.riskLevel, fallbackState.riskLevel),
    confidence: clampScore(raw.confidence, fallbackState.confidence),
  };
}

function readString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(value);
}

function clampScore(value: unknown, fallback = 0): number {
  return Math.min(100, Math.max(0, readNumber(value, fallback)));
}
