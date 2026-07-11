import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelSimulationTask,
  createSimulationTask,
  fetchActiveSimulationTask,
  getSimulationTaskReport,
  getSimulationTaskStatus,
  isRecoverableSimulationTaskError,
  resumeSimulationTask,
  resumeSimulationTaskUntilComplete,
  runSimulationTaskUntilComplete,
  watchSimulationTaskUntilComplete,
} from "./simulation-tasks.js";
import type { SimulationProgressEvent } from "./types.js";

test("createSimulationTask posts to durable task endpoint", async () => {
  const calls: unknown[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ simulationId: "sim_1", status: "queued" }), {
      status: 200,
    });
  };

  const result = await createSimulationTask(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化",
      },
      interactionMode: "legacy",
    },
    fetchImpl as typeof fetch,
  );

  assert.equal(result.simulationId, "sim_1");
  assert.equal((calls[0] as { url: string }).url, "/api/simulation-tasks");
  assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
});

test("createSimulationTask sends commercial credentials and idempotency metadata when provided", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response(
      JSON.stringify({
        task: {
          id: "commercial_task_1",
          userId: "user_1",
          scenarioType: "side_hustle",
          interactionMode: "enabled",
          providerMode: "platform",
          status: "queued",
          creditCost: 3,
          idempotencyKey: "simulation_request_1",
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:00:00.000Z",
        },
        account: {
          userId: "user_1",
          balance: 7,
          frozenCredits: 3,
          totalRedeemed: 10,
          totalCaptured: 0,
          updatedAt: "2026-07-07T00:00:00.000Z",
        },
        holdLedger: {
          id: "ledger_1",
          userId: "user_1",
          taskId: "commercial_task_1",
          entryType: "hold",
          amount: -3,
          balanceAfter: 7,
          frozenAfter: 3,
          idempotencyKey: "simulation_request_1:hold",
          createdAt: "2026-07-07T00:00:00.000Z",
        },
      }),
      { status: 202 },
    );
  };

  const result = await createSimulationTask(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化",
      },
      interactionMode: "enabled",
      providerMode: "platform",
      idempotencyKey: "simulation_request_1",
      priority: 7,
      queueWeight: 2,
    },
    fetchImpl as typeof fetch,
  );

  assert.equal(result.simulationId, "commercial_task_1");
  assert.equal(calls[0]?.init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0]?.init.body as string), {
    userInput: {
      type: "side_hustle",
      projectIdea: "AI 简历优化",
    },
    interactionMode: "enabled",
    providerMode: "platform",
    idempotencyKey: "simulation_request_1",
    priority: 7,
    queueWeight: 2,
  });
});

test("getSimulationTaskStatus fetches status endpoint", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        simulationId: "sim_1",
        scenarioType: "side_hustle",
        mode: "legacy",
        status: "running",
        progressPercent: 50,
        recoverable: false,
        updatedAt: "2026-07-02T00:00:00.000Z",
      }),
      { status: 200 },
    );

  const result = await getSimulationTaskStatus("sim_1", fetchImpl as typeof fetch);
  assert.equal(result.progressPercent, 50);
});

test("getSimulationTaskStatus normalizes commercial task status responses", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        task: {
          id: "commercial_task_1",
          userId: "user_1",
          scenarioType: "life_choice",
          interactionMode: "enabled",
          providerMode: "platform",
          status: "running",
          creditCost: 3,
          queuedAt: "2026-07-07T00:00:00.000Z",
          startedAt: "2026-07-07T00:02:00.000Z",
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:05:00.000Z",
        },
      }),
      { status: 200 },
    );

  const result = await getSimulationTaskStatus("commercial_task_1", fetchImpl as typeof fetch);

  assert.deepEqual(result, {
    simulationId: "commercial_task_1",
    scenarioType: "life_choice",
    mode: "enabled",
    status: "running",
    progressPercent: 50,
    recoverable: false,
    queuedAt: "2026-07-07T00:00:00.000Z",
    startedAt: "2026-07-07T00:02:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:05:00.000Z",
  });
}
);

