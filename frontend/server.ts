import express from "express";
import path from "path";
import dotenv from "dotenv";
import { AiGateway } from "./src/server/ai/ai-gateway.js";
import {
  createAgentDebugTraceWriter,
  isAgentDebugLoggingEnabled,
} from "./src/server/ai/debug-trace.js";
import { ModelResolutionError } from "./src/server/ai/model-router.js";
import {
  getConfiguredProvider,
  getMissingProviderConfigMessage,
} from "./src/server/ai/provider-config.js";
import { resolveAgentRuntimeCapabilities } from "./src/server/agent-runtime/capabilities.js";
import { buildRuntimeDiagnostics } from "./src/server/agent-runtime/diagnostics.js";
import { resolveInteractionMode } from "./src/server/interaction-mode.js";
import { handleLifeChoiceStructureRequest } from "./src/server/life-choice-structure-api.js";
import {
  legacySimulationRouteBlockedResponse,
  resolveSimulationTaskRouteMode,
  shouldBlockLegacySimulationRoute,
} from "./src/server/commercial/commercial-routing.js";
import { isAdminRole } from "./src/contracts/commercial.js";
import { registerCommercialAdminRoutes } from "./src/server/commercial/admin-routes.js";
import {
  handleCancelCommercialTaskRequest,
  handleCreateCommercialTaskRequest,
  handleDeleteCommercialTaskRequest,
  handleDeleteModelProviderRequest,
  handleGetActiveCommercialTaskRequest,
  handleGetCommercialTaskReportRequest,
  handleGetCommercialTaskStatusRequest,
  handleResumeCommercialTaskRequest,
  handleGetCreditsRequest,
  handleGetMeRequest,
  handleGetModelProviderRequest,
  handleGetPlatformModelsRequest,
  handleListCommercialTasksRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRedeemAccessCodeRequest,
  handleRegisterRequest,
  handleSaveModelProviderRequest,
  handleTestModelProviderRequest,
  type CommercialApiResult,
} from "./src/server/commercial/commercial-api.js";
import { createCommercialServicesFromEnv } from "./src/server/commercial/commercial-services.js";
import { runMultiAgentSimulation } from "./src/server/simulations/multi-agent-runner.js";
import { assessUserInputSafety } from "./src/server/simulations/safety.js";
import {
  handleCancelSimulationTaskRequest,
  handleCreateSimulationTaskRequest,
  handleGetSimulationReportRequest,
  handleGetSimulationTaskStatusRequest,
  handleResumeSimulationTaskRequest,
} from "./src/server/simulations/task-api.js";
import { FileSimulationTaskRepository } from "./src/server/simulations/task-repository.js";
import { runSimulationTaskOnce } from "./src/server/simulations/task-runner.js";
import { SimulationTaskService } from "./src/server/simulations/task-service.js";
import {
  addSimulationAiCallLogListener,
  runWithAiTokenSummaryLogging,
} from "./src/server/simulations/token-usage-log.js";
import { handleValidationEventRequest } from "./src/server/validation/event-api.js";
import type {
  InteractionMode,
  SimulationApiResponse,
  SimulationProgressEvent,
  SimulationType,
  UserInput,
} from "./src/types.js";

dotenv.config();

const app = express();
const PORT = 3000;
const commercialServices = createCommercialServicesFromEnv(process.env);

app.use(express.json());

let aiGateway: AiGateway | null = null;
const taskRepository = new FileSimulationTaskRepository();
const taskService = new SimulationTaskService({
  repo: taskRepository,
});
const agentDebugTraceWriter = isAgentDebugLoggingEnabled()
  ? createAgentDebugTraceWriter()
  : undefined;

function getAiGateway(): AiGateway {
  if (!aiGateway) {
    const provider = getConfiguredProvider();
    const missingConfigMessage = getMissingProviderConfigMessage(provider);
    if (missingConfigMessage) {
      throw new Error(missingConfigMessage);
    }

    aiGateway = new AiGateway();
    aiGateway.onLog = (entry) => {
      if (!entry.success || process.env.NODE_ENV === "development") {
        console.log("[AI]", JSON.stringify(entry));
      }
    };
    aiGateway.onDebugTrace = agentDebugTraceWriter;
  }

  return aiGateway;
}

function isSimulationType(type: unknown): type is SimulationType {
  return type === "side_hustle" || type === "dating" || type === "life_choice";
}

function getSimulationType(userInput: UserInput): SimulationType {
  return isSimulationType(userInput.type) ? userInput.type : "side_hustle";
}

