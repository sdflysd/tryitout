BEGIN;

ALTER TABLE simulation_tasks
  DROP CONSTRAINT IF EXISTS simulation_tasks_status_check;

ALTER TABLE simulation_tasks
  ADD CONSTRAINT simulation_tasks_status_check CHECK (
    status IN (
      'queued',
      'running',
      'recoverable_failed',
      'completed',
      'failed',
      'cancelled',
      'refunded'
    )
  );

ALTER TABLE simulation_tasks
  ADD COLUMN IF NOT EXISTS user_input jsonb;

ALTER TABLE simulation_tasks
  DROP CONSTRAINT IF EXISTS simulation_tasks_user_input_object_check;

ALTER TABLE simulation_tasks
  ADD CONSTRAINT simulation_tasks_user_input_object_check CHECK (
    user_input IS NULL OR jsonb_typeof(user_input) = 'object'
  );

CREATE TABLE IF NOT EXISTS simulation_checkpoints (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  stage_index integer,
  step_name text NOT NULL,
  checkpoint jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulation_checkpoints_checkpoint_object_check CHECK (jsonb_typeof(checkpoint) = 'object')
);

CREATE INDEX IF NOT EXISTS simulation_checkpoints_task_id_created_at_idx
  ON simulation_checkpoints(task_id, created_at DESC);

COMMIT;
