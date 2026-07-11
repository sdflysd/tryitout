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
    "access_code_restored",
    "access_code_deleted",
    "access_codes_bulk_disabled",
    "access_codes_bulk_restored",
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

  assert.match(sql, /'recoverable_failed'/i);
  assert.match(sql, /user_input\s+jsonb/i);
  assert.match(sql, /simulation_tasks_user_input_object_check/i);
  assert.match(sql, /create\s+table\s+simulation_checkpoints/i);
  assert.match(sql, /simulation_checkpoints_checkpoint_object_check/i);
  assert.match(sql, /deleted_at\s+timestamptz/i);
  assert.match(sql, /access_code_batches[\s\S]*entitlement_duration_days\s+integer/i);
  assert.match(sql, /access_codes[\s\S]*entitlement_duration_days\s+integer/i);
  assert.match(sql, /access_code_redemptions[\s\S]*entitlement_starts_at\s+timestamptz/i);
  assert.match(sql, /access_code_redemptions[\s\S]*entitlement_expires_at\s+timestamptz/i);
  assert.match(sql, /create\s+table\s+platform_model_providers/i);
  assert.match(sql, /create\s+table\s+platform_model_profiles/i);
  for (const action of [
    "user_created",
    "user_updated",
    "user_deleted",
    "access_code_restored",
    "access_code_deleted",
    "access_codes_bulk_disabled",
    "access_codes_bulk_restored",
    "access_codes_bulk_deleted",
    "platform_model_provider_saved",
    "platform_model_provider_tested",
    "platform_model_profiles_updated",
  ]) {
    assert.match(sql, new RegExp(`'${action}'`, "i"));
  }
});

test("commercial checkpoint migration adds recoverable status and checkpoint storage", () => {
  const sql = readMigration("008_commercial_simulation_checkpoints.sql");

  assert.match(sql, /drop\s+constraint\s+if\s+exists\s+simulation_tasks_status_check/i);
  assert.match(sql, /'recoverable_failed'/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+user_input\s+jsonb/i);
  assert.match(sql, /simulation_tasks_user_input_object_check/i);
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+simulation_checkpoints/i);
  assert.match(sql, /checkpoint\s+jsonb\s+not\s+null/i);
  assert.match(sql, /simulation_checkpoints_task_id_created_at_idx/i);
});

test("access-code restore migration updates admin audit action constraint", () => {
  const sql = readMigration("004_access_code_restore_audit_actions.sql");

  assert.match(sql, /drop\s+constraint\s+if\s+exists\s+admin_audit_logs_action_check/i);
  assert.match(sql, /add\s+constraint\s+admin_audit_logs_action_check/i);
  assert.match(sql, /'access_code_restored'/i);
  assert.match(sql, /'access_codes_bulk_restored'/i);
});

test("access-code redemption entitlement migration backfills users from prior redemptions", () => {
  const sql = readMigration("005_backfill_access_code_redemption_entitlements.sql");

  assert.match(sql, /from\s+access_code_redemptions/i);
  assert.match(sql, /tier_granted/i);
  assert.match(sql, /features_granted/i);
  assert.match(sql, /update\s+users/i);
  assert.match(sql, /jsonb_array_elements_text/i);
  assert.match(sql, /users\.features\s+@>\s+redemption_entitlements\.features/i);
});

test("timed access-code entitlement migration adds grant windows", () => {
  const sql = readMigration("006_timed_access_code_entitlements.sql");

  assert.match(sql, /alter\s+table\s+access_code_batches/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+entitlement_duration_days\s+integer/i);
  assert.match(sql, /alter\s+table\s+access_codes/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+entitlement_duration_days\s+integer/i);
  assert.match(sql, /alter\s+table\s+access_code_redemptions/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+entitlement_starts_at\s+timestamptz/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+entitlement_expires_at\s+timestamptz/i);
  assert.match(sql, /update\s+access_code_redemptions/i);
  assert.match(sql, /entitlement_starts_at\s*=\s*redeemed_at/i);
  assert.match(sql, /entitlement_expires_at\s+is\s+null/i);
  for (const constraint of [
    "access_code_batches_entitlement_duration_days_check",
    "access_codes_entitlement_duration_days_check",
    "access_code_redemptions_entitlement_window_check",
  ]) {
    assert.match(sql, new RegExp(constraint, "i"));
  }
});

test("user model provider test error migration stores BYOK diagnostics", () => {
  const sql = readMigration("007_user_model_provider_test_error.sql");

  assert.match(sql, /alter\s+table\s+user_model_providers/i);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+last_test_error\s+text/i);
});
