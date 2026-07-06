import assert from "node:assert/strict";
import test from "node:test";

import { getPrivacySafetyCopy } from "./privacy-copy.js";

test("privacy safety copy warns against sensitive personal data and raw chat storage", () => {
  const copy = getPrivacySafetyCopy();
  assert.match(copy, /身份证|手机号|真实姓名/);
  assert.match(copy, /不会把完整原始聊天写入验证事件/);
});

test("privacy safety copy can render English UI text", () => {
  const copy = getPrivacySafetyCopy("en-US");

  assert.match(copy, /Privacy note/);
  assert.match(copy, /phone numbers|legal names|full addresses/);
  assert.match(copy, /raw chat/i);
});