function validateSimulationInput(userInput: UserInput | undefined): string | undefined {
  if (!userInput) {
    return "用户输入 (userInput) 不能为空";
  }

  const type = getSimulationType(userInput);

  if (type === "side_hustle" && !userInput.projectIdea) {
    return "项目想法 (projectIdea) 不能为空";
  }
  if (type === "dating" && !userInput.chatLogOrIssue) {
    return "聊天记录或冲突内容 (chatLogOrIssue) 不能为空";
  }
  if (
    type === "life_choice" &&
    (!userInput.optionA || !userInput.optionB) &&
    (!userInput.lifeChoiceOptions || userInput.lifeChoiceOptions.length < 2)
  ) {
    return "至少需要 2 个可比较的人生选择";
  }

  const safety = assessUserInputSafety(userInput);
  if (!safety.ok) {
    return safety.message;
  }

  return undefined;
}

function writeSse(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildSimulationResponse(
  simulationId: string,
  result: Awaited<ReturnType<typeof runMultiAgentSimulation>>,
  {
    requestedInteractionMode,
    interactionModeUsed = "legacy",
    deepModeAvailable,
  }: {
    requestedInteractionMode: InteractionMode;
    interactionModeUsed?: InteractionMode;
    deepModeAvailable: boolean;
  },
): SimulationApiResponse {
  return {
    ...result,
    id: simulationId,
    status: "completed",
    createdAt: new Date().toISOString(),
    interactionModeUsed,
    runtimeDiagnostics: buildRuntimeDiagnostics({
      requestedInteractionMode,
      interactionModeUsed,
      deepModeAvailable,
      stages: result.stages,
    }),
  };
}

function toCommercialRequest(req: express.Request) {
  return {
    body: req.body,
    headers: {
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
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

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/agent-runtime/capabilities", (req, res) => {
  res.json(resolveAgentRuntimeCapabilities());
});

async function runDurableCompatibilityTask(simulationId: string): Promise<void> {
  await runSimulationTaskOnce(simulationId, {
    service: taskService,
    runSimulation: async ({
      onProgress,
      onAiCallLog,
      onCheckpoint,
      resumeFrom,
    }) => {
      const task = await taskRepository.getTask(simulationId);
      if (!task) {
        throw new Error("simulation task not found");
      }

      const gateway = getAiGateway();
      const unsubscribeAiCallLog = addSimulationAiCallLogListener(
        gateway,
        simulationId,
        onAiCallLog,
      );

      try {
        const runtimeCapabilities = resolveAgentRuntimeCapabilities();
        const interactionMode = resolveInteractionMode(
          runtimeCapabilities.deepModeAvailable,
          task.mode,
        );
        const result = await runMultiAgentSimulation({
          gateway,
          simulationId,
          userInput: task.userInput,
          interactionMode,
          resumeFrom,
          onCheckpoint,
          onProgress,
        });

        return buildSimulationResponse(simulationId, result, {
          requestedInteractionMode: task.mode,
          interactionModeUsed: interactionMode,
          deepModeAvailable: runtimeCapabilities.deepModeAvailable,
        });
      } finally {
        unsubscribeAiCallLog();
      }
    },
  });
}

app.post("/api/validation/events", async (req, res) => {
  const result = await handleValidationEventRequest(
    req.body,
    commercialServices.enabled
      ? { analyticsService: commercialServices.analyticsService }
      : {},
  );
  res.status(result.status).json(result.body);
});

app.post("/api/auth/register", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleRegisterRequest(req.body, commercialServices);
  sendCommercialApiResult(res, result);
});

app.post("/api/auth/login", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleLoginRequest(req.body, commercialServices, {
    production: process.env.NODE_ENV === "production",
  });
  sendCommercialApiResult(res, result);
});

app.post("/api/auth/logout", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleLogoutRequest(
    toCommercialRequest(req),
    commercialServices,
    { production: process.env.NODE_ENV === "production" },
  );
  sendCommercialApiResult(res, result);
});

app.get("/api/me", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleGetMeRequest(toCommercialRequest(req), commercialServices);
  sendCommercialApiResult(res, result);
});

