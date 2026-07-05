import assert from "node:assert/strict";
import test from "node:test";

import { getPrivacySafetyCopy } from "./privacy-copy.js";

test("privacy safety copy warns against sensitive personal data and raw chat storage", () => {
  const copy = getPrivacySafetyCopy();
  assert.match(copy, /身份证|手机号|真实姓名/);
  assert.match(copy, /不会把完整原始聊天写入验证事件/);
});
