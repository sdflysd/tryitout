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

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.error === "string" ? body.error : `HTTP error ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}
