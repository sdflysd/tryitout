# TryItOut Commercial MVP Design

## Context

TryItOut is moving from a local/source-available prototype toward a small paid MVP. The first commercial validation target is 10-30 paid beta users, not broad public traffic. The product will sell paid report generation by access code: users register, redeem a code for generation credits and account benefits, then spend credits to run simulations.

Current repository constraints:

- The project currently runs as a React + Express app with a local Node server.
- Existing simulation tasks and reports are file-backed, which is useful for local development but not enough for commercial operation.
- Current task execution starts background simulations directly from the API process, without queue-level backpressure.
- Current unauthenticated simulation endpoints must become demo-only or be routed through the commercial task service when commercial mode is enabled; otherwise users can bypass credits.
- The repository license is non-commercial source-available. Commercial operation must be handled by the copyright holder or a separate written commercial license.

## Goals

- Let a small paid beta cohort register, redeem access codes, and generate reports.
- Keep model cost and queue pressure controllable even if many users choose deep agent mode.
- Add a real admin foundation for access codes, users, tasks, feedback, traffic, and operating metrics.
- Support account tiers so higher-tier users can configure their own model provider and API key.
- Preserve the existing simulation engine while replacing the commercial-critical storage and execution path.

## Non-Goals

- Full public SaaS scale.
- Automated online payment integration in the first release.
- Complete BI/CRM tooling.
- Multi-tenant white-label operation.
- Direct browser-to-model API calls with user API keys.

## Recommended Approach

Use a Web/API service plus worker queue plus database architecture.

The Web/API service handles pages, authentication, access-code redemption, balance checks, task creation, admin APIs, and status polling. Simulation Workers consume queued jobs and call the existing multi-agent simulation engine. Postgres stores users, credits, access codes, tasks, reports, feedback, analytics events, and admin audit logs. Redis/BullMQ manages task queues, retries, and weighted concurrency.

This is the recommended route over a pure single-process app because credits, user balances, paid tasks, refunds, and admin operations need reliable transactional state. It is also better than building a full operations platform first, because the MVP still needs to validate whether users will pay for reports.

## Architecture

Runtime roles:

- Web/API service: serves the React app and authenticated API endpoints.
- Simulation Worker: executes queued ordinary and deep simulations.
- Postgres: source of truth for accounts, access codes, credits, tasks, reports, feedback, and events.
- Redis/BullMQ: queue, retry, scheduling, and weighted concurrency control.

Commercial mode requirements:

- Postgres and Redis are required for paid beta mode. In-memory stores are allowed only as unit-test fakes or non-commercial local demos.
- The app must fail startup in commercial mode if `DATABASE_URL`, `REDIS_URL`, session secret, access-code pepper, or encryption key are missing.
- Existing local/demo endpoints (`/api/simulations`, `/api/simulations/stream`, and the current file-backed `/api/simulation-tasks`) must be disabled, protected, or explicitly routed through the commercial service while `COMMERCIAL_MODE_ENABLED=true`.
- Frontend task creation must use the commercial authenticated task flow in commercial mode.

Task flow:

1. User logs in.
2. User submits a simulation request.
3. API verifies a server-side session from a secure cookie.
4. API validates account status, feature permissions, and available credits.
5. API creates a task and a pending credit hold in one Postgres transaction.
6. API enqueues the simulation job.
7. Frontend polls task status.
8. Worker claims the job under weighted concurrency limits and runs the simulation with the correct provider configuration.
9. On success, worker saves report and confirms the credit spend idempotently.
10. On failure/cancel/system error, worker marks the task and refunds/releases the held credits idempotently according to policy.

## Accounts

First release authentication uses email + password.

Users have:

- Email.
- Password hash.
- Account status.
- Tier, such as `basic`, `pro`, or `business`.
- Tier expiration.
- Feature flags derived from tier and redeemed access codes.
- Current credit balance.

Passwords must be hashed with a modern password hashing algorithm. Passwords, access-code secrets, and provider API keys must never be stored as plaintext.

