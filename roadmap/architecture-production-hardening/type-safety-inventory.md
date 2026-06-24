# Type Safety Inventory — Runtime Any Audit

Tanggal: 2026-06-24

Scope audit mengikuti area critical runtime yang diminta:

- `packages/infrastructure/repositories/orders/*`
- `packages/infrastructure/repositories/payments/*`
- `packages/infrastructure/repositories/sync/*`
- `packages/application/orders/*`
- `apps/pos-terminal-web/src/features/pos-core/services/*`
- `apps/pos-terminal-web/src/features/pos-flows/*`

## Kelompok Type Escape

### Critical order/payment/sync

Status: partially remediated.

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

Remediasi batch ini:

- `apps/pos-terminal-web/src/features/pos-core/mappers/orderToCart.ts`
  - Menambahkan typed POS mapper untuk order mutation result, active order display summary, restaurant active-order predicate, local draft item guard, dan product image hydration.
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
  - Menghapus runtime `as any` untuk product hydration, create-order identity extraction, payment submit dependency, local draft resume, dan open orders normalization.
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
  - Menghapus runtime `as any` untuk product hydration, saved-order update amount/order-number extraction, payment submit dependency, payment details, dan local draft resume.
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantOrderLifecyclePanel.tsx`
  - Menghapus `as any` render reads dengan shared active-order predicate dan display summary mapper.

Remaining critical order/payment/sync escapes to address in later batches:

- `packages/application/orders/CreateOrder.ts`
- `packages/application/orders/CreateKitchenTicket.ts`
- `packages/application/orders/UpdateOrder.ts`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `packages/application/orders/services/*`
- `packages/infrastructure/repositories/orders/OrderRepository.ts`
- `packages/infrastructure/repositories/orders/KitchenTicketRepository.ts`
- `packages/infrastructure/repositories/orders/orderNumberSequence.ts`

### Tenant/auth/RBAC

Status: inventoried, not changed in this batch.

No tenant/auth/RBAC source files were modified in this batch. POS flow changes preserve existing tenant source from `useTenant()` and do not add tenant headers or hardcoded tenant IDs.

### Frontend API DTO normalization

Status: partially remediated.

- Shared order lifecycle DTO lives in `packages/domain/orders/dtos.ts`.
- Shared payment command, selected options, and offline sync payload DTO shells are available for continued migration.
- POS frontend flow mappers now centralize:
  - order lifecycle display summary normalization,
  - active restaurant order filtering,
  - create/update order identity and total extraction,
  - local draft item runtime narrowing before cart resume.

### Offline cache serialization

Status: partially remediated.

- Local draft resume now accepts `LocalDraftOrder` from `@pos/offline` and narrows `unknown[]` items through `getLocalDraftItems()` before adding them back to cart.
- Remaining offline sync payload serialization casts should be audited in `packages/infrastructure/repositories/sync/*` and offline outbox code in a later batch.

### Tests-only

Status: inventoried, not remediated in this batch.

Remaining tests-only type escapes are currently limited to test data factories/assertions in:

- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/*`
- `packages/application/orders/__tests__/UpdateOrder.lifecycleLocks.test.ts`
- `packages/application/orders/__tests__/UpdateOrder.pricing.test.ts`

These are lower risk than runtime casts, but should be replaced with typed fixtures once runtime DTO migration stabilizes.

## Shared DTO/Mapper Status

- Order lifecycle DTO: implemented in `packages/domain/orders/dtos.ts`.
- Payment command DTO: implemented in `packages/domain/orders/dtos.ts` and `packages/domain/payments/PaymentCommand.ts`.
- Selected options DTO wrapper: implemented in `packages/domain/orders/dtos.ts`.
- Offline sync order payload DTO: implemented in `packages/domain/orders/dtos.ts`.
- POS frontend order lifecycle/payment/local-draft mappers: implemented in `apps/pos-terminal-web/src/features/pos-core/mappers/orderToCart.ts`.

## Validation

- `pnpm --filter @pos/terminal-web type-check` — passed on 2026-06-24 after POS flow mapper batch.
- `pnpm type-check` — passed on 2026-06-24 after POS flow mapper batch.

## Next Recommended Batch

Continue with runtime backend critical files in this order:

1. `packages/application/orders/UpdateOrder.ts` — lifecycle lock/status casts affect order edit safety.
2. `packages/infrastructure/repositories/orders/KitchenTicketRepository.ts` — kitchen ticket status casts affect fulfillment runtime state.
3. `packages/infrastructure/repositories/orders/OrderRepository.ts` — order/payment status casts and repository return `any` affect the highest-volume order persistence path.