test("getSimulationTaskStatus preserves commercial worker progress fields", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        task: {
          id: "commercial_task_1",
          userId: "user_1",
          scenarioType: "side_hustle",
          interactionMode: "enabled",
          providerMode: "platform",
          status: "running",
          creditCost: 3,
          currentStepName: "generate_agent_actions",
          currentStageIndex: 2,
          progressPercent: 43,
          progressMessage: "第 2 阶段 Agent 行动生成开始。",
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:05:00.000Z",
        },
      }),
      { status: 200 },
    );

  const result = await getSimulationTaskStatus("commercial_task_1", fetchImpl as typeof fetch);

  assert.equal(result.currentStepName, "generate_agent_actions");
  assert.equal(result.currentStageIndex, 2);
  assert.equal(result.progressPercent, 43);
});

test("getSimulationTaskStatus marks commercial recoverable failures as resumable", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        task: {
          id: "commercial_task_recoverable",
          userId: "user_1",
          scenarioType: "dating",
          interactionMode: "enabled",
          providerMode: "platform",
          status: "recoverable_failed",
          creditCost: 3,
          currentStepName: "simulate_stage",
          currentStageIndex: 4,
          progressPercent: 73,
          errorCode: "model_timeout",
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:05:00.000Z",
        },
      }),
      { status: 200 },
    );

  const result = await getSimulationTaskStatus(
    "commercial_task_recoverable",
    fetchImpl as typeof fetch,
  );

  assert.equal(result.status, "recoverable_failed");
  assert.equal(result.recoverable, true);
  assert.equal(result.errorCode, "model_timeout");
});

test("fetchActiveSimulationTask reads the current commercial active task", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response(
      JSON.stringify({
        task: {
          id: "commercial_task_active",
          userId: "user_1",
          scenarioType: "dating",
          interactionMode: "enabled",
          providerMode: "platform",
          status: "queued",
          creditCost: 3,
          queuedAt: "2026-07-07T00:00:00.000Z",
          createdAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:00:00.000Z",
        },
      }),
      { status: 200 },
    );
  };

  const result = await fetchActiveSimulationTask(fetchImpl as typeof fetch);

  assert.deepEqual(result, {
    simulationId: "commercial_task_active",
    scenarioType: "dating",
    mode: "enabled",
    status: "queued",
    progressPercent: 5,
    recoverable: false,
    queuedAt: "2026-07-07T00:00:00.000Z",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
  });
  assert.equal(calls[0]?.url, "/api/simulation-tasks/active");
  assert.equal(calls[0]?.init.credentials, "include");
});

test("getSimulationTaskReport normalizes commercial report responses", async () => {
  const report = makeReport("commercial_task_1");
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        report: {
          id: "report_1",
          taskId: "commercial_task_1",
          userId: "user_1",
          publicReport: report,
          unlocked: true,
          createdAt: "2026-07-07T00:10:00.000Z",
          updatedAt: "2026-07-07T00:10:00.000Z",
        },
      }),
      { status: 200 },
    );

  const result = await getSimulationTaskReport(
    "commercial_task_1",
    fetchImpl as typeof fetch,
  );

  assert.equal(result.simulationId, "commercial_task_1");
  assert.equal(result.status, "completed");
  assert.equal(result.report?.id, "commercial_task_1");
});

test("resume, cancel, and report clients call durable task endpoints", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await resumeSimulationTask("sim/a", fetchImpl as typeof fetch);
  await cancelSimulationTask("sim/a", fetchImpl as typeof fetch);
  await getSimulationTaskReport("sim/a", fetchImpl as typeof fetch);

  assert.deepEqual(calls, [
    "POST /api/simulation-tasks/sim%2Fa/resume",
    "POST /api/simulation-tasks/sim%2Fa/cancel",
    "GET /api/simulation-tasks/sim%2Fa/report",
  ]);
});

test("durable task client throws API error messages", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: "simulation task is not recoverable" }), {
      status: 409,
    });

  await assert.rejects(
    () => resumeSimulationTask("sim_1", fetchImpl as typeof fetch),
    /not recoverable/,
  );
});

