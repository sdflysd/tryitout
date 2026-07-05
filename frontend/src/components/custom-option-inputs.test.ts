import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_OPTION_VALUE,
  resolveCustomMultiChoice,
  resolveCustomSingleChoice,
} from "./custom-option-inputs.js";

test("resolveCustomSingleChoice keeps a preset value unchanged", () => {
  const result = resolveCustomSingleChoice({
    selectedValue: "单次收费",
    customValue: "会员制",
    fieldLabel: "变现方式",
  });

  assert.deepEqual(result, { value: "单次收费" });
});

test("resolveCustomSingleChoice trims a selected custom value", () => {
  const result = resolveCustomSingleChoice({
    selectedValue: CUSTOM_OPTION_VALUE,
    customValue: "  校园代理 + 线下社群  ",
    fieldLabel: "变现方式",
  });

  assert.deepEqual(result, { value: "校园代理 + 线下社群" });
});

test("resolveCustomSingleChoice reports an error when selected custom value is blank", () => {
  const result = resolveCustomSingleChoice({
    selectedValue: CUSTOM_OPTION_VALUE,
    customValue: "   ",
    fieldLabel: "现实状态背景",
  });

  assert.deepEqual(result, { error: "请填写自定义现实状态背景。" });
});

test("resolveCustomMultiChoice appends a trimmed custom value", () => {
  const result = resolveCustomMultiChoice({
    selectedValues: ["小红书"],
    customValue: "  校园社群地推  ",
  });

  assert.deepEqual(result, ["小红书", "校园社群地推"]);
});

test("resolveCustomMultiChoice deduplicates a custom value that already exists", () => {
  const result = resolveCustomMultiChoice({
    selectedValues: ["小红书", "校园社群地推"],
    customValue: "校园社群地推",
  });

  assert.deepEqual(result, ["小红书", "校园社群地推"]);
});
