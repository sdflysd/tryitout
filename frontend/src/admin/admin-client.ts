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
  const response = await fetchImpl("/api/admin/overview", {
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
  if (!isObject(body) || !isObject(body.overview)) {
    throw new AdminClientError(response.status, "Invalid admin overview response");
  }

  return body.overview as unknown as AdminOverviewDto;
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