test("runSimulationTaskUntilComplete creates, polls, emits progress, and reads final report", async () => {
  const calls: string[] = [];
  const createdTaskIds: string[] = [];
  const statuses = [
    {
      simulationId: "sim_1",
      scenarioType: "side_hustle",
      mode: "legacy",
      status: "running",
      currentStepName: "generate_agents",
      progressPercent: 20,
      recoverable: false,
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
    {
      simulationId: "sim_1",
      scenarioType: "side_hustle",
      mode: "legacy",
      status: "completed",
      currentStepName: "generate_report",
      progressPercent: 100,
      recoverable: false,
      updatedAt: "2026-07-02T00:00:01.000Z",
    },
  ];
  const progress: SimulationProgressEvent[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/simulation-tasks") {
      return new Response(JSON.stringify({ simulationId: "sim_1", status: "queued" }), {
        status: 200,
      });
    }
    if (url === "/api/simulation-tasks/sim_1/status") {
      return new Response(JSON.stringify(statuses.shift()), { status: 200 });
    }
    if (url === "/api/simulation-tasks/sim_1/report") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_1",
          status: "completed",
          report: makeReport("sim_1"),
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected call ${url}`);
  };

  const report = await runSimulationTaskUntilComplete(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化",
      },
      interactionMode: "legacy",
    },
    {
      fetchImpl: fetchImpl as typeof fetch,
      pollIntervalMs: 0,
      sleep: async () => undefined,
      onCreated: (created) => createdTaskIds.push(created.simulationId),
      onProgress: (event) => progress.push(event),
    },
  );

  assert.equal(report.id, "sim_1");
  assert.deepEqual(createdTaskIds, ["sim_1"]);
  assert.deepEqual(calls, [
    "POST /api/simulation-tasks",
    "GET /api/simulation-tasks/sim_1/status",
    "GET /api/simulation-tasks/sim_1/status",
    "GET /api/simulation-tasks/sim_1/report",
  ]);
  assert.deepEqual(
    progress.map((event) => `${event.step}:${event.percent}`),
    ["generate_agents:20", "generate_report:100"],
  );
});

test("runSimulationTaskUntilComplete does not emit regressing progress percentages", async () => {
  const statuses = [
    {
      simulationId: "sim_monotonic",
      scenarioType: "side_hustle",
      mode: "enabled",
      status: "running",
      currentStepName: "arbitrate_stage",
      currentStageIndex: 4,
      progressPercent: 73,
      recoverable: false,
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
    {
      simulationId: "sim_monotonic",
      scenarioType: "side_hustle",
      mode: "enabled",
      status: "running",
      currentStepName: "generate_agent_actions",
      currentStageIndex: 5,
      progressPercent: 67,
      recoverable: false,
      updatedAt: "2026-07-02T00:00:01.000Z",
    },
    {
      simulationId: "sim_monotonic",
      scenarioType: "side_hustle",
      mode: "enabled",
      status: "completed",
      currentStepName: "generate_report",
      progressPercent: 100,
      recoverable: false,
      updatedAt: "2026-07-02T00:00:02.000Z",
    },
  ];
  const progress: SimulationProgressEvent[] = [];
  const fetchImpl = async (url: string) => {
    if (url === "/api/simulation-tasks") {
      return new Response(JSON.stringify({ simulationId: "sim_monotonic", status: "queued" }), {
        status: 200,
      });
    }
    if (url === "/api/simulation-tasks/sim_monotonic/status") {
      return new Response(JSON.stringify(statuses.shift()), { status: 200 });
    }
    if (url === "/api/simulation-tasks/sim_monotonic/report") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_monotonic",
          status: "completed",
          report: makeReport("sim_monotonic"),
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected call ${url}`);
  };

  await runSimulationTaskUntilComplete(
    {
      userInput: {
        type: "side_hustle",
        projectIdea: "AI 简历优化",
      },
      interactionMode: "enabled",
    },
    {
      fetchImpl: fetchImpl as typeof fetch,
      pollIntervalMs: 0,
      sleep: async () => undefined,
      onProgress: (event) => progress.push(event),
    },
  );

  assert.deepEqual(
    progress.map((event) => `${event.step}:${event.percent}`),
    [
      "arbitrate_stage:73",
      "generate_agent_actions:73",
      "generate_report:100",
    ],
  );
});

