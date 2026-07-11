# Commercial Database

Commercial mode uses Postgres as the source of truth for users, sessions, credits, access codes, task state, reports, analytics, feedback, BYOK provider settings, system settings, and admin audit logs.

## Migration Order

Apply migrations in lexical order from `frontend/db/migrations`.

Current order:

1. `001_platformized_commercial.sql` creates the initial commercial platform schema.
2. `002_add_simulation_task_model_selection.sql` adds per-task model selection metadata for existing databases.
3. `003_admin_management_overhaul.sql` adds admin user, access-code, and platform model operations.
4. `004_access_code_restore_audit_actions.sql` updates access-code restore audit actions for existing databases.
5. `005_backfill_access_code_redemption_entitlements.sql` backfills user tier and feature grants from prior access-code redemptions.
6. `006_timed_access_code_entitlements.sql` adds post-redemption entitlement windows for time-limited access-code grants.
7. `007_user_model_provider_test_error.sql` stores BYOK provider test diagnostics.
8. `008_commercial_simulation_checkpoints.sql` adds recoverable commercial simulation checkpoints.

`001_commercial_mvp.sql` is a legacy MVP schema kept for historical compatibility. New platform deployments should start from `001_platformized_commercial.sql`; do not apply both initial schemas to the same database.

Do not enable `COMMERCIAL_MODE_ENABLED=true` against a production service until every migration for the deployed commit has been applied successfully.

## Required Environment Variables

Commercial mode is enabled only when:

```bash
COMMERCIAL_MODE_ENABLED=true
```

When enabled, the server requires:

- `DATABASE_URL`: Postgres connection URL.
- `REDIS_URL`: Redis connection URL for queue-backed workers.
- `SESSION_SECRET`: High-entropy session signing secret.
- `ACCESS_CODE_PEPPER`: High-entropy pepper used before hashing access codes.
- `USER_SECRET_ENCRYPTION_KEY`: Base64-encoded 32-byte key used to encrypt user-owned provider secrets.

Optional:

- `MAX_WEIGHTED_CONCURRENCY`: Positive integer worker budget. Defaults to `30`.

## Local Postgres

Use a local Postgres database for development and migration checks. The example configuration in `frontend/.env.example` expects:

```bash
DATABASE_URL=postgres://tryitout:test@localhost:5432/tryitout
```

Create the role and database with your preferred local Postgres tooling, then apply migrations in order with `psql` or the migration runner introduced by later tasks.

Example:

```bash
psql "$DATABASE_URL" -f frontend/db/migrations/001_platformized_commercial.sql
psql "$DATABASE_URL" -f frontend/db/migrations/002_add_simulation_task_model_selection.sql
psql "$DATABASE_URL" -f frontend/db/migrations/003_admin_management_overhaul.sql
psql "$DATABASE_URL" -f frontend/db/migrations/004_access_code_restore_audit_actions.sql
psql "$DATABASE_URL" -f frontend/db/migrations/005_backfill_access_code_redemption_entitlements.sql
psql "$DATABASE_URL" -f frontend/db/migrations/006_timed_access_code_entitlements.sql
psql "$DATABASE_URL" -f frontend/db/migrations/007_user_model_provider_test_error.sql
psql "$DATABASE_URL" -f frontend/db/migrations/008_commercial_simulation_checkpoints.sql
```

## Reset Workflow

For local development only, reset by dropping and recreating the local database, then reapplying every migration in lexical order.

Example:

```bash
dropdb tryitout
createdb tryitout
psql "$DATABASE_URL" -f frontend/db/migrations/001_platformized_commercial.sql
psql "$DATABASE_URL" -f frontend/db/migrations/002_add_simulation_task_model_selection.sql
psql "$DATABASE_URL" -f frontend/db/migrations/003_admin_management_overhaul.sql
psql "$DATABASE_URL" -f frontend/db/migrations/004_access_code_restore_audit_actions.sql
psql "$DATABASE_URL" -f frontend/db/migrations/005_backfill_access_code_redemption_entitlements.sql
psql "$DATABASE_URL" -f frontend/db/migrations/006_timed_access_code_entitlements.sql
psql "$DATABASE_URL" -f frontend/db/migrations/007_user_model_provider_test_error.sql
psql "$DATABASE_URL" -f frontend/db/migrations/008_commercial_simulation_checkpoints.sql
```

Never run a drop/reset workflow against staging or production. Production recovery should use backups, point-in-time restore, or forward migrations.

## Production Repository Requirement

Commercial mode must not use file-backed or in-memory repositories in production. Those stores cannot provide the durability, concurrency control, relational constraints, idempotency guarantees, backup/restore path, or audit trail required for paid credits and admin operations.

Credits are financial-adjacent state: every redeem, hold, capture, release, refund, and adjustment must be recoverable from durable ledger rows with stable idempotency keys. Access-code raw values and provider API keys must also never be reconstructed from temporary process memory or plaintext files. Use Postgres-backed repositories for commercial deployments.

Fields such as `simulation_tasks.input_summary`, `analytics_events.properties`, `user_feedback.metadata`, `user_feedback.comment`, and report JSON are for sanitized operational data only. They must not contain raw prompts, full private user input, secrets, access-code raw values, or provider API keys.
