import type { AiCallRequest, AiCallResult, AiProviderType } from "../types.js";

export interface AiProviderAdapter {
  readonly provider: AiProviderType;
  generateJson<T>(request: AiCallRequest): Promise<AiCallResult<T>>;
  healthCheck?(): Promise<{ ok: boolean; message?: string }>;
}
