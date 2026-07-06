import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  getLanguageToggleLabel,
  getNextLanguage,
  parseStoredLanguage,
} from "./language.js";

test("language storage key is stable and defaults to Chinese", () => {
  assert.equal(LANGUAGE_STORAGE_KEY, "tryitout_language");
  assert.equal(DEFAULT_LANGUAGE, "zh-CN");
});

test("stored language parsing accepts supported languages only", () => {
  assert.equal(parseStoredLanguage("zh-CN"), "zh-CN");
  assert.equal(parseStoredLanguage("en-US"), "en-US");
  assert.equal(parseStoredLanguage(""), undefined);
  assert.equal(parseStoredLanguage("en"), undefined);
  assert.equal(parseStoredLanguage("fr-FR"), undefined);
  assert.equal(parseStoredLanguage(null), undefined);
});

test("language toggle helpers return the opposite language", () => {
  assert.equal(getNextLanguage("zh-CN"), "en-US");
  assert.equal(getNextLanguage("en-US"), "zh-CN");
  assert.equal(getLanguageToggleLabel("zh-CN"), "EN");
  assert.equal(getLanguageToggleLabel("en-US"), "中");
});
