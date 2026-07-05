import type { InteractionMode } from "../types.js";

export function resolveInteractionMode(
  interactiveModeAllowed: boolean,
  requestInteractionMode: unknown,
): InteractionMode {
  const requestedInteractionMode = requestInteractionMode === "enabled";

  return interactiveModeAllowed && requestedInteractionMode ? "enabled" : "legacy";
}
