# Environment Variables

This document is the canonical AuraPoS environment variable reference. Keep values environment-specific and never commit real secrets, production passwords, API keys, private tokens, or customer data.

## Audit scope and source of truth

This page was created after auditing:

- `.env.example`
- `README.md`
- `DEPLOYMENT_GUIDE.md`
- `process.env` access under `apps/api`
- Vite/client env access under `apps/pos-terminal-web`
- env access under `apps/web` (no active runtime env access found during this audit)

Notes:

- Server-only variables must not be prefixed with `VITE_`.
- Variables prefixed with `VITE_` are bundled into browser code by Vite and must never contain secrets.
- Some variables below are part of the minimum deployment contract even when current code does not consume them yet. Those are marked as **reserved/not currently enforced by code**.

## Minimum environment variables

| Variable | Scope | Local development | Staging | Production | Notes |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | API/server | `development` | `production` or `staging` per host convention | `production` | Controls production-only behavior in API middleware and auth helpers. |
| `PORT` | API/server | Optional, default `5000` | Required/host-provided | Required/host-provided | API listen port. |
| `DATABASE_URL` | API/server | Required | Required | Required | PostgreSQL connection string. Use local/test credentials in local dev only. |
| `REDIS_URL` | API/server | Optional for one-process dev | Required for multi-instance staging | Required for production | Used for distributed cache/pubsub. Local dev may omit it to use process-local fallback. |
| `BETTER_AUTH_SECRET` | API/server secret | Required placeholder local secret | Required secret | Required secret | Must be a strong random value, at least 32 characters. Rotate per environment. |
| `BETTER_AUTH_URL` | API/server | `http://localhost:5000` | Public staging API/auth URL | Public production API/auth URL | Base URL for better-auth trusted origin/callback behavior. |
| `CORS_ALLOWED_ORIGINS` | API/server | Optional/local origins | Required | Required | Comma-separated browser origins allowed to call the API. **Reserved/not currently enforced by code**; current auth code also uses `EXTRA_TRUSTED_ORIGINS`. |
| `TRUST_PROXY` | API/server | Optional (`false`) | Required behind proxy | Required behind proxy | Set according to platform reverse proxy behavior. **Reserved/not currently enforced by code**. |
| `LOG_LEVEL` | API/server | Optional (`debug`/`info`) | Recommended (`info`) | Recommended (`info`/`warn`) | Runtime log verbosity. **Reserved/not currently enforced by code**. |
| `RATE_LIMIT_STORE` | API/server | Optional (`memory`) | Required (`redis`) when rate limiting is enabled | Required (`redis`) when rate limiting is enabled | Use Redis-backed rate limiting outside single-process dev. **Reserved/not currently enforced by code**. |
| `TERMINAL_TOKEN_SECRET` | API/server secret | Required placeholder local secret before terminal token features are enabled | Required secret | Required secret | Secret for POS terminal/device tokens. **Reserved/not currently enforced by code**. |
| `ENTITLEMENT_SNAPSHOT_SECRET` | API/server secret | Required placeholder local secret before signed entitlement snapshots are enabled | Required secret | Required secret | Secret for signed entitlement snapshots. **Reserved/not currently enforced by code**. |
| `VITE_API_URL` | POS frontend/browser | `http://localhost:5000` | Staging API URL | Production API URL | Browser-visible API base URL; do not put secrets here. |
| `VITE_APP_ENV` | POS frontend/browser | `development` | `staging` | `production` | Browser-visible app environment label. **Reserved/not currently consumed by code**. |

## Local development

Use `.env.example` as the safe local template:

```bash
cp .env.example .env
```