app.post("/api/credits/redeem", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleRedeemAccessCodeRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

app.get("/api/credits", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleGetCreditsRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

app.get("/api/model-provider", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleGetModelProviderRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

app.get("/api/platform-models", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleGetPlatformModelsRequest(commercialServices);
  sendCommercialApiResult(res, result);
});

app.put("/api/model-provider", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleSaveModelProviderRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

app.post("/api/model-provider/test", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleTestModelProviderRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

app.delete("/api/model-provider", async (req, res) => {
  if (!commercialServices.enabled) {
    return res.status(404).json({ error: "Commercial mode is disabled" });
  }
  const result = await handleDeleteModelProviderRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

registerCommercialAdminRoutes(app, commercialServices);

app.post("/api/life-choice/structure", async (req, res) => {
  const result = await handleLifeChoiceStructureRequest(req.body, {
    getGateway: getAiGateway,
  });
  res.status(result.status).json(result.body);
});

app.get("/api/simulation-tasks", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) !== "commercial_task") {
    return res.status(404).json({
      error: "Commercial task listing is unavailable",
      code: "commercial_task_listing_unavailable",
    });
  }
  if (!commercialServices.enabled) {
    return res.status(503).json({
      error: "Commercial services are unavailable",
      code: "commercial_services_unavailable",
    });
  }
  const result = await handleListCommercialTasksRequest(
    toCommercialRequest(req),
    commercialServices,
  );
  sendCommercialApiResult(res, result);
});

app.post("/api/simulation-tasks", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) === "commercial_task") {
    if (!commercialServices.enabled) {
      return res.status(503).json({
        error: "Commercial services are unavailable",
        code: "commercial_services_unavailable",
      });
    }
    const result = await handleCreateCommercialTaskRequest(
      toCommercialRequest(req),
      commercialServices,
    );
    return sendCommercialApiResult(res, result);
  }

  const result = await handleCreateSimulationTaskRequest(req.body, {
    service: taskService,
  });

  if (result.status === 200 && "simulationId" in result.body) {
    void runDurableCompatibilityTask(result.body.simulationId);
  }

  res.status(result.status).json(result.body);
});

app.get("/api/simulation-tasks/active", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) === "commercial_task") {
    if (!commercialServices.enabled) {
      return res.status(503).json({
        error: "Commercial services are unavailable",
        code: "commercial_services_unavailable",
      });
    }
    const result = await handleGetActiveCommercialTaskRequest(
      toCommercialRequest(req),
      commercialServices,
    );
    return sendCommercialApiResult(res, result);
  }

  res.status(404).json({ error: "Active commercial task is unavailable" });
});

app.get("/api/simulation-tasks/:id/status", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) === "commercial_task") {
    if (!commercialServices.enabled) {
      return res.status(503).json({
        error: "Commercial services are unavailable",
        code: "commercial_services_unavailable",
      });
    }
    const result = await handleGetCommercialTaskStatusRequest(
      req.params.id,
      toCommercialRequest(req),
      commercialServices,
    );
    return sendCommercialApiResult(res, result);
  }

  const result = await handleGetSimulationTaskStatusRequest(req.params.id, {
    service: taskService,
  });
  res.status(result.status).json(result.body);
});

app.post("/api/simulation-tasks/:id/resume", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) === "commercial_task") {
    if (!commercialServices.enabled) {
      return res.status(503).json({
        error: "Commercial services are unavailable",
        code: "commercial_services_unavailable",
      });
    }
    const result = await handleResumeCommercialTaskRequest(
      req.params.id,
      toCommercialRequest(req),
      commercialServices,
    );
    return sendCommercialApiResult(res, result);
  }

  const result = await handleResumeSimulationTaskRequest(req.params.id, {
    service: taskService,
  });

  if (result.status === 200) {
    void runDurableCompatibilityTask(req.params.id);
  }

  res.status(result.status).json(result.body);
});

app.post("/api/simulation-tasks/:id/cancel", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) === "commercial_task") {
    if (!commercialServices.enabled) {
      return res.status(503).json({
        error: "Commercial services are unavailable",
        code: "commercial_services_unavailable",
      });
    }
    const result = await handleCancelCommercialTaskRequest(
      req.params.id,
      toCommercialRequest(req),
      commercialServices,
    );
    return sendCommercialApiResult(res, result);
  }

  const result = await handleCancelSimulationTaskRequest(req.params.id, {
    service: taskService,
  });
  res.status(result.status).json(result.body);
});

app.delete("/api/simulation-tasks/:id", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) !== "commercial_task") {
    return res.status(404).json({
      error: "Commercial task deletion is unavailable",
      code: "commercial_task_deletion_unavailable",
    });
  }
  if (!commercialServices.enabled) {
    return res.status(503).json({
      error: "Commercial services are unavailable",
      code: "commercial_services_unavailable",
    });
  }
  const result = await handleDeleteCommercialTaskRequest(
    req.params.id,
    toCommercialRequest(req),
    commercialServices,
  );
  return sendCommercialApiResult(res, result);
});

