-- Add post-redemption entitlement windows for access-code grants.

BEGIN;

ALTER TABLE access_code_batches
  ADD COLUMN IF NOT EXISTS entitlement_duration_days integer;

ALTER TABLE access_code_batches
  DROP CONSTRAINT IF EXISTS access_code_batches_entitlement_duration_days_check,
  ADD CONSTRAINT access_code_batches_entitlement_duration_days_check CHECK (
    entitlement_duration_days IS NULL OR entitlement_duration_days > 0
  );

ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS entitlement_duration_days integer;

ALTER TABLE access_codes
  DROP CONSTRAINT IF EXISTS access_codes_entitlement_duration_days_check,
  ADD CONSTRAINT access_codes_entitlement_duration_days_check CHECK (
    entitlement_duration_days IS NULL OR entitlement_duration_days > 0
  );

ALTER TABLE access_code_redemptions
  ADD COLUMN IF NOT EXISTS entitlement_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS entitlement_expires_at timestamptz;

UPDATE access_code_redemptions
SET entitlement_starts_at = redeemed_at
WHERE entitlement_starts_at IS NULL;

ALTER TABLE access_code_redemptions
  DROP CONSTRAINT IF EXISTS access_code_redemptions_entitlement_window_check,
  ADD CONSTRAINT access_code_redemptions_entitlement_window_check CHECK (
    entitlement_expires_at IS NULL
    OR entitlement_starts_at IS NULL
    OR entitlement_expires_at > entitlement_starts_at
  );

COMMIT;
