import {
  getConfiguredProvider,
  getMissingProviderConfigMessage,
} from "../ai/provider-config.js";
import type { AgentRuntimeCapabilities } from "../../types.js";

type Env = Record<string, string | undefined>;

interface ResolveAgentRuntimeCapabilitiesParams {
  env?: Env;
}

export function resolveAgentRuntimeCapabilities({
  env = process.env,
}: ResolveAgentRuntimeCapabilitiesParams = {}): AgentRuntimeCapabilities {
  let providerConfigured = false;
  let providerReason = "";

  try {
    const provider = getConfiguredProvider(env);
    const missingMessage = getMissingProviderConfigMessage(provider, env);
    providerConfigured = !missingMessage;
    providerReason = missingMessage ? "AI provider is not configured." : "";
  } catch {
    providerReason = "AI provider is not configured.";
  }

  const flagEnabled = env.ENABLE_AGENT_INTERACTION_MODE === "true";
  const deepModeAvailable = providerConfigured && flagEnabled;
  const reason = deepModeAvailable
    ? ""
    : providerReason || "Deep Agent mode is not enabled on this server.";

  return {
    deepModeAvailable,
    defaultInteractionMode: deepModeAvailable ? "enabled" : "legacy",
    fallbackPolicy: "safe_stage_fallback",
    providerConfigured,
    reason,
  };
}