Sessions are required for the commercial MVP. Login creates a server-side session row and an HTTP-only, secure, same-site cookie. Credit, task, model-provider, feedback, and admin APIs must use this session. Header-based user impersonation is allowed only inside tests.

## Access Codes

Access codes are both credit vouchers and entitlement vouchers. Admins can create individual or batch codes from the admin dashboard.

Each code can include:

- Total credits.
- Optional tier grant.
- Tier expiration duration or absolute expiration date.
- Feature flags, such as deep mode, custom model provider, or priority queue.
- Code expiration.
- Status: active, redeemed, disabled, expired.
- Channel/source notes.
- Admin creator.

Codes should be long and hard to guess, for example `TIO-XXXX-XXXX-XXXX`. The database stores a hash of the full code. Admin lists only show masked values, such as prefix and suffix.

Redemption rules:

- User must be logged in.
- Code must be active, unexpired, and not already fully redeemed.
- Credits and tier/feature grants are applied transactionally.
- Redemption creates a ledger entry and redemption record.
- Redemption endpoint has rate limiting and abuse detection.

## Credit Model

Use credits as the first paid unit.

Suggested default costs:

- Platform model, ordinary simulation: 1 credit.
- Platform model, deep agent simulation: 3 credits.
- BYOK ordinary simulation: configurable, default 1 credit.
- BYOK deep simulation: configurable, default 2 credits.

The BYOK path should not be fully free by default because the product still pays for servers, queueing, storage, report UX, support, and maintenance.

Credit lifecycle:

- `redeem`: add credits from access code.
- `hold`: reserve credits when a task is created.
- `capture`: confirm spend when a task succeeds.
- `release`: return held credits when a task fails, is cancelled, or cannot start.
- `adjustment`: admin manual change.

All balance changes must be represented in `credit_ledger`. The current balance should be derivable from ledger entries or maintained by transaction-safe account rows plus ledger audit.

Credit operations must be transactional and idempotent. A task can have only one active hold, one capture, and one release/refund path. Worker retries must not double-spend or double-refund credits.

## Account Tiers And BYOK

Higher-tier users can configure custom model providers. This is a BYOK feature: Bring Your Own Key.

Low-tier users can only use the backend-configured platform provider. High-tier users with `custom_model_provider` can configure:

- OpenAI-compatible base URL.
- API key.
- Model names for fast, balanced, and deep profiles.
- Optional provider label.

Security rules:

- API key is submitted to the server only.
- API key is encrypted before database storage.
- API key is never returned to the browser.
- Frontend only shows configured state and a masked suffix.
- Worker decrypts and uses the key at task runtime.
- Base URL must use `https://`.
- First release should use a whitelist or semi-whitelist of known providers to reduce SSRF risk.
- Custom provider test requests should have strict timeout and response-size limits.
- Custom provider requests must reject localhost, private IP ranges, link-local ranges, cloud metadata IPs, non-HTTPS URLs, redirects to blocked hosts, and oversized responses.

If a user provider fails due to authentication, invalid base URL, unsupported model, or timeout, the task should fail with a clear user-facing reason. MVP refund policy should release credits for provider configuration errors to avoid beta-user disputes.

## Queue And Concurrency

Commercial execution should use a queue, not immediate in-request simulation.

Use weighted concurrency instead of fixed ordinary/deep worker counts because most users may prefer deep mode.

Suggested initial configuration:

- `MAX_WEIGHTED_CONCURRENCY=30`.
- Ordinary task weight: 1.
- Deep task weight: 3.
- Single user active task limit: 1.
- Optional daily per-user task limit.
- Optional daily global deep task limit.
- Admin-adjustable concurrency budget.

This allows combinations such as:

- 30 ordinary tasks.
- 10 deep tasks.
- 5 deep tasks plus 15 ordinary tasks.

The goal is not to maximize raw model throughput. It is to keep the product stable, protect model spend, and turn sudden demand into visible queueing rather than failures.