Minimum local values:

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aurapos_dev
BETTER_AUTH_SECRET=local-dev-secret-change-me-at-least-32-chars
BETTER_AUTH_URL=http://localhost:5000
VITE_API_URL=http://localhost:5000
VITE_APP_ENV=development
```

Recommended local behavior:

- Omit `REDIS_URL` for simple one-process development unless you are testing distributed cache/pubsub behavior.
- Use local placeholder secrets only. Never reuse local placeholders in staging or production.
- Use `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000` if/when CORS origin enforcement is wired to this variable.

## Staging

Staging must use separate infrastructure from production:

```dotenv
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://<staging-user>:<staging-password>@<staging-host>:5432/<staging-db>
REDIS_URL=redis://:<staging-password>@<staging-redis-host>:6379/0
BETTER_AUTH_SECRET=<generate-a-unique-staging-secret-at-least-32-chars>
BETTER_AUTH_URL=https://api-staging.example.com
CORS_ALLOWED_ORIGINS=https://pos-staging.example.com,https://admin-staging.example.com
TRUST_PROXY=true
LOG_LEVEL=info
RATE_LIMIT_STORE=redis
TERMINAL_TOKEN_SECRET=<generate-a-unique-staging-terminal-secret>
ENTITLEMENT_SNAPSHOT_SECRET=<generate-a-unique-staging-entitlement-secret>
VITE_API_URL=https://api-staging.example.com
VITE_APP_ENV=staging
```

Staging requirements:

- Use a staging database and Redis instance, not production resources.
- Use staging-only secrets.
- Configure staging frontend origins separately from production.
- Validate migrations, auth callbacks, tenant resolution, cache/pubsub, and POS browser API connectivity before promoting to production.

## Production

Production must use managed secrets and production infrastructure:

```dotenv
NODE_ENV=production
PORT=<provided-by-platform-or-5000>
DATABASE_URL=postgresql://<prod-user>:<prod-password>@<prod-host>:5432/<prod-db>
REDIS_URL=redis://:<prod-password>@<prod-redis-host>:6379/0
BETTER_AUTH_SECRET=<generate-a-unique-production-secret-at-least-32-chars>
BETTER_AUTH_URL=https://api.example.com
CORS_ALLOWED_ORIGINS=https://pos.example.com,https://admin.example.com
TRUST_PROXY=true
LOG_LEVEL=info
RATE_LIMIT_STORE=redis
TERMINAL_TOKEN_SECRET=<generate-a-unique-production-terminal-secret>
ENTITLEMENT_SNAPSHOT_SECRET=<generate-a-unique-production-entitlement-secret>
VITE_API_URL=https://api.example.com
VITE_APP_ENV=production
```

Production requirements:

- Store secrets in the deployment platform secret manager, not in files committed to Git.
- Require Redis for multi-instance API deployments so cache invalidation, CFD state, order queue/pubsub, and related features are instance-safe.
- Use strong, unique secrets per environment and rotate on suspected exposure.
- Keep `VITE_*` values non-secret because they are visible to browser users.
- Restrict browser origins to the actual deployed frontend domains.

## Additional supported API variables

These variables are already referenced by the codebase or existing production docs and may be needed for specific deployments:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `BASE_DOMAIN` | API/server | Main tenant subdomain base. Defaults to `aurapos.my.id`. |
| `REPLIT_DEV_DOMAIN` | API/server | Development domain helper for Replit-like environments. |
| `REPLIT_DOMAINS` | API/server | Additional trusted Replit origins. |
| `EXTRA_TRUSTED_ORIGINS` | API/server | Current code-supported comma-separated extra trusted origins for auth/CORS-like trusted-origin handling. |
| `ALLOW_TENANT_HEADER` | API/server | Allows non-production `x-tenant-id` fallback unless set to `false`; production requires service token. |
| `TENANT_HEADER_SERVICE_TOKEN` | API/server secret | Service token needed for production tenant header fallback. |
| `CACHE_REDIS_URL` | API/server | Redis fallback URL when `REDIS_URL` is unset. |
| `PUBSUB_REDIS_URL` | API/server | Redis fallback URL when `REDIS_URL` and `CACHE_REDIS_URL` are unset. |
| `CACHE_KEY_PREFIX` | API/server | Redis key/channel prefix; default `aurapos`. Set distinct values when sharing Redis. |
| `REDIS_DISABLED` | API/server | `true` forces process-local fallback; development/tests only. |
| `CFD_STATE_TTL_SECONDS` | API/server | TTL for latest customer-facing display state; default 12 hours. |
| `ORDER_QUERY_PLAN_ROWS` | API script | Row count used by order query plan check script. |
| `INVENTORY_SYNC_RETRY_INTERVAL_MS` | API/server | Inventory sync retry job interval. |
| `INVENTORY_SYNC_RETRY_BATCH_SIZE` | API/server | Max pending inventory sync errors per retry tick. |
| `INVENTORY_SYNC_RETRY_MAX_RETRIES` | API/server | Max retry attempts before an inventory sync error is marked failed. |
| `INVENTORY_SYNC_RETRY_DELAY_MS` | API/server | Delay before retrying a failed inventory sync error. |
| `VITE_BASE_DOMAIN` | POS frontend/browser | Browser-visible tenant base domain for subdomain helpers; defaults to `aurapos.my.id`. |

## Secret handling checklist

- [ ] Use placeholders in examples, never real credentials.
- [ ] Keep `.env`, `.env.local`, `.env.production`, and platform export files out of Git.
- [ ] Generate different secrets for local, staging, and production.
- [ ] Rotate `BETTER_AUTH_SECRET`, `TERMINAL_TOKEN_SECRET`, and `ENTITLEMENT_SNAPSHOT_SECRET` if exposed.
- [ ] Treat database URLs and Redis URLs as secrets when they include credentials.
- [ ] Never put secrets in `VITE_*` variables.