test("runSimulationTaskUntilComplete surfaces recoverable task id for resume", async () => {
  const fetchImpl = async (url: string) => {
    if (url === "/api/simulation-tasks") {
      return new Response(JSON.stringify({ simulationId: "sim_retry", status: "queued" }), {
        status: 200,
      });
    }
    if (url === "/api/simulation-tasks/sim_retry/status") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_retry",
          scenarioType: "life_choice",
          mode: "enabled",
          status: "recoverable_failed",
          currentStepName: "generate_agents",
          progressPercent: 20,
          recoverable: true,
          errorCode: "model_timeout",
          updatedAt: "2026-07-02T00:00:01.000Z",
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected call ${url}`);
  };

  await assert.rejects(
    () =>
      runSimulationTaskUntilComplete(
        {
          userInput: {
            type: "life_choice",
            optionA: "继续做 AI 产品",
            optionB: "找工作",
          },
          interactionMode: "enabled",
        },
        {
          fetchImpl: fetchImpl as typeof fetch,
          pollIntervalMs: 0,
          sleep: async () => undefined,
        },
      ),
    (error) =>
      isRecoverableSimulationTaskError(error) &&
      error.simulationId === "sim_retry" &&
      /model_timeout/.test(error.message),
  );
});

test("resumeSimulationTaskUntilComplete resumes existing task before polling", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/simulation-tasks/sim_resume/resume") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url === "/api/simulation-tasks/sim_resume/status") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_resume",
          scenarioType: "side_hustle",
          mode: "legacy",
          status: "completed",
          currentStepName: "generate_report",
          progressPercent: 100,
          recoverable: false,
          updatedAt: "2026-07-02T00:00:02.000Z",
        }),
        { status: 200 },
      );
    }
    if (url === "/api/simulation-tasks/sim_resume/report") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_resume",
          status: "completed",
          report: makeReport("sim_resume"),
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected call ${url}`);
  };

  const report = await resumeSimulationTaskUntilComplete("sim_resume", {
    fetchImpl: fetchImpl as typeof fetch,
    pollIntervalMs: 0,
    sleep: async () => undefined,
  });

  assert.equal(report.id, "sim_resume");
  assert.deepEqual(calls, [
    "POST /api/simulation-tasks/sim_resume/resume",
    "GET /api/simulation-tasks/sim_resume/status",
    "GET /api/simulation-tasks/sim_resume/report",
  ]);
});

test("watchSimulationTaskUntilComplete polls an existing active task without calling resume", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/simulation-tasks/sim_active/status") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_active",
          scenarioType: "side_hustle",
          mode: "enabled",
          status: "completed",
          currentStepName: "generate_report",
          progressPercent: 100,
          recoverable: false,
          updatedAt: "2026-07-02T00:00:02.000Z",
        }),
        { status: 200 },
      );
    }
    if (url === "/api/simulation-tasks/sim_active/report") {
      return new Response(
        JSON.stringify({
          simulationId: "sim_active",
          status: "completed",
          report: makeReport("sim_active"),
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected call ${url}`);
  };

  const report = await watchSimulationTaskUntilComplete("sim_active", {
    fetchImpl: fetchImpl as typeof fetch,
    pollIntervalMs: 0,
    sleep: async () => undefined,
  });

  assert.equal(report.id, "sim_active");
  assert.deepEqual(calls, [
    "GET /api/simulation-tasks/sim_active/status",
    "GET /api/simulation-tasks/sim_active/report",
  ]);
});

function makeReport(id: string) {
  return {
    id,
    status: "completed" as const,
    agents: [],
    stages: [],
    createdAt: "2026-07-02T00:00:00.000Z",
    report: {
      projectName: "测试报告",
      successProbability: 50,
      expectedRevenue: "待验证",
      riskLevel: "medium" as const,
      finalRecommendation: "继续小步验证",
      scores: {
        demandStrength: 50,
        willingnessToPay: 50,
        acquisitionDifficulty: 50,
        competitionPressure: 50,
        executionFit: 50,
        monetizationClarity: 50,
      },
      finalOutcome: "可继续观察",
      opportunities: [],
      risks: [],
      pivotSuggestions: [],
      actionPlan7Days: [],
      shouldDo: "test_small" as const,
    },
  };
}
