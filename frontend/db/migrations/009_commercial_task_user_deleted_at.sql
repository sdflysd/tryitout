BEGIN;

ALTER TABLE simulation_tasks
  ADD COLUMN IF NOT EXISTS user_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS simulation_tasks_user_id_user_deleted_at_idx
  ON simulation_tasks(user_id, user_deleted_at, updated_at DESC);

COMMIT;
