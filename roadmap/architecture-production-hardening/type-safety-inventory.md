# Type Safety Inventory — Runtime Type Escape Audit

Tanggal: 2026-06-24

Scope audit batch ini mengikuti area yang diminta:

- POS core runtime: `apps/pos-terminal-web/src/features/pos-core/**`
- POS flow runtime: `apps/pos-terminal-web/src/features/pos-flows/**`
- Order/payment application runtime: `packages/application/orders/**`
- Boundary/lint guard: `scripts/validate-boundaries.ts`

> Status P5: **belum complete**. POS core runtime tidak memiliki `@ts-nocheck`, tetapi P5 tetap tidak ditandai selesai karena critical runtime order/payment/sync masih memiliki type escape yang perlu dibersihkan pada batch berikutnya.

## Kelompok Type Escape

### 1. Critical runtime order/payment/sync

Status: **partially remediated; P5 remains open**.

Remediasi sebelumnya yang masih berlaku:

- `packages/application/orders/mappers/orderLifecycleDtoMapper.ts`
  - Memakai shared `OrderLifecycleDto`, `OrderLifecycleDtoFields`, dan `OrderLifecycleLockState` dari `@pos/domain/orders` untuk lifecycle DTO.
- `packages/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository.ts`
  - Helper tenant/outlet scoped query memakai `AnyPgColumn` dan mengembalikan `SQL[]`.
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentAmountService.ts`
  - Membaca amount dan order number melalui `POSLifecycleOrder` berbasis shared `OrderLifecycleDto`.
- `apps/pos-terminal-web/src/features/pos-core/services/posLifecycleService.ts`
  - Membaca remaining amount camelCase/snake_case melalui shared DTO.
- `apps/pos-terminal-web/src/features/pos-core/services/posPrinterService.ts`
  - Fungsi print/enqueue memakai `ReceiptPrintPayload`.
- POS flow mapper batch sebelumnya menambahkan typed mapper untuk order mutation result, active order display summary, restaurant active-order predicate, local draft item guard, dan product image hydration.

Remediasi batch 2026-06-24:

- `packages/application/orders/UpdateOrder.ts`
  - Menghapus runtime `as any` untuk lifecycle edit lock fallback, order status, payment status, dan coded error propagation.
  - Menambahkan `PersistedOrderForEdit` compatibility type agar camelCase/snake_case repository rows tetap dibaca eksplisit.
  - Mengganti `Record<string, any>` untuk update payload dengan `UpdateOrderPersistenceData`.
- `packages/application/orders/CreateKitchenTicket.ts`
  - Mengganti repository/order/ticket `any` dengan `Order`, `OrderItem`, `KitchenTicketDraft`, dan `PersistedKitchenTicketResult`.
  - Menjaga tenant ownership check eksplisit via compatibility type `PersistedOrderForKitchenTicket`.
- `packages/application/orders/CreateAndPayOrder.ts`
  - Mengganti output `order`, `payment`, dan `inventory_sync_error` dari `any` menjadi `PersistedOrderResult`, `PersistedPaymentResult`, dan `unknown`.
- `packages/application/orders/RecordPayment.ts`
  - Mengganti output `order` dan `payment` dari `any` menjadi shared persisted result DTO dari create-and-pay flow.
- `packages/infrastructure/repositories/orders/DrizzleRecordPaymentRepository.ts`
  - Menambahkan guard ketika `UPDATE ... RETURNING` tidak mengembalikan order, sehingga output `RecordPaymentOutput.order` tidak lagi bertipe optional.

Remaining critical runtime escapes untuk batch berikutnya:

- `packages/application/orders/CreateOrder.ts`
- `packages/application/orders/CancelOrder.ts`
- `packages/application/orders/ConfirmOrder.ts`
- `packages/application/orders/CompleteOrder.ts`
- `packages/application/orders/TransitionOrderStatus.ts`
- `packages/application/orders/TransitionOrderFulfillmentStatus.ts`
- `packages/application/orders/services/CancelOrderWorkflow.ts`
- `packages/application/orders/services/orderInventoryWorkflow.ts`
- `packages/infrastructure/repositories/orders/OrderRepository.ts`
- `packages/infrastructure/repositories/orders/KitchenTicketRepository.ts`
- `packages/infrastructure/repositories/orders/orderNumberSequence.ts`
- `packages/infrastructure/repositories/sync/*`

### 2. Tenant/auth/RBAC

Status: **inventoried, not remediated in this batch**.

- No tenant/auth/RBAC source files were modified in this batch.
- `CreateKitchenTicket` keeps an explicit tenant ownership check before generating a ticket.
- `UpdateOrder` still relies on tenant-scoped `findById(input.order_id, input.tenant_id)` and tenant-scoped `updateWithItems`.
- Remaining tenant/auth/RBAC type escapes outside this batch include API auth/KDS helper row casts and entitlement DB adapter typing; they should be handled separately from order/payment runtime cleanup.

### 3. POS frontend order/cart/payment

Status: **partially remediated from prior POS mapper batch; no new runtime POS escape added in this batch**.

- POS core runtime files currently have no `@ts-nocheck`.
- Remaining POS core escapes in this inventory are tests-only fixtures/assertions under `apps/pos-terminal-web/src/features/pos-core/services/__tests__/*`.
- Broader POS pages outside the core/flow scope still contain low-to-medium risk display/API normalization casts and should be inventoried in a later frontend batch.

### 4. Offline cache/sync

Status: **partially remediated; runtime sync repository still pending**.

- Local draft resume was already narrowed through `getLocalDraftItems()` in prior POS flow work.
- Remaining sync/offline type escapes should be addressed in:
  - `packages/infrastructure/repositories/sync/*`
  - offline outbox/cache serialization modules
  - API sync controller payload boundaries

### 5. Tests-only

Status: **inventoried, not remediated in this batch**.

Remaining tests-only type escapes are currently in:

- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/*`
- `packages/application/orders/__tests__/UpdateOrder.lifecycleLocks.test.ts`
- `packages/application/orders/__tests__/UpdateOrder.pricing.test.ts`

These are lower risk than runtime casts, but they should be replaced with typed fixtures/builders after runtime DTO migration stabilizes.

### 6. Low-risk display only

Status: **inventoried, not remediated in this batch**.

Examples outside the critical POS core/order application scope include display normalization and browser API compatibility casts in POS pages such as orders, dashboard, reports, KDS, printer/browser integration, and product-management UI. These should not block critical runtime cleanup, but new display-only escapes should still be avoided unless they are isolated and documented.

## Boundary/Lint Guard

Implemented in `scripts/validate-boundaries.ts` as **Rule 8 — Type escape regression guard**.

The guard intentionally uses a scoped baseline rather than zero-any enforcement because the repository still has known existing escapes. It fails if these baselines grow:

- Runtime scoped baseline: max `27` escapes across:
  - `apps/pos-terminal-web/src/features/pos-core`
  - `apps/pos-terminal-web/src/features/pos-flows`
  - `packages/application/orders`
  - excluding tests
- Total scoped baseline: max `42` escapes across the same directories, including tests.

This prevents new type escapes in the critical scoped area while allowing continued batch-by-batch remediation. The baseline must be lowered whenever a future cleanup removes more escapes.

## Shared DTO/Mapper Status

- Order lifecycle DTO: implemented in `packages/domain/orders/dtos.ts`.
- Payment command DTO: implemented in `packages/domain/orders/dtos.ts` and `packages/domain/payments/PaymentCommand.ts`.
- Selected options DTO wrapper: implemented in `packages/domain/orders/dtos.ts`.
- Offline sync order payload DTO: implemented in `packages/domain/orders/dtos.ts`.
- POS frontend order lifecycle/payment/local-draft mappers: implemented in `apps/pos-terminal-web/src/features/pos-core/mappers/orderToCart.ts`.
- Application persisted payment/order result DTOs: introduced in `packages/application/orders/CreateAndPayOrder.ts` for payment repository outputs that may still be camelCase DB rows before final mapper normalization.

## Validation

- `pnpm type-check` — failed during intermediate cleanup because stricter application output types exposed infrastructure/API row-shape mismatches; fixed in the same batch.
- `pnpm type-check` — passed on 2026-06-24 after the first order/payment application cleanup batch.
- `pnpm check:boundaries` — initially failed until the scoped baseline was calibrated to current post-cleanup counts; passed on 2026-06-24 with Rule 8 enabled.

## Next Recommended Batch

Continue with runtime backend critical files in this order:

1. `packages/application/orders/CreateOrder.ts` — idempotency replay still maps `any` items and existing order rows.
2. `packages/application/orders/CancelOrder.ts`, `ConfirmOrder.ts`, `CompleteOrder.ts`, and transition use cases — replace repository `any` ports with domain/application contracts.
3. `packages/application/orders/services/*` — type cancellation/inventory workflow rows and error narrowing.
4. `packages/infrastructure/repositories/orders/OrderRepository.ts` and `KitchenTicketRepository.ts` — normalize DB row DTOs so application ports can return stable domain/application result types.
5. Lower the Rule 8 baselines after each successful cleanup batch.
