-- Allow per-code and bulk access-code restore operations in existing databases.

BEGIN;

ALTER TABLE admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_action_check CHECK (
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
  );

COMMIT;