Weighted concurrency must be enforced by the worker/queue layer, not just stored as metadata. Jobs may be enqueued freely, but workers can only claim jobs while the sum of active job weights is within the configured budget.

Task statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `refunded`

Failures should record normalized error codes, such as provider authentication failure, provider rate limit, timeout, invalid user provider config, safety rejection, or internal error.

## Admin Dashboard

Admin dashboard starts as an operations console, not a full CRM.

First release pages:

- Overview: registered users, active users, task count, ordinary/deep ratio, success rate, failure rate, credits consumed, estimated model cost.
- Users: email, registration time, balance, tier, tier expiration, task count, recent activity, disable user, manual credit adjustment.
- Access Codes: generate code, batch generate, set credits/tier/features/expiration/source, disable code, inspect redemption state.
- Tasks And Reports: task status, mode, credits held/spent, error code, retry action, report summary.
- Feedback And Events: report score, text feedback, share-card opens, task failures, deep-mode requests, redemption events.
- System Config: credit cost settings, weighted concurrency budget, provider settings, feature flags.

Every sensitive admin action must create an audit log entry.

Audit logging is part of the paid beta, not a later enhancement. Creating/disabling access codes, changing balances, disabling users, changing system settings, and viewing sensitive reports must create audit records.

## Analytics And Feedback

The MVP needs enough data to answer whether paid usage is working.

Track events:

- Registration.
- Login.
- Access-code redemption.
- Simulation requested.
- Simulation queued.
- Simulation started.
- Simulation completed.
- Simulation failed.
- Deep mode requested.
- Report viewed.
- Share card opened.
- Feedback submitted.
- BYOK provider configured/tested.

Feedback should support:

- Numeric rating.
- Free-text comment.
- Report usefulness.
- Scenario type.
- Linked task/report id.

After a 10-30 user beta, the dashboard should answer:

- Who registered and who actually generated reports?
- Which scenario type is most used?
- What is the deep-mode adoption rate?
- What is the report satisfaction score?
- What is the failure rate?
- How many credits were redeemed, held, spent, and refunded?
- What is estimated model cost per successful report?

## Data Model

Initial Postgres tables:

- `users`
- `user_sessions`
- `user_credit_accounts`
- `credit_ledger`
- `access_codes`
- `access_code_redemptions`
- `user_model_providers`
- `simulation_tasks`
- `simulation_reports`
- `user_feedback`
- `analytics_events`
- `admin_audit_logs`
- `system_settings`

Commercial-critical operations should be transactional:

- Access-code redemption.
- Credit hold.
- Credit capture.
- Credit release/refund.
- Admin balance adjustment.
- Tier grant/expiration update.
- Session creation and revocation.
- Task creation plus credit hold plus queue enqueue intent.

## API Surface

User APIs:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `POST /api/me/change-password`

Credit APIs:

- `GET /api/credits`
- `POST /api/credits/redeem`
- `GET /api/credits/ledger`

Model provider APIs:

- `GET /api/model-providers`
- `POST /api/model-providers`
- `POST /api/model-providers/test`
- `DELETE /api/model-providers/:id`

Simulation APIs:

- `POST /api/simulation-tasks`
- `GET /api/simulation-tasks/:id/status`
- `GET /api/simulation-tasks/:id/report`
- `POST /api/simulation-tasks/:id/cancel`
- `POST /api/simulation-tasks/:id/retry`

Compatibility APIs:

- Existing unauthenticated simulation endpoints stay available only in local demo mode.
- In commercial mode they must return 404/403 or forward to the authenticated commercial task flow with credit checks.
- Tests must cover that commercial mode cannot create a simulation without a valid session and sufficient credits.

Feedback APIs:

- `POST /api/reports/:id/feedback`

