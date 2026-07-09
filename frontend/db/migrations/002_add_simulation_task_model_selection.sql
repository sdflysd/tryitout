-- Add per-task model selection for existing commercial databases.

BEGIN;

ALTER TABLE simulation_tasks
  ADD COLUMN IF NOT EXISTS model_selection jsonb;

UPDATE simulation_tasks
SET model_selection = '{}'::jsonb
WHERE model_selection IS NULL;

ALTER TABLE simulation_tasks
  ALTER COLUMN model_selection SET DEFAULT '{}'::jsonb,
  ALTER COLUMN model_selection SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'simulation_tasks_model_selection_object_check'
  ) THEN
    ALTER TABLE simulation_tasks
      ADD CONSTRAINT simulation_tasks_model_selection_object_check
      CHECK (jsonb_typeof(model_selection) = 'object')
      NOT VALID;
  END IF;
END $$;

ALTER TABLE simulation_tasks
  VALIDATE CONSTRAINT simulation_tasks_model_selection_object_check;

COMMIT;
