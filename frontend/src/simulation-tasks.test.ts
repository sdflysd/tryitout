import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelSimulationTask,
  createSimulationTask,
  getSimulationTaskReport,
  getSimulationTaskStatus,
  isRecoverableSimulationTaskError,
  resumeSimulationTask,
  resumeSimulationTaskUntilComplete,
  runSimulationTaskUntilComplete,
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

test("createSimulationTask includes credentials and normalizes commercial queued task response", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ taskId: "task_1", status: "queued" }), {
      status: 202,
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

  assert.equal(result.simulationId, "task_1");
  assert.equal(result.status, "queued");
  assert.equal(calls[0].init?.credentials, "include");
});

test("commercial task status and report use the same polling shape as progress UI", async () => {
  const fetchImpl = async (url: string) => {
    if (url === "/api/simulation-tasks/task_1/status") {
      return new Response(
        JSON.stringify({
          taskId: "task_1",
          status: "running",
          scenario: "side_hustle",
          interactionMode: "enabled",
          creditCost: 3,
        }),
        { status: 200 },
      );
    }
    if (url === "/api/simulation-tasks/task_1/report") {
      return new Response(JSON.stringify({ report: makeReport("task_1") }), { status: 200 });
    }
    throw new Error(`Unexpected call ${url}`);
  };

  const status = await getSimulationTaskStatus("task_1", fetchImpl as typeof fetch);
  const report = await getSimulationTaskReport("task_1", fetchImpl as typeof fetch);

  assert.equal(status.simulationId, "task_1");
  assert.equal(status.scenarioType, "side_hustle");
  assert.equal(status.mode, "enabled");
  assert.equal(status.progressPercent, 10);
  assert.equal(report.simulationId, "task_1");
  assert.equal(report.status, "completed");
  assert.equal(report.report?.id, "task_1");
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
      onProgress: (event) => progress.push(event),
    },
  );

  assert.equal(report.id, "sim_1");
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
