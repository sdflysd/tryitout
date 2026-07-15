import type express from "express";

import type { CommercialServices } from "./commercial-services.js";
import {
  handleAdjustAdminUserCreditsRequest,
  handleBulkAdminAccessCodesRequest,
  handleBulkAdminUsersRequest,
  handleCreateAdminAccessCodeBatchRequest,
  handleCreateAdminUserRequest,
  handleDeleteAdminAccessCodeRequest,
  handleDeleteAdminUserRequest,
  handleDisableAdminAccessCodeRequest,
  handleDisableAdminAccessCodeBatchRequest,
  handleDisableAdminUserRequest,
  handleGetAdminCostSummaryRequest,
  handleGetAdminCreditOperationsRequest,
  handleGetAdminFeedbackRequest,
  handleGetAdminOverviewRequest,
  handleGetAdminQueueRequest,
  handleGetAdminSettingsRequest,
  handleListAdminAccessCodesRequest,
  handleListAdminAccessCodeBatchesRequest,
  handleListAdminAuditLogsRequest,
  handleListAdminModelProfilesRequest,
  handleListAdminModelProvidersRequest,
  handleListAdminProviderModelsRequest,
  handleListAdminTasksRequest,
  handleListAdminUsersRequest,
  handleRestoreAdminAccessCodeRequest,
  handleRestoreAdminUserRequest,
  handleSaveAdminModelProfileRequest,
  handleSaveAdminModelProviderRequest,
  handleTestAdminModelProfileRequest,
  handleTestAdminModelProviderRequest,
  handleUpdateAdminInitialUserCreditsRequest,
  handleUpdateAdminUserRequest,
  handleUpdateAdminPlatformModelsRequest,
  type CommercialApiResult,
} from "./commercial-api.js";

export function registerCommercialAdminRoutes(
  app: Pick<express.Express, "delete" | "get" | "patch" | "post">,
  services: CommercialServices,
): void {
  app.get("/api/admin/overview", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleGetAdminOverviewRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/users", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminUsersRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/users", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleCreateAdminUserRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.patch("/api/admin/users/:id", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleUpdateAdminUserRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/users/:id/disable", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleDisableAdminUserRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/users/:id/restore", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleRestoreAdminUserRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleDeleteAdminUserRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/users/bulk", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleBulkAdminUsersRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/access-codes", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminAccessCodesRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/access-codes/:id/disable", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleDisableAdminAccessCodeRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/access-codes/:id/restore", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleRestoreAdminAccessCodeRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.delete("/api/admin/access-codes/:id", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleDeleteAdminAccessCodeRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/access-codes/bulk", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleBulkAdminAccessCodesRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/access-codes/batches", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminAccessCodeBatchesRequest(
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/access-codes/batches", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleCreateAdminAccessCodeBatchRequest(
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/access-codes/batches/:id/disable", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleDisableAdminAccessCodeBatchRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/tasks", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminTasksRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/credits", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleGetAdminCreditOperationsRequest(
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/costs", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleGetAdminCostSummaryRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/queue", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleGetAdminQueueRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/feedback", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleGetAdminFeedbackRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/settings", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleGetAdminSettingsRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/settings/platform-models", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleUpdateAdminPlatformModelsRequest(
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/settings/initial-user-credits", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleUpdateAdminInitialUserCreditsRequest(
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/model-providers", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminModelProvidersRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/model-providers", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleSaveAdminModelProviderRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/model-providers/:id/models", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminProviderModelsRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/model-providers/:id/test", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleTestAdminModelProviderRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/model-profiles", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminModelProfilesRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/model-profiles", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleSaveAdminModelProfileRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });

  app.patch("/api/admin/model-profiles/:id", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleSaveAdminModelProfileRequest(
      toCommercialRequest(req),
      services,
      req.params.id,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/model-profiles/:id/test", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleTestAdminModelProfileRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.post("/api/admin/users/:id/credits", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleAdjustAdminUserCreditsRequest(
      req.params.id,
      toCommercialRequest(req),
      services,
    );
    sendCommercialApiResult(res, result);
  });

  app.get("/api/admin/audit-logs", async (req, res) => {
    if (!services.enabled) {
      return sendDisabled(res);
    }
    const result = await handleListAdminAuditLogsRequest(toCommercialRequest(req), services);
    sendCommercialApiResult(res, result);
  });
}

function toCommercialRequest(req: express.Request) {
  return {
    body: req.body,
    headers: {
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
      "user-agent": req.headers["user-agent"],
      "x-ip-hash": firstHeaderValue(req.headers["x-ip-hash"]),
    },
  };
}

function sendCommercialApiResult(
  res: express.Response,
  result: CommercialApiResult,
): void {
  for (const cookie of result.cookies ?? []) {
    res.cookie(cookie.name, cookie.value, cookie.options);
  }
  res.status(result.status).json(result.body);
}

function sendDisabled(res: express.Response): void {
  res.status(404).json({ error: "Commercial mode is disabled" });
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
