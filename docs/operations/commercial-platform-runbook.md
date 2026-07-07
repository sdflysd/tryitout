# Commercial Platform Runbook

This runbook covers production operation for TryItOut commercial mode. It assumes the code is deployed from the `frontend` package and that migrations in `frontend/db/migrations` have been applied.

## Scope

Commercial mode adds account auth, paid credits, access-code redemption, queued simulation tasks, admin operations, analytics, worker monitoring, and BYOK provider storage. Demo mode remains available when `COMMERCIAL_MODE_ENABLED` is not `true`.

The commercial data store is Postgres. Redis backs queued task execution. The API process serves the app and commercial HTTP endpoints. The worker process must claim commercial queue jobs, record heartbeat, run simulations, and release weighted capacity.

## Required Services

- Postgres 14+ or a compatible managed Postgres service.
- Redis 7+ or a compatible managed Redis service for BullMQ-style queue state.
- API process: `cd frontend && npm start` after `npm run build`.
- Worker process: `cd frontend && npm run worker` once the BullMQ processor is wired for the deployed environment.
- Backup storage for encrypted Postgres backups and raw access-code creation exports.
- Log and metrics collection for API, worker, Postgres, Redis, and host/container health.

## Environment Variables

Required when `COMMERCIAL_MODE_ENABLED=true`:

