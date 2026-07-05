import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIFE_CHOICE_FINANCIAL_BUFFER,
  LIFE_CHOICE_FINANCIAL_BUFFER_OPTIONS,
  LIFE_CHOICE_FINANCIAL_BUFFER_QUESTION,
} from "./life-choice-form-options.js";

test("life choice financial buffer options cover student no-income scenarios", () => {
  assert.equal(
    LIFE_CHOICE_FINANCIAL_BUFFER_QUESTION,
    "你现在的经济来源与安全垫大概是什么状态？",
  );
  assert.equal(
    DEFAULT_LIFE_CHOICE_FINANCIAL_BUFFER,
    "无独立收入，主要靠生活费/助学金/家里支持",
  );
  assert.ok(
    LIFE_CHOICE_FINANCIAL_BUFFER_OPTIONS.includes(
      "无独立收入，主要靠生活费/助学金/家里支持",
    ),
  );
  assert.ok(
    LIFE_CHOICE_FINANCIAL_BUFFER_OPTIONS.includes(
      "生活费紧张，需要兼职或打工才能维持",
    ),
  );
  assert.ok(
    LIFE_CHOICE_FINANCIAL_BUFFER_OPTIONS.includes(
      "已断供/欠费/负债，短期必须先赚钱",
    ),
  );
});
