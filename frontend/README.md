# TryItOut Frontend

This folder contains the React app, Express server, AI gateway, simulation engine, and tests for TryItOut.

For product context, screenshots, and repository-level setup, see the root [`README.md`](../README.md).

Chinese documentation is available at [`README.zh-CN.md`](../README.zh-CN.md). Current versions of this repository use a non-commercial source license; commercial use requires separate written authorization.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Set at least one provider key in `.env` before running real simulations:

```bash
AI_PROVIDER="gemini"
GEMINI_API_KEY="your_api_key"
```

Supported provider modes:

- `gemini`
- `anthropic`
- `openai_compatible`

## Scripts

```bash
npm run dev      # Start the local app server
npm run worker   # Start the commercial worker entrypoint
npm run lint     # Type-check
npm test         # Run tests
npm run build    # Build frontend, server, worker, and admin seed bundle
npm start        # Run built server
npm run start:worker          # Run built worker
npm run seed:admin             # Seed an owner/admin in commercial mode
npm run seed:admin:dist        # Seed admin from the built Docker/runtime bundle
npm run export:access-codes    # Safely export creation-time raw access codes
```

## Commercial Operations

Commercial mode is enabled with `COMMERCIAL_MODE_ENABLED=true` and requires Postgres, Redis, session/access-code secrets, and a base64 32-byte `USER_SECRET_ENCRYPTION_KEY`.

Read the production runbook before deploying paid usage: [`docs/operations/commercial-platform-runbook.md`](../docs/operations/commercial-platform-runbook.md).

For a single-server Docker Compose deployment with Postgres, Redis, API, and worker, see [`docs/operations/docker-deployment.md`](../docs/operations/docker-deployment.md).

## Agent Runtime

The default runtime uses the faster staged simulation path. To enable deep agent interactions, configure a provider key and set:

```bash
ENABLE_AGENT_INTERACTION_MODE="true"
```

Deep mode makes extra AI calls for world events, agent actions, votes, arbitration, and memory. It can take longer and cost more than the default path.

## Commercial MVP Mode

Commercial mode is the paid path. It requires real backing services and must not use in-memory repositories for accounts, credits, tasks, analytics, feedback, or audit logs.

Enable commercial mode:

```bash
COMMERCIAL_MODE_ENABLED="true"
```

Required services and secrets:

```bash
DATABASE_URL="postgres://tryitout:tryitout@localhost:5432/tryitout"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="long-random-secret"
ACCESS_CODE_PEPPER="long-random-pepper"
USER_SECRET_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Commercial startup fails clearly when required env vars are missing. Run database migrations from `db/migrations/` in filename order; see [`db/README.md`](db/README.md).

Commercial task creation requires a server-side session, sufficient credits, and an access-code credit balance. When `COMMERCIAL_MODE_ENABLED=true`, unauthenticated legacy simulation entry points are rejected or routed through commercial task handlers so credits cannot be bypassed.

Queue and pricing controls:

```bash
MAX_WEIGHTED_CONCURRENCY="6"
PLATFORM_LEGACY_CREDIT_COST="1"
PLATFORM_DEEP_CREDIT_COST="3"
BYOK_LEGACY_CREDIT_COST="1"
BYOK_DEEP_CREDIT_COST="2"
```

BYOK custom model providers are available only to users with the `custom_model_provider` entitlement. User API keys are AES-GCM encrypted with `USER_SECRET_ENCRYPTION_KEY`; provider URLs must be HTTPS, explicitly allowed, and must not target localhost, private networks, link-local ranges, metadata IPs, or unsafe redirects.

## Safety

Do not commit `.env`, debug traces, local logs, generated model output, or raw user inputs. See the root `SECURITY.md` for details.
