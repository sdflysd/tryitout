# Commercial Database

Commercial mode uses Postgres as the source of truth for accounts, sessions,
credits, access codes, tasks, reports, analytics, feedback, settings, and audit
logs. In-memory repositories are only allowed in tests or local non-commercial
demos.

## Migration Order

Run migrations in filename order:

1. `migrations/001_commercial_mvp.sql`

The first migration creates all commercial MVP tables and constraints. Later
migrations must be append-only and must not edit already-applied files.

## Required Environment

Commercial startup must fail if any of these values are missing:

- `COMMERCIAL_MODE_ENABLED=true`
- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `ACCESS_CODE_PEPPER`
- `USER_SECRET_ENCRYPTION_KEY`

Queue and pricing configuration:

- `MAX_WEIGHTED_CONCURRENCY`
- `PLATFORM_LEGACY_CREDIT_COST`
- `PLATFORM_DEEP_CREDIT_COST`
- `BYOK_LEGACY_CREDIT_COST`
- `BYOK_DEEP_CREDIT_COST`

## Local Postgres

One simple local container:

```bash
docker run --name tryitout-postgres \
  -e POSTGRES_USER=tryitout \
  -e POSTGRES_PASSWORD=tryitout \
  -e POSTGRES_DB=tryitout \
  -p 5432:5432 \
  -d postgres:16
```

Use:

```bash
DATABASE_URL=postgres://tryitout:tryitout@localhost:5432/tryitout
```

Apply migrations with your preferred Postgres client:

```bash
psql "$DATABASE_URL" -f db/migrations/001_commercial_mvp.sql
```

## Reset Local Commercial DB

For local development only:

```bash
dropdb tryitout
createdb tryitout
psql "$DATABASE_URL" -f db/migrations/001_commercial_mvp.sql
```

Do not run destructive reset commands against shared or production databases.

## Commercial Mode Rule

When `COMMERCIAL_MODE_ENABLED=true`, the app must connect to real Postgres and
Redis-backed services. The in-memory commercial repository exists for unit tests
and local non-commercial demos only; it must not be used for paid task creation,
credit holds, settlement, analytics, or audit logs.
