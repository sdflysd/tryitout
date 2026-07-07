export interface AdminOverviewDto {
  users: {
    total: number;
    active: number;
    disabled: number;
    redeemed: number;
  };
  tasks: {
    total: number;
    byStatus: {
      queued: number;
      running: number;
      completed: number;
      failed: number;
      cancelled: number;
      refunded: number;
    };
    completionRate: number;
    failureRate: number;
  };
  credits: {
    totalBalance: number;
    totalFrozen: number;
    totalRedeemed: number;
    consumed: number;
  };
  costs: {
    estimatedTotal: number;
  };
  queue: {
    backlog: number;
    oldestQueuedAt?: string;
  };
  accessCodes: {
    total: number;
    active: number;
    redeemed: number;
    disabled: number;
    expired: number;
  };
}

export type AdminUserTierDto = "basic" | "pro" | "business";
export type AdminCommercialFeatureDto =
  | "deep_mode"
  | "priority_queue"
  | "custom_model_provider"
  | "admin_ops";

export interface AdminAccessCodeBatchDto {
  id: string;
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  disabledAt?: string;
  notes?: string;
  createdAt: string;
  status: "active" | "disabled" | "expired";
  redeemedCount: number;
  activeCount: number;
  disabledCount: number;
  expiredCount: number;
  redemptionRate: number;
}

export interface AdminCreatedAccessCodeDto {
  id: string;
  rawCode: string;
  codeMask: string;
  status: "active" | "redeemed" | "disabled" | "expired";
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  createdAt: string;
}

export interface AdminCreateAccessCodeBatchInputDto {
  name: string;
  source?: string;
  codeCount: number;
  credits: number;
  tier?: AdminUserTierDto;
  features: AdminCommercialFeatureDto[];
  expiresAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface AdminCreateAccessCodeBatchResultDto {
  batch: {
    id: string;
    createdByUserId?: string;
    name: string;
    source?: string;
    codeCount: number;
    credits: number;
    tier?: AdminUserTierDto;
    features: AdminCommercialFeatureDto[];
    expiresAt?: string;
    disabledAt?: string;
    notes?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  codes: AdminCreatedAccessCodeDto[];
}

export interface AdminDisableAccessCodeBatchResultDto {
  batch: AdminCreateAccessCodeBatchResultDto["batch"];
  disabledCodeCount: number;
}

export class AdminClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AdminClientError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchAdminOverview(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminOverviewDto> {
  const body = await requestAdminJson("/api/admin/overview", {}, fetchImpl);
  assertObjectWithProperty(body, "overview", "Invalid admin overview response");

  return body.overview as unknown as AdminOverviewDto;
}

export async function createAdminAccessCodeBatch(
  input: AdminCreateAccessCodeBatchInputDto,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminCreateAccessCodeBatchResultDto> {
  const body = await requestAdminJson(
    "/api/admin/access-codes/batches",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "batch", "Invalid access-code batch response");
  assertObjectWithProperty(body, "codes", "Invalid access-code batch response");

  return body as unknown as AdminCreateAccessCodeBatchResultDto;
}

export async function disableAdminAccessCodeBatch(
  batchId: string,
  reason: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AdminDisableAccessCodeBatchResultDto> {
  const body = await requestAdminJson(
    `/api/admin/access-codes/batches/${encodeURIComponent(batchId)}/disable`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    fetchImpl,
  );
  assertObjectWithProperty(body, "batch", "Invalid access-code disable response");
  assertObjectWithProperty(body, "disabledCodeCount", "Invalid access-code disable response");

  return body as unknown as AdminDisableAccessCodeBatchResultDto;
}

async function requestAdminJson(
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
    throw new AdminClientError(
      response.status,
      typeof errorBody.error === "string" ? errorBody.error : "Admin request failed",
      typeof errorBody.code === "string" ? errorBody.code : undefined,
    );
  }
  if (!isObject(body)) {
    throw new AdminClientError(response.status, "Invalid admin response");
  }

  return body;
}

function assertObjectWithProperty(
  value: Record<string, unknown>,
  property: string,
  message: string,
): void {
  if (!(property in value)) {
    throw new AdminClientError(200, message);
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
