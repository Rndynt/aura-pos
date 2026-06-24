# Type Safety Inventory — Inventory Audit

Tanggal: 2026-06-24

Scope batch ini mengikuti area critical runtime yang diminta:

- `packages/application/orders/*`
- `packages/infrastructure/repositories/orders/*`
- `packages/infrastructure/repositories/payments/*`
- `packages/infrastructure/repositories/sync/*`
- `apps/pos-terminal-web/src/features/pos-core/services/*`

## Kelompok Type Escape

### Critical order/payment/sync

Status: partially remediated in this batch.

- `packages/application/orders/mappers/orderLifecycleDtoMapper.ts`
  - Sebelumnya memakai `Record<string, any>` dan item callback `any` untuk lifecycle DTO.
  - Remediasi: memakai shared `OrderLifecycleDto`, `OrderLifecycleDtoFields`, dan `OrderLifecycleLockState` dari `@pos/domain/orders`.
- `packages/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository.ts`
  - Sebelumnya memakai generic column `{ tenantId: any; outletId?: any }` pada tenant/outlet scoped query helper.
  - Remediasi: helper memakai `AnyPgColumn` dan mengembalikan `SQL[]`, menjaga tenant/outlet predicate tetap typed.
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentAmountService.ts`
  - Sebelumnya memakai cast `as any` untuk membaca nomor order camelCase/snake_case.
  - Remediasi: memakai `POSLifecycleOrder` yang berbasis shared `OrderLifecycleDto`.
- `apps/pos-terminal-web/src/features/pos-core/services/posLifecycleService.ts`
  - Sebelumnya memakai cast `as any` untuk remaining amount camelCase/snake_case.
  - Remediasi: memakai field shared DTO `remainingAmount` / `remaining_amount`.
- `apps/pos-terminal-web/src/features/pos-core/services/posPrinterService.ts`
  - Sebelumnya mengirim payload receipt dengan cast `as any`.
  - Remediasi: fungsi print/enqueue memakai `ReceiptPrintPayload`.

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

Status: not changed in this batch.

No tenant/auth/RBAC source files were modified in this batch beyond preserving typed tenant/outlet scoping in sync repository query predicates.

### Frontend DTO normalization

Status: partially remediated in this batch.

- Shared order lifecycle DTO now lives in `packages/domain/orders/dtos.ts`.
- POS lifecycle/payment amount services consume this DTO instead of ad-hoc `as any` casts.
- Shared payment command, selected options, and offline sync payload DTO shells were added for subsequent migrations.

### Tests-only

Status: inventoried, not remediated in this batch.

Remaining tests-only type escapes are currently limited to test data factories/assertions in:

- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/*`
- `packages/application/orders/__tests__/UpdateOrder.lifecycleLocks.test.ts`

These are lower risk than runtime casts, but should be replaced with typed fixtures once runtime DTO migration stabilizes.

### Low-risk UI rendering

Status: not changed in this batch.

This audit batch focused on POS core service runtime and order/payment/sync repository/application code. Broader UI rendering casts outside `apps/pos-terminal-web/src/features/pos-core/services/*` were not audited in this batch.

## Shared DTOs Added

- Order lifecycle DTO and derived lifecycle fields.
- POS payment command DTO.
- Selected options DTO wrapper for order item normalization.
- Offline sync order payload DTO.

## Validation

- `pnpm --filter @pos/domain type-check`
- `pnpm --filter @pos/application type-check`
- `pnpm --filter @pos/infrastructure type-check`
- `pnpm --filter @pos/terminal-web type-check`
- `pnpm --filter @pos/application test`
- `pnpm --filter @pos/terminal-web test`
- `pnpm type-check`

All validation commands above passed on 2026-06-24.

## Next Recommended Batch

Continue with `packages/application/orders/UpdateOrder.ts` and `packages/infrastructure/repositories/orders/KitchenTicketRepository.ts`, because they still contain critical lifecycle/status casts and can be migrated to discriminated status unions with focused tests.
