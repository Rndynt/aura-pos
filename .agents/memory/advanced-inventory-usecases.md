---
name: Advanced inventory use-case architecture
description: Patterns and pitfalls for the advanced stock (opname/transfer) use-case layer added in P1 roadmap.
---

## Rule
Business logic for opname and transfer workflows lives in:
- `packages/application/inventory/opname.ts` — 5 use-case functions
- `packages/application/inventory/transfer.ts` — 4 use-case functions

Routes in `apps/api/src/http/routes/inventory-advanced.ts` are thin: entitlement check + body parse + use-case call.

## Key patterns

### Atomic multi-repo writes
Use `UnitOfWork.transaction(async (ctx) => { ... })` and pass `ctx` to all repo calls within the block. All repos in packages/infrastructure accept `ctx?: TransactionContext` as last parameter.

```ts
await unitOfWork.transaction(async (ctx) => {
  const movement = await movementWriter.record({ ... }, ctx);
  await balanceRepo.setQuantity({ ..., lastMovementId: movement.id }, ctx);
  await opnameRepo.updateStatus(id, tenantId, 'approved', { ... }, ctx);
});
```

### inventoryMovements schema
- No `updatedAt` column — do NOT include it in .values()
- Does have: tenantId, outletId (nullable), productId, movementType, quantityDelta, quantityBefore, quantityAfter, notes, referenceType, referenceId, metadata, actorId, createdAt

### products.stock_qty sync
DrizzleInventoryBalanceRepository.applyDelta() and setQuantity() automatically sync products.stock_qty via internal syncProductStockQty() helper. Routes and use-cases do NOT need to update products.stock_qty separately.

### Transfer tab UI gating
Three-way conditional: `isAdvanced && isMultiLocation` → full tab; `isAdvanced && !isMultiLocation` → locked state (client-side, no API); `!isAdvanced` → upgrade prompt. Lock icon shows on tab button when `!isAdvanced || !isMultiLocation`.

### Error handling
Domain errors (OpnameNotFoundError, TransferStatusError etc.) carry `statusCode` property — the existing Express error handler picks them up correctly without any special mapping.

**Why:** The previous implementation had business logic directly in route handlers using db.transaction() with raw Drizzle calls. The refactor moved this to the application layer while keeping routes thin, consistent with the rest of the codebase (CreateOrder pattern).
