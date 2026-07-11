-- Persist BYOK provider test failure details for user-facing diagnostics.

BEGIN;

ALTER TABLE user_model_providers
  ADD COLUMN IF NOT EXISTS last_test_error text;

COMMIT;
