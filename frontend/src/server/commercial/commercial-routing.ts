export type CommercialEnv =
  | NodeJS.ProcessEnv
  | Record<string, string | undefined>;

export type SimulationTaskRouteMode = "demo_file_task" | "commercial_task";

const LEGACY_SIMULATION_ROUTES = new Set([
  "/api/simulations",
  "/api/simulations/stream",
]);

export function isCommercialModeEnabled(env: CommercialEnv): boolean {
  return env.COMMERCIAL_MODE_ENABLED === "true";
}

export function shouldBlockLegacySimulationRoute(
  path: string,
  env: CommercialEnv,
): boolean {
  return isCommercialModeEnabled(env) && LEGACY_SIMULATION_ROUTES.has(path);
}

export function resolveSimulationTaskRouteMode(
  env: CommercialEnv,
): SimulationTaskRouteMode {
  return isCommercialModeEnabled(env) ? "commercial_task" : "demo_file_task";
}

export function legacySimulationRouteBlockedResponse(): {
  status: number;
  body: { error: string; code: string };
} {
  return {
    status: 401,
    body: {
      error: "Commercial mode requires authenticated paid simulation tasks",
      code: "commercial_authentication_required",
    },
  };
}
