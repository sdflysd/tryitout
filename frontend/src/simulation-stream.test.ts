import assert from "node:assert/strict";
import test from "node:test";

import { parseSimulationStreamChunk } from "./simulation-stream.js";

test("parseSimulationStreamChunk parses SSE progress and completed events split across chunks", () => {
  const parsed: unknown[] = [];
  let buffer = "";

  const first = parseSimulationStreamChunk(
    buffer,
    'event: progress\ndata: {"percent":25,"message":"初始化世界状态完成"}\n\n' +
      'event: completed\ndata: {"id":"sim_',
  );
  parsed.push(...first.events);
  buffer = first.buffer;

  const second = parseSimulationStreamChunk(buffer, 'abc","status":"completed"}\n\n');
  parsed.push(...second.events);

  assert.deepEqual(parsed, [
    {
      type: "progress",
      data: {
        percent: 25,
        message: "初始化世界状态完成",
      },
    },
    {
      type: "completed",
      data: {
        id: "sim_abc",
        status: "completed",
      },
    },
  ]);
  assert.equal(second.buffer, "");
});
