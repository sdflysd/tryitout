-- Platform commercial state schema.
-- Apply this migration before enabling COMMERCIAL_MODE_ENABLED in production.

BEGIN;

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL,
  email_normalized text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  tier text NOT NULL DEFAULT 'basic',
  status text NOT NULL DEFAULT 'active',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized),
  CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'owner')),
  CONSTRAINT users_tier_check CHECK (tier IN ('basic', 'pro', 'business')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'deleted')),
  CONSTRAINT users_features_array_check CHECK (jsonb_typeof(features) = 'array')
);

CREATE TABLE user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  user_agent text,
  ip_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE TABLE user_credit_accounts (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  frozen_credits integer NOT NULL DEFAULT 0,
  total_redeemed integer NOT NULL DEFAULT 0,
  total_captured integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_credit_accounts_balance_check CHECK (balance >= 0),
  CONSTRAINT user_credit_accounts_frozen_check CHECK (frozen_credits >= 0),
  CONSTRAINT user_credit_accounts_total_redeemed_check CHECK (total_redeemed >= 0),
  CONSTRAINT user_credit_accounts_total_captured_check CHECK (total_captured >= 0)
);

CREATE TABLE access_code_batches (
  id text PRIMARY KEY,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  source text,
  code_count integer NOT NULL,
  credits integer NOT NULL,
  tier text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  entitlement_duration_days integer,
  disabled_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_code_batches_code_count_check CHECK (code_count > 0),
  CONSTRAINT access_code_batches_credits_check CHECK (credits > 0),
  CONSTRAINT access_code_batches_entitlement_duration_days_check CHECK (
    entitlement_duration_days IS NULL OR entitlement_duration_days > 0
  ),
  CONSTRAINT access_code_batches_tier_check CHECK (tier IS NULL OR tier IN ('basic', 'pro', 'business')),
  CONSTRAINT access_code_batches_features_array_check CHECK (jsonb_typeof(features) = 'array'),
  CONSTRAINT access_code_batches_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE access_codes (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES access_code_batches(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_mask text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  credits integer NOT NULL,
  tier text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  entitlement_duration_days integer,
  redeemed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  disabled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_codes_code_hash_unique UNIQUE (code_hash),
  CONSTRAINT access_codes_status_check CHECK (status IN ('active', 'redeemed', 'disabled', 'expired')),
  CONSTRAINT access_codes_credits_check CHECK (credits > 0),
  CONSTRAINT access_codes_entitlement_duration_days_check CHECK (
    entitlement_duration_days IS NULL OR entitlement_duration_days > 0
  ),
  CONSTRAINT access_codes_tier_check CHECK (tier IS NULL OR tier IN ('basic', 'pro', 'business')),
  CONSTRAINT access_codes_features_array_check CHECK (jsonb_typeof(features) = 'array')
);

CREATE TABLE access_code_redemptions (
  id text PRIMARY KEY,
  access_code_id text NOT NULL REFERENCES access_codes(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_ledger_id text,
  credits integer NOT NULL,
  tier_granted text,
  features_granted jsonb NOT NULL DEFAULT '[]'::jsonb,
  entitlement_starts_at timestamptz,
  entitlement_expires_at timestamptz,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT access_code_redemptions_code_unique UNIQUE (access_code_id),
  CONSTRAINT access_code_redemptions_credits_check CHECK (credits > 0),
  CONSTRAINT access_code_redemptions_tier_check CHECK (
    tier_granted IS NULL OR tier_granted IN ('basic', 'pro', 'business')
  ),
  CONSTRAINT access_code_redemptions_entitlement_window_check CHECK (
    entitlement_expires_at IS NULL
    OR entitlement_starts_at IS NULL
    OR entitlement_expires_at > entitlement_starts_at
  ),
  CONSTRAINT access_code_redemptions_features_array_check CHECK (jsonb_typeof(features_granted) = 'array'),
  CONSTRAINT access_code_redemptions_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE simulation_tasks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_type text NOT NULL,
  interaction_mode text NOT NULL,
  provider_mode text NOT NULL,
  status text NOT NULL,
  credit_cost integer NOT NULL,
  credit_hold_ledger_id text,
  priority integer NOT NULL DEFAULT 0,
  queue_weight integer NOT NULL DEFAULT 1,
  idempotency_key text,
  model_selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_input jsonb,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  user_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulation_tasks_interaction_mode_check CHECK (interaction_mode IN ('legacy', 'enabled')),
  CONSTRAINT simulation_tasks_provider_mode_check CHECK (provider_mode IN ('platform', 'byok')),
  CONSTRAINT simulation_tasks_status_check CHECK (
    status IN ('queued', 'running', 'recoverable_failed', 'completed', 'failed', 'cancelled', 'refunded')
  ),
  CONSTRAINT simulation_tasks_credit_cost_check CHECK (credit_cost >= 0),
  CONSTRAINT simulation_tasks_queue_weight_check CHECK (queue_weight > 0),
  CONSTRAINT simulation_tasks_model_selection_object_check CHECK (jsonb_typeof(model_selection) = 'object'),
  CONSTRAINT simulation_tasks_user_input_object_check CHECK (
    user_input IS NULL OR jsonb_typeof(user_input) = 'object'
  ),
  CONSTRAINT simulation_tasks_input_summary_object_check CHECK (jsonb_typeof(input_summary) = 'object'),
  CONSTRAINT simulation_tasks_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX simulation_tasks_user_id_user_deleted_at_idx
  ON simulation_tasks(user_id, user_deleted_at, updated_at DESC);

CREATE TABLE credit_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id text REFERENCES simulation_tasks(id) ON DELETE SET NULL,
  access_code_id text REFERENCES access_codes(id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  frozen_after integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT credit_ledger_entry_type_check CHECK (
    entry_type IN ('redeem', 'hold', 'capture', 'release', 'refund', 'adjustment')
  ),
  CONSTRAINT credit_ledger_balance_after_check CHECK (balance_after >= 0),
  CONSTRAINT credit_ledger_frozen_after_check CHECK (frozen_after >= 0),
  CONSTRAINT credit_ledger_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE access_code_redemptions
  ADD CONSTRAINT access_code_redemptions_credit_ledger_fk
  FOREIGN KEY (credit_ledger_id) REFERENCES credit_ledger(id) ON DELETE SET NULL;

ALTER TABLE simulation_tasks
  ADD CONSTRAINT simulation_tasks_credit_hold_ledger_fk
  FOREIGN KEY (credit_hold_ledger_id) REFERENCES credit_ledger(id) ON DELETE SET NULL;

CREATE TABLE simulation_task_runs (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  worker_id text,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT simulation_task_runs_attempt_check CHECK (attempt > 0),
  CONSTRAINT simulation_task_runs_status_check CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT simulation_task_runs_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  active_weight integer NOT NULL DEFAULT 0,
  current_task_id text REFERENCES simulation_tasks(id) ON DELETE SET NULL,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_heartbeats_active_weight_check CHECK (active_weight >= 0)
);

CREATE TABLE simulation_step_runs (
  id text PRIMARY KEY,
  task_run_id text REFERENCES simulation_task_runs(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  stage_index integer,
  step_name text NOT NULL,
  round_index integer,
  agent_id text,
  provider text,
  model_id text,
  model_profile_id text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cached_tokens integer,
  estimated_cost numeric(12, 6),
  latency_ms integer,
  retry_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT simulation_step_runs_status_check CHECK (status IN ('started', 'completed', 'failed')),
  CONSTRAINT simulation_step_runs_token_checks CHECK (
    (prompt_tokens IS NULL OR prompt_tokens >= 0)
    AND (completion_tokens IS NULL OR completion_tokens >= 0)
    AND (total_tokens IS NULL OR total_tokens >= 0)
    AND (cached_tokens IS NULL OR cached_tokens >= 0)
  ),
  CONSTRAINT simulation_step_runs_estimated_cost_check CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  CONSTRAINT simulation_step_runs_latency_check CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT simulation_step_runs_retry_count_check CHECK (retry_count >= 0),
  CONSTRAINT simulation_step_runs_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE simulation_checkpoints (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  stage_index integer,
  step_name text NOT NULL,
  checkpoint jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulation_checkpoints_checkpoint_object_check CHECK (jsonb_typeof(checkpoint) = 'object')
);

CREATE TABLE simulation_reports (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_report jsonb,
  deep_report jsonb,
  share_card jsonb,
  unlocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulation_reports_task_unique UNIQUE (task_id)
);

CREATE TABLE analytics_events (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  task_id text REFERENCES simulation_tasks(id) ON DELETE SET NULL,
  session_id text REFERENCES user_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_properties_object_check CHECK (jsonb_typeof(properties) = 'object')
);

CREATE TABLE user_feedback (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  task_id text REFERENCES simulation_tasks(id) ON DELETE SET NULL,
  report_id text REFERENCES simulation_reports(id) ON DELETE SET NULL,
  rating integer,
  feedback_type text,
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_feedback_rating_check CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT user_feedback_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE user_model_providers (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  base_url text NOT NULL,
  encrypted_api_key text NOT NULL,
  api_key_mask text NOT NULL,
  model_fast text,
  model_balanced text,
  model_deep text,
  status text NOT NULL DEFAULT 'active',
  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_model_providers_user_provider_unique UNIQUE (user_id, provider),
  CONSTRAINT user_model_providers_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT user_model_providers_last_test_status_check CHECK (
    last_test_status IS NULL OR last_test_status IN ('passed', 'failed')
  )
);

CREATE TABLE platform_model_providers (
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

CREATE TABLE platform_model_profiles (
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

CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_logs (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_logs_action_check CHECK (
    action IN (
      'access_code_batch_created',
      'access_code_batch_disabled',
      'access_code_batch_exported',
      'access_code_disabled',
      'access_code_restored',
      'access_code_deleted',
      'access_codes_bulk_disabled',
      'access_codes_bulk_restored',
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
  ),
  CONSTRAINT admin_audit_logs_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX credit_ledger_user_id_idx ON credit_ledger(user_id);
CREATE UNIQUE INDEX credit_ledger_hold_completion_unique_idx
  ON credit_ledger ((metadata ->> 'holdLedgerId'))
  WHERE entry_type IN ('capture', 'release')
    AND metadata ? 'holdLedgerId';
CREATE UNIQUE INDEX credit_ledger_refund_capture_unique_idx
  ON credit_ledger ((metadata ->> 'captureLedgerId'))
  WHERE entry_type = 'refund'
    AND metadata ? 'captureLedgerId';
CREATE INDEX access_codes_batch_id_idx ON access_codes(batch_id);
CREATE INDEX access_codes_deleted_at_idx ON access_codes(deleted_at);
CREATE INDEX access_code_redemptions_user_id_idx ON access_code_redemptions(user_id);
CREATE INDEX simulation_tasks_status_idx ON simulation_tasks(status);
CREATE INDEX simulation_tasks_user_id_idx ON simulation_tasks(user_id);
CREATE INDEX simulation_task_runs_task_id_idx ON simulation_task_runs(task_id);
CREATE INDEX worker_heartbeats_current_task_id_idx ON worker_heartbeats(current_task_id);
CREATE INDEX simulation_step_runs_task_id_idx ON simulation_step_runs(task_id);
CREATE INDEX simulation_checkpoints_task_id_created_at_idx
  ON simulation_checkpoints(task_id, created_at DESC);
CREATE INDEX simulation_reports_task_id_idx ON simulation_reports(task_id);
CREATE INDEX analytics_events_event_type_idx ON analytics_events(event_type);
CREATE INDEX user_feedback_user_id_idx ON user_feedback(user_id);
CREATE INDEX user_model_providers_user_id_idx ON user_model_providers(user_id);
CREATE INDEX platform_model_providers_status_idx ON platform_model_providers(status);
CREATE INDEX platform_model_profiles_provider_config_id_idx ON platform_model_profiles(provider_config_id);
CREATE INDEX platform_model_profiles_status_visible_idx
  ON platform_model_profiles(status, visible_to_user);
CREATE INDEX platform_model_profiles_quality_idx ON platform_model_profiles(quality);
CREATE INDEX admin_audit_logs_actor_user_id_idx ON admin_audit_logs(actor_user_id);

COMMIT;