```bash
COMMERCIAL_MODE_ENABLED=true
DATABASE_URL=postgres://user:password@host:5432/tryitout
REDIS_URL=redis://host:6379
SESSION_SECRET=<high-entropy-session-secret>
ACCESS_CODE_PEPPER=<high-entropy-access-code-pepper>
USER_SECRET_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

Optional:

```bash
MAX_WEIGHTED_CONCURRENCY=30
AI_PROVIDER=gemini
GEMINI_API_KEY=<provider-key>
ANTHROPIC_API_KEY=<provider-key>
OPENAI_COMPATIBLE_API_KEY=<provider-key>
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_MODEL_FAST=gpt-4o-mini
OPENAI_COMPATIBLE_MODEL_BALANCED=gpt-4o
OPENAI_COMPATIBLE_MODEL_DEEP=gpt-4o
ENABLE_AGENT_INTERACTION_MODE=false
ENABLE_AGENT_DEBUG_LOGS=false
APP_URL=https://your-domain.example
```

For admin seeding:

```bash
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=<temporary-bootstrap-password>
ADMIN_ROLE=owner
ADMIN_TIER=business
ADMIN_FEATURES=admin_ops
ADMIN_INITIAL_CREDITS=0
```

Security notes:

- Generate `USER_SECRET_ENCRYPTION_KEY` with 32 random bytes, base64 encoded.
- Treat `SESSION_SECRET`, `ACCESS_CODE_PEPPER`, `USER_SECRET_ENCRYPTION_KEY`, provider keys, and admin bootstrap passwords as secrets.
- Do not rotate `ACCESS_CODE_PEPPER` or `USER_SECRET_ENCRYPTION_KEY` without a migration plan. Existing access-code hashes and BYOK provider secrets depend on them.

## Database

Apply migrations in lexical order before enabling commercial traffic:

```bash
psql "$DATABASE_URL" -f frontend/db/migrations/001_platformized_commercial.sql
```

Commercial tables include users, sessions, credit ledger rows, access-code batches/codes/redemptions, simulation tasks/runs/step costs/reports, analytics events, feedback, BYOK providers, worker heartbeats, system settings, and audit logs.

Operational rules:

- Do not use in-memory or file-backed commercial repositories in production.
- Do not edit ledger rows manually. Use admin adjustment flows and audit logs.
- Do not store raw prompts, full private user input, passwords, access-code raw values, provider API keys, or provider secrets in JSON metadata columns.
- Keep migration execution logs and schema versions with release records.

## Redis And Queue

Redis is used for simulation queue coordination and weighted concurrency. Configure `MAX_WEIGHTED_CONCURRENCY` to cap total active task weight across workers.

Queue health should track:

- `queued`
- `running`
- `retrying`
- `stuck`
- `activeWeight`
- `maxWeight`
- worker heartbeat age

Stuck task detection considers running tasks older than the configured threshold. Investigate stuck tasks before retrying or refunding credits.

## API Process

Build and run:

```bash
cd frontend
npm run build
npm start
```

In commercial mode:

- `/api/register`, `/api/login`, `/api/logout`, `/api/me`, and `/api/credits` handle user auth and credits.
- `/api/simulation-tasks` and related task status/report/cancel endpoints require authenticated commercial sessions.
- Legacy `/api/simulations` and `/api/simulations/stream` are blocked so unauthenticated users cannot bypass credits.
- `/api/model-provider` endpoints store BYOK provider settings with encrypted keys and return only masked DTOs.
- `/api/admin/*` commercial routes require admin or owner sessions.

Deployment gate:

- The legacy cost endpoint `/api/admin/simulation-tasks/:id/cost-summary` still carries a production TODO in `frontend/server.ts`. Protect it behind admin auth or disable it before exposing a commercial deployment.

## Worker Process

The commercial worker must:

- Claim queue jobs only when weighted capacity allows.
- Record `worker_heartbeats` with worker id, active weight, and current task id.
- Mark tasks running before simulation work starts.
- Capture credits on success.
- Release held credits on failure.
- Clear active weight and current task id after release.

Command:

```bash
cd frontend
npm run worker
```

Current implementation note: `frontend/worker.ts` validates commercial services but still reports that BullMQ processor wiring is pending. Do not mark the worker deployable until the deployed process calls the tested queue worker functions in `frontend/src/server/commercial/simulation-worker.ts`.

## Admin Seed

Create or upgrade the first owner/admin:

```bash
cd frontend
ADMIN_EMAIL=owner@example.com \
ADMIN_PASSWORD='<temporary-password>' \
ADMIN_ROLE=owner \
ADMIN_TIER=business \
ADMIN_FEATURES=admin_ops \
ADMIN_INITIAL_CREDITS=0 \
npm run seed:admin
```

The seed script is idempotent by normalized email. Re-running it ensures role, tier, features, and active status. It does not return `passwordHash` and does not expose the plaintext password in the result.

After bootstrap:

- Log in as the owner and rotate to a long-lived password through the account flow when available.
- Remove the bootstrap password from shell history, CI variables, and temporary deployment notes.
- Keep at least two owner accounts controlled by different operators.

## Credits And Access Codes

Credit rules:

- Redeem, hold, capture, release, refund, and adjustment operations must be ledger-backed.
- Use stable idempotency keys for user and admin credit mutations.
- Manual credit changes must include a reason and admin audit log.
- Never change balances by editing `user_credit_accounts` directly unless executing a documented recovery with reconciliation.

Access-code rules:

- Persistent storage uses `code_hash` and `code_mask`; raw codes are returned only at creation/export time.
- Raw code exports must come from the creation payload, not from database records.
- Use `npm run export:access-codes -- <creation-payload.json> <safe-export.json>` immediately after creation if an offline handoff is required.
- The export script refuses database-only records and strips hash, password, token, API key, and secret fields.
- Store raw-code exports in an encrypted vault with limited retention. Delete local copies after handoff.

## BYOK Providers

BYOK provider settings are allowed only for active users whose tier and feature gate include `custom_model_provider`.

Security controls:

- Provider keys are encrypted with AES-256-GCM using `USER_SECRET_ENCRYPTION_KEY`.
- API responses return only `apiKeyMask`.
- Provider base URLs must be HTTPS and pass SSRF checks for localhost, loopback, private networks, link-local addresses, metadata IPs, unsafe DNS resolutions, credentials, and redirects.
- Do not log decrypted provider keys or raw provider test requests.

## Analytics And Privacy

Commercial validation events are stored in `analytics_events`. Private validation fields such as free text and contact data are stripped before analytics storage.

Allowed analytics examples:

- funnel events
- scenario type
- interaction/deep mode health
- task status and timing
- coarse provider/model cost groups

Disallowed analytics examples:

- raw user prompts
- full chat logs
- provider API keys
- access-code raw values
- passwords or hashes
- user contact details

## Monitoring

Minimum dashboards:

- API: request rate, 4xx/5xx rate, auth failures, commercial task creation failures, latency.
- Worker: heartbeat age, active weight, current task id, task success/failure rate, stuck task count.
- Queue: queued/running/retrying/stuck, oldest queued age, active weight versus max weight.
- Credits: holds without capture/release, refund rate, adjustment count, redemption failures.
- Cost: estimated model cost by provider, model, step, task, and outcome.
- Database: connection count, slow queries, lock waits, disk usage, replication lag, backup age.
- Redis: memory, evictions, command latency, connection count.
- Security: admin login failures, sensitive report views, access-code batch creation/disable/export events.

Alert suggestions:

- Worker heartbeat missing for more than two expected intervals.
- Stuck tasks greater than zero for more than 15 minutes.
- Active weight at max with growing queue age.
- Credit ledger idempotency conflicts above baseline.
- Any production `ENABLE_AGENT_DEBUG_LOGS=true`.
- Backup older than the recovery point objective.

## Backups And Restore

Back up:

- Postgres database, encrypted at rest and in transit.
- Migration files and release SHA.
- Encrypted raw access-code export artifacts while they are still operationally required.
- Deployment environment configuration without plaintext secrets.

Restore procedure:

1. Stop API and worker writes or route traffic to maintenance.
2. Restore Postgres to a staging environment first.
3. Apply forward migrations required by the target release.
4. Verify user counts, ledger totals, task counts, access-code counts, audit logs, and worker heartbeat table shape.
5. Run a commercial smoke test with a non-production user and access code.
6. Promote the restore target only after reconciliation.

Never test restore by dropping production data.

## Release Checklist

Before enabling commercial traffic:

- `cd frontend && npm run lint`
- `cd frontend && npm test`
- `cd frontend && npm run build`
- Apply all migrations.
- Verify commercial env vars and secrets are present.
- Seed at least one owner/admin.
- Confirm legacy simulation routes are blocked in commercial mode.
- Confirm admin routes require admin session.
- Confirm worker processor is wired and heartbeats appear.
- Confirm access-code raw exports are created only from creation payloads.
- Confirm no debug logs or raw prompt tracing are enabled.
- Confirm backups and monitoring alerts are active.

## Troubleshooting

Commercial mode fails on startup:

- Check `COMMERCIAL_MODE_ENABLED=true`.
- Verify `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ACCESS_CODE_PEPPER`, and `USER_SECRET_ENCRYPTION_KEY`.
- Confirm `USER_SECRET_ENCRYPTION_KEY` decodes to 32 bytes.

Users cannot start paid tasks:

- Check session cookie and `/api/me`.
- Check credit balance and frozen credits.
- Verify the task route is `/api/simulation-tasks`, not legacy `/api/simulations`.
- Inspect credit ledger idempotency keys for conflicts.

Credits are frozen too long:

- Find tasks with `queued` or `running` status and existing hold ledger ids.
- Check worker heartbeat and stuck task summary.
- Use admin refund/release flows only after confirming task outcome.

Queue grows without workers:

- Check Redis connectivity.
- Confirm worker process is running and processor wiring is enabled.
- Check `worker_heartbeats` age and `activeWeight`.
- Compare `activeWeight` with `MAX_WEIGHTED_CONCURRENCY`.

Access code cannot redeem:

- Confirm code is active, not disabled, not expired, and not redeemed.
- Confirm `ACCESS_CODE_PEPPER` matches the environment used when codes were created.
- Do not ask users to send screenshots containing raw codes in public support channels.

BYOK provider fails:

- Confirm user tier and `custom_model_provider` feature.
- Confirm provider URL is HTTPS and publicly routable.
- Check SSRF rejection message before assuming provider credentials are bad.
- Rotate `USER_SECRET_ENCRYPTION_KEY` only with a re-encryption migration.

Suspected data leak:

- Disable affected access-code batches or BYOK providers as needed.
- Rotate exposed secrets.
- Preserve audit logs.
- Remove raw exports and debug traces from local machines.
- Notify affected operators/users according to the incident policy.
