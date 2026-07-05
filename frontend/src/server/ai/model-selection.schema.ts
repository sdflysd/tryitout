import type { ModelQuality, ModelSelection } from "./types.js";

const ALLOWED_KEYS = new Set([
  "mode",
  "modelProfileId",
  "userCredentialId",
  "modelIdOverride",
]);

const ALLOWED_MODES = new Set<ModelQuality>(["fast", "balanced", "deep"]);

type ValidationResult =
  | { ok: true; value: ModelSelection }
  | { ok: false; error: string };

export function validateModelSelection(body: unknown): ValidationResult {
  if (body === null || body === undefined) {
    return { ok: true, value: {} };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "modelSelection must be an object" };
  }

  const selection = body as Record<string, unknown>;
  for (const key of Object.keys(selection)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, error: `Unknown modelSelection key: ${key}` };
    }
  }

  const mode = selection.mode;
  if (mode !== undefined) {
    if (typeof mode !== "string" || !ALLOWED_MODES.has(mode as ModelQuality)) {
      return { ok: false, error: "mode must be fast, balanced, or deep" };
    }
  }

  const modelProfileId = selection.modelProfileId;
  if (modelProfileId !== undefined && typeof modelProfileId !== "string") {
    return { ok: false, error: "modelProfileId must be a string" };
  }
  if (typeof modelProfileId === "string" && modelProfileId.trim() === "") {
    return { ok: false, error: "modelProfileId must not be empty" };
  }

  const userCredentialId = selection.userCredentialId;
  if (userCredentialId !== undefined && typeof userCredentialId !== "string") {
    return { ok: false, error: "userCredentialId must be a string" };
  }

  const modelIdOverride = selection.modelIdOverride;
  if (modelIdOverride !== undefined) {
    return { ok: false, error: "modelIdOverride is not accepted in Phase 1" };
  }

  return {
    ok: true,
    value: {
      mode: mode as ModelQuality | undefined,
      modelProfileId: modelProfileId as string | undefined,
      userCredentialId: userCredentialId as string | undefined,
      modelIdOverride: modelIdOverride as string | undefined,
    },
  };
}
