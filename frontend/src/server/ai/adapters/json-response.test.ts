import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonResponse } from "./json-response.js";

test("parseJsonResponse exposes malformed model JSON as a structured retryable error", () => {
  assert.throws(
    () => parseJsonResponse('{"agents":[{"id":"agent_1","name":"半截输出}'),
    (error) => {
      assert.equal(error instanceof SyntaxError, true);
      assert.equal((error as { code?: string }).code, "ai_json_parse_error");
      assert.equal(
        (error as { rawText?: string }).rawText,
        '{"agents":[{"id":"agent_1","name":"半截输出}',
      );
      assert.match(String((error as { parserMessage?: string }).parserMessage), /json/i);
      return true;
    },
  );
});
