import assert from "node:assert/strict";
import test from "node:test";

import { hashPrompt } from "../ai/call-log.js";
import type { AiCallLogEntry } from "../ai/call-log.js";
import {
  addSimulationAiCallLogListener,
  logAiTokenSummary,
  runWithAiTokenSummaryLogging,
  summarizeAiCallLogs,
} from "./token-usage-log.js";

test("summarizeAiCallLogs totals tokens, latency, and call statuses", () => {
  const summary = summarizeAiCallLogs([
    makeLog({ inputTokens: 100, outputTokens: 30, latencyMs: 10, success: true }),
    makeLog({ inputTokens: 200, outputTokens: 70, latencyMs: 20, success: true }),
    makeLog({ inputTokens: 50, outputTokens: undefined, latencyMs: 30, success: false }),
  ]);

  assert.equal(summary.promptTokens, 350);
  assert.equal(summary.completionTokens, 100);
  assert.equal(summary.totalTokens, 450);
  assert.equal(summary.totalLatencyMs, 60);
  assert.equal(summary.completedRuns, 2);
  assert.equal(summary.failedRuns, 1);
  assert.deepEqual(summary.mostExpensiveStep, {
    stepName: "generate_report",
    estimatedCost: 0.000235,
  });
});

test("logAiTokenSummary prints an AI_TOTAL line with the raw simulation id", () => {
  const logs: unknown[][] = [];

  logAiTokenSummary("sim_visible_123", [
    makeLog({ inputTokens: 120, outputTokens: 80, latencyMs: 15, success: true }),
  ], {
    info: (...args: unknown[]) => logs.push(args),
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[AI_TOTAL]");
  assert.equal(typeof logs[0][1], "string");

  const payload = JSON.parse(logs[0][1] as string) as Record<string, unknown>;
  assert.equal(payload.simulationId, "sim_visible_123");
  assert.equal(payload.promptTokens, 120);
  assert.equal(payload.completionTokens, 80);
  assert.equal(payload.totalTokens, 200);
});

test("runWithAiTokenSummaryLogging collects gateway logs for the hashed simulation id", async () => {
  const logs: unknown[][] = [];
  const previousEntries: AiCallLogEntry[] = [];
  const gateway = {
    onLog: (entry: AiCallLogEntry) => previousEntries.push(entry),
  };

  const result = await runWithAiTokenSummaryLogging(
    gateway,
    "sim_visible_456",
    async () => {
      gateway.onLog?.(makeLog({
        simulationId: hashPrompt("sim_visible_456"),
        inputTokens: 10,
        outputTokens: 20,
      }));
      gateway.onLog?.(makeLog({
        simulationId: hashPrompt("other_sim"),
        inputTokens: 999,
        outputTokens: 999,
      }));
      return "ok";
    },
    {
      info: (...args: unknown[]) => logs.push(args),
    },
  );

  assert.equal(result, "ok");
  assert.equal(previousEntries.length, 2);
  assert.equal(logs.length, 1);

  const payload = JSON.parse(logs[0][1] as string) as Record<string, unknown>;
  assert.equal(payload.simulationId, "sim_visible_456");
  assert.equal(payload.totalTokens, 30);
});

test("runWithAiTokenSummaryLogging keeps overlapping simulations isolated", async () => {
  const firstLogs: unknown[][] = [];
  const secondLogs: unknown[][] = [];
  const previousEntries: AiCallLogEntry[] = [];
  const firstDone = deferred<void>();
  const secondDone = deferred<void>();
  const gateway = {
    onLog: (entry: AiCallLogEntry) => previousEntries.push(entry),
  };

  const firstRun = runWithAiTokenSummaryLogging(
    gateway,
    "sim_first",
    async () => {
      await firstDone.promise;
      return "first";
    },
    {
      info: (...args: unknown[]) => firstLogs.push(args),
    },
  );
  const secondRun = runWithAiTokenSummaryLogging(
    gateway,
    "sim_second",
    async () => {
      await secondDone.promise;
      return "second";
    },
    {
      info: (...args: unknown[]) => secondLogs.push(args),
    },
  );

  gateway.onLog?.(makeLog({
    simulationId: hashPrompt("sim_first"),
    inputTokens: 10,
    outputTokens: 20,
  }));

  firstDone.resolve();
  assert.equal(await firstRun, "first");

  gateway.onLog?.(makeLog({
    simulationId: hashPrompt("sim_second"),
    inputTokens: 7,
    outputTokens: 8,
  }));

  secondDone.resolve();
  assert.equal(await secondRun, "second");

  assert.equal(previousEntries.length, 2);
  assert.equal(readTotalTokens(firstLogs), 30);
  assert.equal(readTotalTokens(secondLogs), 15);
});

test("addSimulationAiCallLogListener forwards only matching simulation logs", () => {
  const received: AiCallLogEntry[] = [];
  const gateway: { onLog?: (entry: AiCallLogEntry) => void } = {};
  const unsubscribe = addSimulationAiCallLogListener(
    gateway,
    "sim_target",
    (entry) => received.push(entry),
  );

  gateway.onLog?.(makeLog({
    simulationId: hashPrompt("sim_target"),
    inputTokens: 1,
    outputTokens: 2,
  }));
  gateway.onLog?.(makeLog({
    simulationId: hashPrompt("sim_other"),
    inputTokens: 100,
    outputTokens: 200,
  }));
  unsubscribe();

  assert.equal(received.length, 1);
  assert.equal(received[0].inputTokens, 1);
  assert.equal(received[0].outputTokens, 2);
});

function makeLog(overrides: Partial<AiCallLogEntry> = {}): AiCallLogEntry {
  return {
    timestamp: "2026-07-02T00:00:00.000Z",
    provider: "gemini",
    modelProfileId: "gemini_flash_fast",
    modelId: "gemini-3.5-flash",
    step: "generate_report",
    scenarioType: "side_hustle",
    promptHash: "abcd1234abcd1234",
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 10,
    success: true,
    ...overrides,
  };
}

function readTotalTokens(logs: unknown[][]): unknown {
  assert.equal(logs.length, 1);
  const payload = JSON.parse(logs[0][1] as string) as Record<string, unknown>;
  return payload.totalTokens;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}
