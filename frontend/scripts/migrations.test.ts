import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationRoot = resolve("db", "migrations");

function readMigration(name: string): string {
  return readFileSync(resolve(migrationRoot, name), "utf8");
}

test("model selection migration upgrades existing commercial task tables", () => {
  const sql = readMigration("002_add_simulation_task_model_selection.sql");

  assert.match(sql, /alter\s+table\s+simulation_tasks/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+model_selection\s+jsonb/i);
  assert.match(sql, /set\s+default\s+'\{\}'::jsonb/i);
  assert.match(sql, /set\s+not\s+null/i);
  assert.match(sql, /simulation_tasks_model_selection_object_check/i);
  assert.match(sql, /jsonb_typeof\s*\(\s*model_selection\s*\)\s*=\s*'object'/i);
});

test("admin management migration adds access-code deletion and platform model config", () => {
  const sql = readMigration("003_admin_management_overhaul.sql");

  assert.match(sql, /alter\s+table\s+access_codes/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+deleted_at\s+timestamptz/i);
  assert.match(sql, /drop\s+constraint\s+if\s+exists\s+admin_audit_logs_action_check/i);
  for (const action of [
    "user_created",
    "user_updated",
    "user_deleted",
    "access_code_deleted",
    "access_codes_bulk_disabled",
    "access_codes_bulk_deleted",
    "platform_model_provider_saved",
    "platform_model_provider_tested",
    "platform_model_profiles_updated",
  ]) {
    assert.match(sql, new RegExp(`'${action}'`, "i"));
  }
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+platform_model_providers/i);
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+platform_model_profiles/i);
  assert.match(sql, /encrypted_api_key\s+text\s+not\s+null/i);
  assert.match(sql, /api_key_mask\s+text\s+not\s+null/i);
  assert.match(sql, /provider_config_id\s+text\s+not\s+null/i);
  assert.match(sql, /visible_to_user\s+boolean\s+not\s+null/i);
});

test("fresh platformized commercial schema includes admin management columns and tables", () => {
  const sql = readMigration("001_platformized_commercial.sql");

  assert.match(sql, /deleted_at\s+timestamptz/i);
  assert.match(sql, /create\s+table\s+platform_model_providers/i);
  assert.match(sql, /create\s+table\s+platform_model_profiles/i);
  for (const action of [
    "user_created",
    "user_updated",
    "user_deleted",
    "access_code_deleted",
    "access_codes_bulk_disabled",
    "access_codes_bulk_deleted",
    "platform_model_provider_saved",
    "platform_model_provider_tested",
    "platform_model_profiles_updated",
  ]) {
    assert.match(sql, new RegExp(`'${action}'`, "i"));
  }
});