app.get("/api/simulation-tasks/:id/report", async (req, res) => {
  if (resolveSimulationTaskRouteMode(process.env) === "commercial_task") {
    if (!commercialServices.enabled) {
      return res.status(503).json({
        error: "Commercial services are unavailable",
        code: "commercial_services_unavailable",
      });
    }
    const result = await handleGetCommercialTaskReportRequest(
      req.params.id,
      toCommercialRequest(req),
      commercialServices,
    );
    return sendCommercialApiResult(res, result);
  }

  const result = await handleGetSimulationReportRequest(req.params.id, {
    service: taskService,
  });
  res.status(result.status).json(result.body);
});

// API: Run multi-agent simulation for Side Hustle, Dating, or Life Choice
app.post("/api/simulations", async (req, res) => {
  if (shouldBlockLegacySimulationRoute(req.path, process.env)) {
    const blocked = legacySimulationRouteBlockedResponse();
    return res.status(blocked.status).json(blocked.body);
  }

  try {
    const userInput = req.body.userInput as UserInput | undefined;
    const validationError = validateSimulationInput(userInput);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const simulationId = "sim_" + Math.random().toString(36).substring(2, 11);
    const gateway = getAiGateway();
    const runtimeCapabilities = resolveAgentRuntimeCapabilities();
    const requestedInteractionMode = req.body.interactionMode === "enabled" ? "enabled" : "legacy";
    const interactionMode = resolveInteractionMode(
      runtimeCapabilities.deepModeAvailable,
      req.body.interactionMode,
    );
    const result = await runWithAiTokenSummaryLogging(
      gateway,
      simulationId,
      () => runMultiAgentSimulation({
        gateway,
        simulationId,
        userInput,
        modelSelection: req.body.modelSelection,
        interactionMode,
      }),
    );

    res.json(buildSimulationResponse(simulationId, result, {
      requestedInteractionMode,
      interactionModeUsed: interactionMode,
      deepModeAvailable: runtimeCapabilities.deepModeAvailable,
    }));
  } catch (error: unknown) {
    if (error instanceof ModelResolutionError) {
      return res.status(400).json({ error: error.message });
    }

    const message = error instanceof Error
      ? error.message
      : "模拟计算生成失败，请重试。";
    console.error("Simulation generation error:", message);
    res.status(500).json({ error: message });
  }
});

app.post("/api/simulations/stream", async (req, res) => {
  if (shouldBlockLegacySimulationRoute(req.path, process.env)) {
    const blocked = legacySimulationRouteBlockedResponse();
    return res.status(blocked.status).json(blocked.body);
  }

  const userInput = req.body.userInput as UserInput | undefined;
  const validationError = validateSimulationInput(userInput);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  let headersStarted = false;

  try {
    const simulationId = "sim_" + Math.random().toString(36).substring(2, 11);
    const gateway = getAiGateway();
    const runtimeCapabilities = resolveAgentRuntimeCapabilities();
    const requestedInteractionMode = req.body.interactionMode === "enabled" ? "enabled" : "legacy";
    const interactionMode = resolveInteractionMode(
      runtimeCapabilities.deepModeAvailable,
      req.body.interactionMode,
    );

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    headersStarted = true;

    const result = await runWithAiTokenSummaryLogging(
      gateway,
      simulationId,
      () => runMultiAgentSimulation({
        gateway,
        simulationId,
        userInput: userInput!,
        modelSelection: req.body.modelSelection,
        interactionMode,
        onProgress: (event: SimulationProgressEvent) => {
          writeSse(res, "progress", event);
        },
      }),
    );

    writeSse(res, "completed", buildSimulationResponse(simulationId, result, {
      requestedInteractionMode,
      interactionModeUsed: interactionMode,
      deepModeAvailable: runtimeCapabilities.deepModeAvailable,
    }));
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : "模拟计算生成失败，请重试。";

    if (error instanceof ModelResolutionError && !headersStarted) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Simulation stream error:", message);

    if (!headersStarted) {
      return res.status(500).json({ error: message });
    }

    writeSse(res, "error", { error: message });
    res.end();
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.get(["/admin", "/admin/*"], async (req, res, next) => {
  await handleAdminPageRequest(req, res, next);
});

async function handleAdminPageRequest(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  if (!commercialServices.enabled) {
    res.status(404).send("Admin console is unavailable");
    return;
  }

  const result = await handleGetMeRequest(toCommercialRequest(req), commercialServices);
  if (result.status === 401) {
    res.redirect("/login");
    return;
  }
  if (result.status !== 200 || !("user" in result.body) || !isAdminRole(result.body.user.role)) {
    res.status(403).send("Admin privileges required");
    return;
  }

  next();
}

// Configure Vite or Static files serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Dev Mode: run Vite as a middleware
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev server middleware loaded.");
  } else {
    // Production Mode: serve static built files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static build routing loaded.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
