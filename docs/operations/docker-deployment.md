# Docker Compose Deployment

This guide deploys TryItOut on one Linux server with Docker Compose:

- `app`: Express API and built React frontend.
- `worker`: commercial simulation worker.
- `postgres`: durable commercial state.
- `redis`: BullMQ queue state.

The Compose stack is intended for a small VPS or single-node production beta. For larger deployments, split Postgres and Redis into managed services and keep the same app/worker environment variables.

## 1. Prerequisites

- Docker Engine 24+ with Docker Compose v2.
- A domain name and HTTPS reverse proxy for public production use.
- At least one AI provider key: Gemini, Anthropic, or OpenAI-compatible.
- Enough RAM for model-call concurrency. Start with 2 CPU / 4 GB RAM or better.

## 2. Prepare Environment

From the repository root:

```bash
cp deploy/docker.env.example deploy/docker.env
```

Edit `deploy/docker.env` before starting the stack:

```bash
APP_URL="https://your-domain.example"

AI_PROVIDER="gemini"
GEMINI_API_KEY="your-real-key"

POSTGRES_USER="tryitout"
POSTGRES_PASSWORD="replace-with-a-strong-password"
POSTGRES_DB="tryitout"
DATABASE_URL="postgres://tryitout:replace-with-a-strong-password@postgres:5432/tryitout"
REDIS_URL="redis://redis:6379"

SESSION_SECRET="replace-with-output-of-openssl-rand-hex-32"
ACCESS_CODE_PEPPER="replace-with-output-of-openssl-rand-hex-32"
USER_SECRET_ENCRYPTION_KEY="replace-with-output-of-openssl-rand-base64-32"
ADMIN_EMAIL="owner@example.com"
ADMIN_PASSWORD="replace-with-temporary-admin-password"
```

Generate secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Do not commit `deploy/docker.env`. It is ignored by git.

## 3. Build Images

```bash
docker compose build
```

The image builds the Vite frontend, bundles `server.ts`, bundles `worker.ts`, and bundles the admin seed script.

## 4. Start Datastores

```bash
docker compose up -d postgres redis
docker compose ps
```

Postgres and Redis publish local-only ports by default:

- Postgres: `127.0.0.1:5432`
- Redis: `127.0.0.1:6379`

Keep those ports firewalled. The public app port is `8080` unless you change `docker-compose.yml`.

## 5. Apply Database Migrations

Use the current platformized migration chain. Do **not** apply `001_commercial_mvp.sql` to a new Docker deployment; it is an older MVP schema.

Bash:

```bash
for file in \
  frontend/db/migrations/001_platformized_commercial.sql \
  frontend/db/migrations/002_add_simulation_task_model_selection.sql \
  frontend/db/migrations/003_admin_management_overhaul.sql \
  frontend/db/migrations/004_access_code_restore_audit_actions.sql \
  frontend/db/migrations/005_backfill_access_code_redemption_entitlements.sql \
  frontend/db/migrations/006_timed_access_code_entitlements.sql \
  frontend/db/migrations/007_user_model_provider_test_error.sql \
  frontend/db/migrations/008_commercial_simulation_checkpoints.sql
do
  docker compose exec -T postgres psql -U tryitout -d tryitout < "$file"
done
```

PowerShell:

```powershell
$migrations = @(
  "frontend/db/migrations/001_platformized_commercial.sql",
  "frontend/db/migrations/002_add_simulation_task_model_selection.sql",
  "frontend/db/migrations/003_admin_management_overhaul.sql",
  "frontend/db/migrations/004_access_code_restore_audit_actions.sql",
  "frontend/db/migrations/005_backfill_access_code_redemption_entitlements.sql",
  "frontend/db/migrations/006_timed_access_code_entitlements.sql",
  "frontend/db/migrations/007_user_model_provider_test_error.sql",
  "frontend/db/migrations/008_commercial_simulation_checkpoints.sql"
)

foreach ($file in $migrations) {
  Get-Content $file | docker compose exec -T postgres psql -U tryitout -d tryitout
}
```

If you changed `POSTGRES_USER` or `POSTGRES_DB`, adjust `-U` and `-d` accordingly.

## 6. Seed The First Admin

After migrations, create or update the owner account from `deploy/docker.env`:

```bash
docker compose run --rm app npm run seed:admin:dist
```

Change `ADMIN_PASSWORD` after first login or rotate it by re-running the seed command with a new value.

## 7. Start API And Worker

```bash
docker compose up -d app worker
docker compose ps
```

Verify health:

```bash
curl http://localhost:8080/api/health
```

Open:

- App: `http://localhost:8080`
- Admin: `http://localhost:8080/admin`

For production, put a TLS reverse proxy such as Caddy, Nginx, or Traefik in front of `localhost:8080`, then set `APP_URL` to the HTTPS URL.

## 8. Operations

Logs:

```bash
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f postgres redis
```

Restart:

```bash
docker compose restart app worker
```

Stop:

```bash
docker compose down
```

Stop and remove local data volumes:

```bash
docker compose down -v
```

Only use `down -v` for disposable development environments.

## 9. Backups

Create a Postgres dump:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U tryitout -d tryitout > backups/tryitout-$(date +%Y%m%d-%H%M%S).sql
```

Restore to an empty database:

```bash
docker compose exec -T postgres psql -U tryitout -d tryitout < backups/tryitout.sql
```

Redis stores queue state, not the durable source of truth. Back up Postgres first.

## 10. Updates

Pull new code, rebuild, apply any new migrations, then restart:

```bash
git pull
docker compose build
# apply new migration files if present
docker compose up -d app worker
```

Read `frontend/db/README.md` before applying migrations to an existing production database.

## 11. Security Checklist

- Replace every placeholder in `deploy/docker.env`.
- Do not expose Postgres or Redis publicly.
- Serve the app behind HTTPS.
- Keep `ENABLE_AGENT_DEBUG_LOGS=false` outside temporary debugging.
- Back up Postgres before updates.
- Rotate `ADMIN_PASSWORD` after bootstrap.
- Protect `SESSION_SECRET`, `ACCESS_CODE_PEPPER`, `USER_SECRET_ENCRYPTION_KEY`, provider keys, and access-code exports.
- Use `ALLOWED_MODEL_PROVIDER_HOSTNAMES` if BYOK users should be restricted to known provider hosts.

## Troubleshooting

Worker exits immediately:

- Confirm `COMMERCIAL_MODE_ENABLED=true`.
- Confirm `DATABASE_URL`, `REDIS_URL`, and required secrets are set in `deploy/docker.env`.
- Check `docker compose logs worker`.

App starts but paid tasks do not run:

- Confirm `docker compose ps` shows `worker` healthy/running.
- Check Redis logs and worker logs.
- Confirm the user has credits and task creation is using commercial endpoints.

Database errors on startup:

- Confirm migrations were applied in the documented order.
- Do not mix `001_commercial_mvp.sql` with `001_platformized_commercial.sql` on the same database.
