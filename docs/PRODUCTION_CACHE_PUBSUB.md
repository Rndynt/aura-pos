# Production Redis Pub/Sub and Cache Configuration

AuraPoS API instances use Redis for cross-instance pub/sub and shared cache state in production.

## Required production configuration

Set one Redis URL for every API instance in the deployment:

```bash
REDIS_URL=redis://:<password>@redis.example.com:6379/0
```

Equivalent fallbacks are supported for split infrastructure naming:

- `CACHE_REDIS_URL`
- `PUBSUB_REDIS_URL`

`REDIS_URL` takes precedence when multiple values are set.

## What Redis is used for

- Order queue SSE invalidation and refresh events across API instances.
- Customer Facing Display (CFD) WebSocket fan-out across API instances.
- Latest CFD state with TTL, keyed by tenant/outlet/device:
  - `aurapos:cfd:latest:tenant:<tenantId>:outlet:<outletId|global>:device:<deviceId>`
- Tenant resolution cache:
  - `aurapos:cache:tenant:<tenantId-or-slug>`
- Feature/module guard caches:
  - `aurapos:cache:tenant:<tenantId>:feature:<featureCode>`
  - `aurapos:cache:tenant:<tenantId>:module:<moduleKey>`
- Outlet caches:
  - `aurapos:cache:tenant:<tenantId>:outlets:list`
  - `aurapos:cache:tenant:<tenantId>:outlet:<outletId>`
- Instance-safe invalidation events on `aurapos:events:cache_invalidation`.

## Optional environment variables

- `CACHE_KEY_PREFIX` — changes the default `aurapos` Redis key/channel prefix. Use this to isolate staging, review apps, or multiple deployments sharing one Redis database.
- `CFD_STATE_TTL_SECONDS` — TTL for latest CFD state. Default: `43200` seconds (12 hours).
- `REDIS_DISABLED=true` — disables Redis and forces process-local fallback. Do not use this for multi-instance production.

## Production requirements

- Redis must be reachable from all API instances.
- Use TLS Redis URLs when the provider requires them, for example `rediss://...`.
- Protect Redis with authentication and network controls; keys contain tenant IDs and operational state.
- Use a distinct `CACHE_KEY_PREFIX` per environment when sharing Redis.
- Deployments with more than one API instance must not run with Redis disabled. Without Redis, order queue/CFD pubsub and cache invalidation are process-local only.

## Fallback behavior

When Redis is not configured, the API keeps a process-local fallback for local development and tests. This fallback preserves single-instance behavior but is not instance-safe.
