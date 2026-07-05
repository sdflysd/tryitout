import type { AgentRuntimeCapabilities } from "./types";

const SAFE_LEGACY_CAPABILITIES: AgentRuntimeCapabilities = {
  deepModeAvailable: false,
  defaultInteractionMode: "legacy",
  fallbackPolicy: "safe_stage_fallback",
  providerConfigured: false,
  reason: "Unable to read Agent runtime capabilities.",
};

export async function fetchAgentRuntimeCapabilities(
  fetchImpl: typeof fetch = fetch,
): Promise<AgentRuntimeCapabilities> {
  try {
    const response = await fetchImpl("/api/agent-runtime/capabilities");
    if (!response.ok) {
      return SAFE_LEGACY_CAPABILITIES;
    }
    return await response.json() as AgentRuntimeCapabilities;
  } catch {
    return SAFE_LEGACY_CAPABILITIES;
  }
}
