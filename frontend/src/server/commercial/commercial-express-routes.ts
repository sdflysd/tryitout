import type {
  CommercialApiRequest,
  CommercialApiResponse,
} from "./commercial-api.js";

export interface CommercialExpressRequest {
  body?: unknown;
  params?: Record<string, string | undefined>;
  headers: Record<string, unknown>;
}

export type CommercialExpressResponse = unknown;

export type CommercialExpressRouteHandler = (
  req: CommercialExpressRequest,
  res: CommercialExpressResponse,
) => Promise<void> | void;

export interface CommercialExpressApp {
  post(path: string, handler: CommercialExpressRouteHandler): void;
  get(path: string, handler: CommercialExpressRouteHandler): void;
}

export interface CommercialAdminApiHandlers {
  getAdminDashboardSummary(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
  createAdminAccessCode(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
  createAdminAccessCodeBatch(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
  disableAdminAccessCode(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
  adjustAdminCredits(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
  updateAdminSystemSetting(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
  listAdminAuditLogs(request: CommercialApiRequest): Promise<CommercialApiResponse> | CommercialApiResponse;
}

export interface RegisterCommercialRoutesOptions {
  app: CommercialExpressApp;
  requireCommercialServices: () => { apiHandlers: CommercialAdminApiHandlers };
  getSessionToken: (req: CommercialExpressRequest) => string | undefined;
  sendCommercialApiResponse: (
    res: CommercialExpressResponse,
    result: CommercialApiResponse,
  ) => void;
}

export function registerCommercialAdminRoutes(options: RegisterCommercialRoutesOptions): void {
  options.app.get("/api/admin/summary", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.getAdminDashboardSummary({
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });

  options.app.post("/api/admin/access-codes", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.createAdminAccessCode({
      body: req.body,
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });

  options.app.post("/api/admin/access-codes/batch", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.createAdminAccessCodeBatch({
      body: req.body,
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });

  options.app.post("/api/admin/access-codes/:accessCodeId/disable", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.disableAdminAccessCode({
      body: req.body,
      params: { accessCodeId: req.params?.accessCodeId },
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });

  options.app.post("/api/admin/credits/adjust", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.adjustAdminCredits({
      body: req.body,
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });

  options.app.post("/api/admin/settings/:key", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.updateAdminSystemSetting({
      body: req.body,
      params: { key: req.params?.key },
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });

  options.app.get("/api/admin/audit-logs", async (req, res) => {
    const result = await options.requireCommercialServices().apiHandlers.listAdminAuditLogs({
      sessionToken: options.getSessionToken(req),
    });
    options.sendCommercialApiResponse(res, result);
  });
}