Admin APIs:

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/credits`
- `POST /api/admin/users/:id/disable`
- `GET /api/admin/access-codes`
- `POST /api/admin/access-codes`
- `POST /api/admin/access-codes/batch`
- `POST /api/admin/access-codes/:id/disable`
- `GET /api/admin/tasks`
- `GET /api/admin/feedback`
- `GET /api/admin/events`
- `GET /api/admin/audit-logs`
- `GET /api/admin/settings`
- `POST /api/admin/settings`

## Privacy, Security, And Compliance

The product may process sensitive decision contexts: career plans, money situations, relationship messages, family conflict, and personal fears. Commercial MVP must treat these as private data.

Requirements:

- Store API keys only in server-side encrypted form.
- Store password hashes only, never passwords.
- Store access-code hashes only, never raw access codes.
- Use HTTP-only secure same-site cookies for sessions.
- Limit admin report access to authorized admins.
- Record admin audit logs for sensitive actions.
- Do not store full prompt/debug traces by default.
- Add environment-controlled debug trace logging for short diagnostic windows.
- Keep provider API keys in server environment variables or encrypted user provider rows.
- Add privacy policy, user agreement, and clear report disclaimer before paid launch.
- Support account/report deletion requests, even if first handled manually.

The report disclaimer must remain clear: simulation output is for decision support only and is not financial, legal, medical, psychological, career, relationship, or investment advice.

## Rollout Plan

Phase 1: Paid Beta Loop

- Email/password registration and login.
- Server-side sessions.
- Postgres-backed commercial persistence.
- Redis/BullMQ-backed queue with weighted concurrency enforcement.
- Admin access-code creation.
- Access-code redemption.
- Credit balance and ledger.
- Ordinary/deep task credit costs.
- Queue-backed task execution.
- Protection or commercial rerouting for existing unauthenticated simulation endpoints.
- Report retrieval.
- Basic admin users/access-codes/tasks views.
- Admin audit logs for access-code and balance operations.

Acceptance criteria:

- Admin can create a code.
- User can register, redeem the code, and receive credits.
- User cannot start a task without enough credits.
- Starting a task creates a hold and queues work.
- Successful task captures credits and stores report.
- Failed task releases credits.
- Admin can see user, code, task, and ledger records.
- Existing demo endpoints cannot bypass credits in commercial mode.
- Worker retries cannot double-charge or double-refund.

Phase 2: Observability And Operations

- Feedback submission.
- Analytics event database storage.
- Overview dashboard.
- Cost and failure statistics.
- Deep-mode adoption tracking.
- User activity tracking.

Acceptance criteria:

- After a beta cohort, admin can identify usage, satisfaction, cost, and failure patterns.
- Admin can inspect task errors and refund/adjust credits when needed.

Phase 3: Account Tiers And BYOK

- Tier grants from access codes.
- Feature gating.
- Encrypted user model-provider storage.
- Provider test endpoint.
- Worker routing to platform provider or user provider.
- BYOK-specific error messages and credit policies.

Acceptance criteria:

- Basic users can only use platform models.
- Higher-tier users can configure an allowed custom provider.
- Worker uses the user's provider for eligible tasks.
- Invalid provider config fails clearly and releases held credits.

## Testing Strategy

Unit tests:

- Access-code generation, hashing, masking, validation.
- Credit ledger transitions and balance calculations.
- Tier/feature resolution.
- Simulation cost calculation.
- BYOK provider validation.

Integration tests:

- Register -> redeem -> create task -> hold credits.
- Worker success -> capture credits -> save report.
- Worker failure -> release credits.
- Admin batch code generation.
- Admin manual credit adjustment with audit log.
- User provider encrypted storage and masked response.

Load checks:

- Queue behavior with mixed ordinary/deep tasks.
- Weighted concurrency enforcement.
- Status polling under beta traffic.
- Provider timeout/retry behavior.

Security checks:

- Passwords are hashed.
- Access codes are hashed.
- User API keys are encrypted and never returned.
- Admin APIs require admin role.
- Custom provider URL rejects non-HTTPS and blocked hosts.

## Open Decisions

- Final names for credits: "generation credits", "trial credits", or a localized product term.
- Exact tier names and durations.
- Whether BYOK discount should be 1/2 credits or configurable per tier.
- Initial provider whitelist.
- Whether admin dashboard lives in the same React app route or a separate admin bundle.
