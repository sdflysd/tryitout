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
