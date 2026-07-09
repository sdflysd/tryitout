-- Admin management operations and platform model configuration.

BEGIN;

ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_action_check CHECK (
    action IN (
      'access_code_batch_created',
      'access_code_batch_disabled',
      'access_code_batch_exported',
      'access_code_disabled',
      'access_code_deleted',
      'access_codes_bulk_disabled',
      'access_codes_bulk_deleted',
      'user_credit_adjusted',
      'credits_adjusted',
      'user_created',
      'task_refunded',
      'task_retried',
      'task_cancelled',
      'user_updated',
      'user_disabled',
      'user_restored',
      'user_deleted',
      'user_tier_changed',
      'sensitive_report_viewed',
      'platform_model_provider_saved',
      'platform_model_provider_tested',
      'platform_model_provider_models_listed',
      'platform_model_profiles_updated',
      'system_setting_updated',
      'queue_paused',
      'queue_resumed'
    )
  );

CREATE TABLE IF NOT EXISTS platform_model_providers (
  id text PRIMARY KEY,
  provider text NOT NULL,
  display_name text NOT NULL,
  base_url text,
  encrypted_api_key text NOT NULL,
  api_key_mask text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_tested_at timestamptz,
  last_test_status text,
  last_model_sync_at timestamptz,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_model_providers_provider_check CHECK (
    provider IN ('gemini', 'anthropic', 'openai_compatible')
  ),
  CONSTRAINT platform_model_providers_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT platform_model_providers_last_test_status_check CHECK (
    last_test_status IS NULL OR last_test_status IN ('passed', 'failed')
  ),
  CONSTRAINT platform_model_providers_display_name_unique UNIQUE (display_name)
);

CREATE TABLE IF NOT EXISTS platform_model_profiles (
  id text PRIMARY KEY,
  provider_config_id text NOT NULL REFERENCES platform_model_providers(id) ON DELETE CASCADE,
  label text NOT NULL,
  provider_label text,
  model_id text NOT NULL,
  quality text NOT NULL,
  visible_to_user boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_model_profiles_quality_check CHECK (quality IN ('fast', 'balanced', 'deep')),
  CONSTRAINT platform_model_profiles_status_check CHECK (status IN ('active', 'disabled', 'deprecated')),
  CONSTRAINT platform_model_profiles_capabilities_object_check CHECK (jsonb_typeof(capabilities) = 'object'),
  CONSTRAINT platform_model_profiles_limits_object_check CHECK (jsonb_typeof(limits) = 'object'),
  CONSTRAINT platform_model_profiles_provider_model_unique UNIQUE (provider_config_id, model_id)
);

CREATE INDEX IF NOT EXISTS access_codes_deleted_at_idx ON access_codes(deleted_at);
CREATE INDEX IF NOT EXISTS platform_model_providers_status_idx ON platform_model_providers(status);
CREATE INDEX IF NOT EXISTS platform_model_profiles_provider_config_id_idx ON platform_model_profiles(provider_config_id);
CREATE INDEX IF NOT EXISTS platform_model_profiles_status_visible_idx
  ON platform_model_profiles(status, visible_to_user);
CREATE INDEX IF NOT EXISTS platform_model_profiles_quality_idx ON platform_model_profiles(quality);

COMMIT;
