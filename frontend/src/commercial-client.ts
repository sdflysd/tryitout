import type {
  CommercialFeature,
  CreditLedgerEntryType,
  UserRole,
  UserTier,
} from "./contracts/commercial.js";

export interface CommercialUserDto {
  id: string;
  email: string;
  emailNormalized: string;
  role: UserRole;
  tier: UserTier;
  status: "active" | "disabled" | "deleted";
  features: CommercialFeature[];
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialCreditAccountDto {
  userId: string;
  balance: number;
  frozenCredits: number;
  totalRedeemed: number;
  totalCaptured: number;
  updatedAt: string;
}

export interface CommercialCreditLedgerEntryDto {
  id: string;
  userId: string;
  taskId?: string;
  accessCodeId?: string;
  entryType: CreditLedgerEntryType;
  amount: number;
  balanceAfter: number;
  frozenAfter?: number;
  idempotencyKey: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CommercialAccessCodeRedemptionDto {
  id: string;
  accessCodeId: string;
  userId: string;
  creditLedgerId?: string;
  credits: number;
  tierGranted?: UserTier;
  featuresGranted: CommercialFeature[];
  redeemedAt: string;
  metadata: Record<string, unknown>;
}

export interface CommercialCredentialsDto {
  email: string;
  password: string;
}

export interface RedeemAccessCodeInputDto {
  code: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface RedeemAccessCodeResultDto {
  account: CommercialCreditAccountDto;
  ledger: CommercialCreditLedgerEntryDto;
  redemption: CommercialAccessCodeRedemptionDto;
}

export interface PublicModelProviderDto {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKeyMask: string;
  modelFast?: string;
  modelBalanced?: string;
  modelDeep?: string;
  status: "active" | "disabled";
  lastTestedAt?: string;
  lastTestStatus?: "passed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface SaveModelProviderInputDto {
  provider: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  modelFast?: string;
  modelBalanced?: string;
  modelDeep?: string;
}

export class CommercialClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "CommercialClientError";
    this.status = status;
    this.code = code;
  }
}

export async function registerCommercialUser(
  input: CommercialCredentialsDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ user: CommercialUserDto }> {
  const body = await requestCommercialJson(
    "/api/auth/register",
    jsonRequest("POST", input),
    fetchImpl,
  );
  assertObjectWithProperty(body, "user", "Invalid registration response");

  return body as unknown as { user: CommercialUserDto };
}

export async function loginCommercialUser(
  input: CommercialCredentialsDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ user: CommercialUserDto }> {
  const body = await requestCommercialJson(
    "/api/auth/login",
    jsonRequest("POST", input),
    fetchImpl,
  );
  assertObjectWithProperty(body, "user", "Invalid login response");

  return body as unknown as { user: CommercialUserDto };
}

export async function logoutCommercialUser(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean }> {
  const body = await requestCommercialJson(
    "/api/auth/logout",
    { method: "POST" },
    fetchImpl,
  );

  return body as unknown as { ok: boolean };
}

export async function fetchCommercialMe(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ user: CommercialUserDto }> {
  const body = await requestCommercialJson("/api/me", {}, fetchImpl);
  assertObjectWithProperty(body, "user", "Invalid current-user response");

  return body as unknown as { user: CommercialUserDto };
}

export async function fetchCommercialCredits(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ account: CommercialCreditAccountDto }> {
  const body = await requestCommercialJson("/api/credits", {}, fetchImpl);
  assertObjectWithProperty(body, "account", "Invalid credit account response");

  return body as unknown as { account: CommercialCreditAccountDto };
}

export async function redeemAccessCode(
  input: RedeemAccessCodeInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RedeemAccessCodeResultDto> {
  const body = await requestCommercialJson(
    "/api/credits/redeem",
    jsonRequest("POST", input),
    fetchImpl,
  );
  assertObjectWithProperty(body, "account", "Invalid redemption response");
  assertObjectWithProperty(body, "ledger", "Invalid redemption response");
  assertObjectWithProperty(body, "redemption", "Invalid redemption response");

  return body as unknown as RedeemAccessCodeResultDto;
}

export async function saveModelProvider(
  input: SaveModelProviderInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ provider: PublicModelProviderDto }> {
  const body = await requestCommercialJson(
    "/api/model-provider",
    jsonRequest("PUT", input),
    fetchImpl,
  );
  assertObjectWithProperty(body, "provider", "Invalid model provider response");
  return body as unknown as { provider: PublicModelProviderDto };
}

export async function fetchModelProvider(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ provider?: PublicModelProviderDto }> {
  const body = await requestCommercialJson("/api/model-provider", {}, fetchImpl);
  return body as unknown as { provider?: PublicModelProviderDto };
}

export async function testModelProvider(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ provider: PublicModelProviderDto }> {
  const body = await requestCommercialJson(
    "/api/model-provider/test",
    { method: "POST" },
    fetchImpl,
  );
  assertObjectWithProperty(body, "provider", "Invalid model provider test response");
  return body as unknown as { provider: PublicModelProviderDto };
}

export async function deleteModelProvider(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ provider: PublicModelProviderDto }> {
  const body = await requestCommercialJson(
    "/api/model-provider",
    { method: "DELETE" },
    fetchImpl,
  );
  assertObjectWithProperty(body, "provider", "Invalid model provider delete response");
  return body as unknown as { provider: PublicModelProviderDto };
}

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function requestCommercialJson(
  input: RequestInfo | URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(input, {
    ...init,
    credentials: "include",
  });
  const body = await readJson(response);
  if (!response.ok) {
    const errorBody = isObject(body) ? body : {};
    throw new CommercialClientError(
      response.status,
      typeof errorBody.error === "string" ? errorBody.error : "Commercial request failed",
      typeof errorBody.code === "string" ? errorBody.code : undefined,
    );
  }
  if (!isObject(body)) {
    throw new CommercialClientError(response.status, "Invalid commercial response");
  }

  return body;
}

function assertObjectWithProperty(
  value: Record<string, unknown>,
  property: string,
  message: string,
): void {
  if (!(property in value)) {
    throw new CommercialClientError(200, message);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
