import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelSimulationTask,
  createSimulationTask,
  getSimulationTaskReport,
  getSimulationTaskStatus,
  resumeSimulationTask,
} from "./simulation-tasks.js";

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
