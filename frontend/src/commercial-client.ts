import type { CommercialEntitlements } from "./contracts/commercial";

export interface CommercialUser {
  id: string;
  email: string;
  tier: CommercialEntitlements["tier"];
  features: CommercialEntitlements["features"];
  isAdmin: boolean;
}

export interface CommercialAuthResponse {
  user: CommercialUser;
}

export interface CommercialCreditsResponse {
  balance: number;
}

export interface AdminDashboardSummary {
  overview: {
    activeUsers: number;
    creditsHeld: number;
    openTasks: number;
    feedbackCount: number;
  };
  users: Array<{
    id: string;
    email: string;
    status: string;
    balance: number;
    tier: string;
  }>;
  accessCodes: Array<{
    id: string;
    maskedCode: string;
    status: string;
    credits: number;
    tier: string;
  }>;
  tasks: Array<{
    id: string;
    userEmail: string;
    status: string;
    scenario: string;
    creditCost: number;
  }>;
  feedback: Array<{
    id: string;
    userEmail: string;
    rating: number;
    useful: boolean;
    text: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    target: string;
    actor: string;
  }>;
}

export interface CreatedAdminAccessCode {
  accessCodeId: string;
  rawCode: string;
  maskedCode: string;
}

export async function registerCommercialUser(
  input: { email: string; password: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CommercialAuthResponse> {
  return readJsonResponse(
    await fetchImpl("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function loginCommercialUser(
  input: { email: string; password: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CommercialAuthResponse> {
  return readJsonResponse(
    await fetchImpl("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getCommercialUser(
  fetchImpl: typeof fetch = fetch,
): Promise<CommercialAuthResponse> {
  return readJsonResponse(
    await fetchImpl("/api/me", {
      credentials: "include",
    }),
  );
}

export async function logoutCommercialUser(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await readJsonResponse(
    await fetchImpl("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }),
  );
}

export async function getCommercialCredits(
  fetchImpl: typeof fetch = fetch,
): Promise<CommercialCreditsResponse> {
  return readJsonResponse(
    await fetchImpl("/api/credits", {
      credentials: "include",
    }),
  );
}

export async function redeemCommercialAccessCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommercialCreditsResponse> {
  return readJsonResponse(
    await fetchImpl("/api/credits/redeem", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

export async function getAdminDashboardSummary(
  fetchImpl: typeof fetch = fetch,
): Promise<AdminDashboardSummary> {
  return readJsonResponse(
    await fetchImpl("/api/admin/summary", {
      credentials: "include",
    }),
  );
}

export async function createAdminAccessCode(
  input: { creditAmount: number; tier: CommercialEntitlements["tier"]; features: CommercialEntitlements["features"] },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessCode: CreatedAdminAccessCode }> {
  return readJsonResponse(
    await fetchImpl("/api/admin/access-codes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function createAdminAccessCodeBatch(
  input: {
    count: number;
    creditAmount: number;
    tier: CommercialEntitlements["tier"];
    features: CommercialEntitlements["features"];
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessCodes: CreatedAdminAccessCode[] }> {
  return readJsonResponse(
    await fetchImpl("/api/admin/access-codes/batch", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function disableAdminAccessCode(
  accessCodeId: string,
  reason: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean }> {
  return readJsonResponse(
    await fetchImpl(`/api/admin/access-codes/${encodeURIComponent(accessCodeId)}/disable`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
  );
}

export async function adjustAdminCredits(
  input: { userId: string; amount: number; reason: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ balance: number; ledgerEntryId: string }> {
  return readJsonResponse(
    await fetchImpl("/api/admin/credits/adjust", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateAdminSystemSetting(
  input: { key: string; value: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
): Promise<{ setting: { key: string; value: Record<string, unknown> } }> {
  return readJsonResponse(
    await fetchImpl(`/api/admin/settings/${encodeURIComponent(input.key)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: input.value }),
    }),
  );
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.error === "string" ? body.error : `HTTP error ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}
