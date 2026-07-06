export const COMMERCIAL_SESSION_COOKIE_NAME = "tio_session";

export type CommercialSimulationRouteDecision =
  | { kind: "legacy" }
  | {
      kind: "commercial_task";
      requiresCredits: true;
      sessionToken: string;
    }
  | {
      kind: "reject";
      status: 401 | 410;
      error: "auth_required" | "commercial_task_required";
    };

export interface CommercialSimulationRouteInput {
  commercialModeEnabled: boolean;
  method: string;
  path: string;
  sessionToken?: string;
}

export function isCommercialModeEnabled(
  env: { COMMERCIAL_MODE_ENABLED?: string } = process.env,
): boolean {
  const value = env.COMMERCIAL_MODE_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function extractCommercialSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== COMMERCIAL_SESSION_COOKIE_NAME) {
      continue;
    }
    const value = rawValue.join("=");
    if (!value) {
      return undefined;
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function resolveCommercialSimulationRoute(
  input: CommercialSimulationRouteInput,
): CommercialSimulationRouteDecision {
  if (!input.commercialModeEnabled) {
    return { kind: "legacy" };
  }

  if (!isProtectedSimulationEntryPoint(input.method, input.path)) {
    return { kind: "legacy" };
  }

  if (!input.sessionToken) {
    return { kind: "reject", status: 401, error: "auth_required" };
  }

  if (input.method.toUpperCase() === "POST" && input.path === "/api/simulation-tasks") {
    return {
      kind: "commercial_task",
      requiresCredits: true,
      sessionToken: input.sessionToken,
    };
  }

  return { kind: "reject", status: 410, error: "commercial_task_required" };
}

function isProtectedSimulationEntryPoint(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") {
    return false;
  }
  return (
    path === "/api/simulation-tasks" ||
    path === "/api/simulations" ||
    path === "/api/simulations/stream"
  );
}
