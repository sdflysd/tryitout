import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeepModeCopy,
  getDeepModeDisabledCopy,
  getDeepModeUnavailableNotice,
} from "./deep-mode-copy.js";

test("getDeepModeCopy names the Agent interaction engine as deep mode", () => {
  assert.match(getDeepModeCopy().title, /Agent/);
  assert.match(getDeepModeCopy().description, /投票|裁判|状态/);
});

test("getDeepModeUnavailableNotice explains server flag fallback", () => {
  assert.match(getDeepModeUnavailableNotice(), /未启用|基础模式/);
});

test("getDeepModeDisabledCopy explains unavailable server capability", () => {
  assert.match(
    getDeepModeDisabledCopy("Deep Agent mode is not enabled on this server."),
    /基础模式|未启用/,
  );
});
