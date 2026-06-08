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
