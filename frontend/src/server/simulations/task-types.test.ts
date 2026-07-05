import assert from "node:assert/strict";
import test from "node:test";

import type { UserInput } from "../../types.js";
import {
  createInitialSimulationTask,
  createStepRunId,
} from "./task-types.js";

const userInput: UserInput = {
  type: "side_hustle",
  projectIdea: "AI 简历优化服务",
};

test("createInitialSimulationTask creates a queued durable task", () => {
  const task = createInitialSimulationTask({
    simulationId: "sim_test",
    userInput,
    mode: "legacy",
    now: "2026-07-02T00:00:00.000Z",
  });

  assert.equal(task.id, "sim_test");
  assert.equal(task.status, "queued");
  assert.equal(task.scenarioType, "side_hustle");
  assert.equal(task.progressPercent, 0);
  assert.equal(task.recoverable, false);
});

test("createStepRunId is stable for step dimensions", () => {
  assert.equal(
    createStepRunId({
      simulationId: "sim_1",
      stageIndex: 2,
      stepName: "generate_agent_actions",
      roundIndex: 1,
      agentId: "agent_a",
    }),
    "sim_1:2:generate_agent_actions:1:agent_a",
  );
});
