BEGIN;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'basic',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_tier_check CHECK (tier IN ('basic', 'pro', 'business')),
  CONSTRAINT users_features_array_check CHECK (jsonb_typeof(features) = 'array')
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX user_sessions_user_id_idx ON user_sessions(user_id);

CREATE TABLE user_credit_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_credit_accounts_balance_nonnegative CHECK (balance >= 0)
);

CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_type_check CHECK (type IN ('redeem', 'hold', 'capture', 'release', 'adjustment')),
  CONSTRAINT credit_ledger_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT credit_ledger_nonzero_amount CHECK (amount <> 0),
  CONSTRAINT credit_ledger_balance_after_nonnegative CHECK (balance_after >= 0),
  CONSTRAINT credit_ledger_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX credit_ledger_user_id_idx ON credit_ledger(user_id);

CREATE TABLE access_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  masked_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  credit_amount INTEGER NOT NULL,
  tier TEXT NOT NULL DEFAULT 'basic',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ,
  redeemed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_by_admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_codes_code_hash_unique UNIQUE (code_hash),
  CONSTRAINT access_codes_status_check CHECK (status IN ('active', 'redeemed', 'disabled', 'expired')),
  CONSTRAINT access_codes_tier_check CHECK (tier IN ('basic', 'pro', 'business')),
  CONSTRAINT access_codes_credit_amount_positive CHECK (credit_amount > 0),
  CONSTRAINT access_codes_features_array_check CHECK (jsonb_typeof(features) = 'array')
);

CREATE TABLE access_code_redemptions (
  id TEXT PRIMARY KEY,
  access_code_id TEXT NOT NULL REFERENCES access_codes(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ledger_entry_id TEXT NOT NULL REFERENCES credit_ledger(id) ON DELETE RESTRICT,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_code_redemptions_access_code_unique UNIQUE (access_code_id),
  CONSTRAINT access_code_redemptions_ledger_entry_unique UNIQUE (ledger_entry_id)
);

CREATE TABLE user_model_providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL DEFAULT 'openai_compatible',
  base_url TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_model_providers_user_unique UNIQUE (user_id),
  CONSTRAINT user_model_providers_type_check CHECK (provider_type IN ('openai_compatible'))
);

CREATE TABLE simulation_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  scenario TEXT NOT NULL,
  user_input TEXT NOT NULL,
  interaction_mode TEXT NOT NULL,
  provider_mode TEXT NOT NULL,
  credit_cost INTEGER NOT NULL,
  credit_hold_ledger_entry_id TEXT REFERENCES credit_ledger(id) ON DELETE RESTRICT,
  credit_captured_ledger_entry_id TEXT REFERENCES credit_ledger(id) ON DELETE RESTRICT,
  credit_released_ledger_entry_id TEXT REFERENCES credit_ledger(id) ON DELETE RESTRICT,
  queue_job_id TEXT,
  report_id TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT simulation_tasks_status_check CHECK (status IN ('queued', 'running', 'recoverable_failed', 'completed', 'failed', 'cancelled', 'refunded')),
  CONSTRAINT simulation_tasks_scenario_check CHECK (scenario IN ('side_hustle', 'dating', 'life_choice')),
  CONSTRAINT simulation_tasks_interaction_mode_check CHECK (interaction_mode IN ('legacy', 'enabled')),
  CONSTRAINT simulation_tasks_provider_mode_check CHECK (provider_mode IN ('platform', 'byok')),
  CONSTRAINT simulation_tasks_credit_cost_positive CHECK (credit_cost > 0)
);

CREATE INDEX simulation_tasks_status_idx ON simulation_tasks(status);
CREATE INDEX simulation_tasks_user_id_idx ON simulation_tasks(user_id);

CREATE TABLE simulation_reports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT simulation_reports_task_unique UNIQUE (task_id),
  CONSTRAINT simulation_reports_report_object_check CHECK (jsonb_typeof(report) = 'object')
);

ALTER TABLE simulation_tasks
  ADD CONSTRAINT simulation_tasks_report_fk
  FOREIGN KEY (report_id) REFERENCES simulation_reports(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE user_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES simulation_reports(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  useful BOOLEAN NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_feedback_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX user_feedback_user_id_idx ON user_feedback(user_id);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX analytics_events_event_type_idx ON analytics_events(event_type);
CREATE INDEX analytics_events_user_id_idx ON analytics_events(user_id);

CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_logs_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX admin_audit_logs_admin_user_id_idx ON admin_audit_logs(admin_user_id);
CREATE INDEX admin_audit_logs_target_idx ON admin_audit_logs(target_type, target_id);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by_admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_value_object_check CHECK (jsonb_typeof(value) = 'object')
);

COMMIT;
