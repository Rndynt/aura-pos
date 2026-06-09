# P5 S1-S3 — Realtime CFD Module Split

Status: planned
Purpose: move CFD/WebSocket/pubsub/session/state logic out of broad route registration.

## Goal

Keep `apps/api/src/routes.ts` focused on route registration and server wiring. Move CFD-specific logic into a dedicated realtime module.

## S1 — Extract CFD module structure

Target structure:

```txt
apps/api/src/realtime/cfd/
  CfdConnectionRegistry.ts
  CfdAuthService.ts
  CfdMessageValidator.ts
  CfdStateStore.ts
  CfdPubSubBridge.ts
  CfdWebSocketServer.ts
  CfdHttpController.ts
  index.ts
```

Responsibilities:

- `CfdConnectionRegistry`: tenant/device connection tracking.
- `CfdAuthService`: device token lookup and session-token behavior.
- `CfdMessageValidator`: payload schema and size guard.
- `CfdStateStore`: latest CFD state persistence/cache.
- `CfdPubSubBridge`: Redis pubsub bridge to local clients.
- `CfdWebSocketServer`: WebSocket lifecycle and heartbeat.
- `CfdHttpController`: HTTP session/update handlers.

## S2 — Keep route compatibility

Public endpoints must remain stable:

```txt
POST /api/cfd/session-token
POST /api/cfd/update
WS   /ws/cfd
```

Existing token/header/query behavior must remain compatible unless explicitly documented.

## S3 — Register module from server composition

After extraction, route/server files should only do high-level registration:

```ts
registerCfdHttpRoutes(app, cfdModule);
registerCfdWebSocketServer(httpServer, cfdModule);
```

## Hard rules

- Do not break Customer Facing Display pairing/session token behavior.
- Do not remove tenant/device mismatch protection.
- Do not remove heartbeat cleanup.
- Do not remove Redis pubsub propagation.
- Do not leak raw API keys into logs.
- Do not mix unrelated order/KDS refactor into this phase.

## Validation commands

```bash
pnpm --filter @pos/api type-check
pnpm --filter @pos/api test
pnpm type-check
```

If CFD tests exist, run them. If not, add a manual smoke checklist:

```txt
1. generate CFD session token
2. connect WS with tenantId and token
3. POST update with valid key
4. verify WS receives payload
5. reject tenant mismatch
6. reject invalid key
```

## Definition of done

- `routes.ts` no longer owns CFD implementation details.
- CFD logic is isolated in `apps/api/src/realtime/cfd`.
- Public CFD endpoints and WS behavior remain stable.

## Execution notes — P5 S1-S3

Status: implemented with documented environment-limited test skip
Commit: a668f45
Date: 2026-06-09

### Affected files

- `apps/api/src/routes.ts`
- `apps/api/src/realtime/cfd/CfdConnectionRegistry.ts`
- `apps/api/src/realtime/cfd/CfdAuthService.ts`
- `apps/api/src/realtime/cfd/CfdMessageValidator.ts`
- `apps/api/src/realtime/cfd/CfdStateStore.ts`
- `apps/api/src/realtime/cfd/CfdPubSubBridge.ts`
- `apps/api/src/realtime/cfd/CfdWebSocketServer.ts`
- `apps/api/src/realtime/cfd/CfdHttpController.ts`
- `apps/api/src/realtime/cfd/index.ts`
- `PLANS.md`
- `roadmap/refactor/p5-s1-s3-realtime-cfd-module-split.md`

### Completed

- [x] Audited current CFD/WebSocket/realtime responsibilities in route/server files.
- [x] Extracted CFD connection registry/auth/message validation/state/pubsub/WS/HTTP responsibilities into `apps/api/src/realtime/cfd`.
- [x] Kept `routes.ts` focused on high-level CFD registration.
- [x] Preserved CFD HTTP endpoint paths and WebSocket path.
- [x] Preserved tenant/device mismatch protection.
- [x] Preserved heartbeat cleanup.
- [x] Preserved Redis/pubsub propagation if configured.
- [x] Did not touch P4 order workflows, payment, inventory, frontend POS, or DB schema.

### Validation results

- `pnpm --filter @pos/api type-check`: pass.
- `pnpm --filter @pos/api exec node --test --import tsx src/__tests__/cfd.test.ts`: pass, 4/4 CFD tests passed.
- `pnpm --filter @pos/api test`: fail due to known DB-backed environment blocker; 194/195 tests passed and `src/__tests__/record-payment-idempotency.test.ts` failed with `[database] DATABASE_URL environment variable is not set. Exiting.`
- `pnpm type-check`: pass, 10/10 Turbo package type-check tasks succeeded.
- Required no-unrelated-order/payment/inventory/schema audit diff: pass, empty diff for `apps/api/src/http/controllers/OrdersController.ts`, `packages/application/orders`, `packages/application/inventory`, `packages/application/sync`, `shared/schema.ts`, and `packages/infrastructure/db`.

### Compatibility

- `POST /api/cfd/session-token`: unchanged.
- `POST /api/cfd/update`: unchanged.
- `WS /ws/cfd`: unchanged.
- Existing `tenantId`, `outletId`, `deviceId`, CFD token, `x-cfd-key`, query token, and WebSocket subprotocol token behavior was preserved.

### Behavior preservation notes

- API contract changed: no.
- DB schema changed: no.
- Cash payment affected: no.
- Partial payment affected: no.
- Offline/KDS/CFD affected: CFD implementation location changed only; public CFD behavior preserved by existing CFD tests.
- Tenant/device mismatch protection: preserved for HTTP update and WebSocket subscribe.
- Heartbeat cleanup: preserved in the extracted `CfdWebSocketServer`.
- Redis/pubsub propagation: preserved through `CfdPubSubBridge` using the existing CFD cache channel and payload shape.
- Secret handling: raw CFD API keys/session tokens are not logged; tokens are hashed before DB lookup/storage.

### Follow-up risks

- The full API test command needs a DB-backed environment with `DATABASE_URL` configured to run `src/__tests__/record-payment-idempotency.test.ts` successfully.
- Do not start P6 until P5 is reviewed and accepted.
