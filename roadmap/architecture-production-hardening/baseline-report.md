# Baseline Report

Tanggal: 2026-06-23
Commit: `ccf454471ac43ea89d3440cdc489d05aaadedba4`
Branch: `work`

## Commands

- `pnpm install`: PASS — completed in 2.2s with pnpm v10.26.1. Warning: pnpm ignored build scripts for `esbuild@0.18.20`, `esbuild@0.21.5`, `esbuild@0.25.12`, and `esbuild@0.28.0`; no install failure was reported.
- `pnpm type-check`: PASS — Turbo completed 10/10 package type-check tasks successfully in 56.429s.
- `pnpm build`: PASS — Turbo completed 3/3 build tasks successfully in 47.135s, then `build:static:api` completed. Warnings observed: PostCSS plugin missing `from` option; Vite reported `apps/pos-terminal-web` main chunk larger than 500 kB after minification.
- `pnpm test`: PASS — Turbo completed 4/4 package test tasks successfully in 1m2.291s.

## Existing Failures

- None observed from the required baseline commands in this run.
- Existing non-failing warnings to track:
  - `pnpm install` ignored esbuild dependency build scripts until explicitly approved with `pnpm approve-builds`.
  - `pnpm build` emitted a PostCSS `from` option warning.
  - `pnpm build` emitted a Vite chunk-size warning for `apps/pos-terminal-web` because `assets/index-Csy42tqq.js` was 795.94 kB minified / 233.26 kB gzip.

## Package Test Coverage Map

- `apps/api`: Covered by root `pnpm test`; package script `tsx --test src/__tests__/**/*.test.ts`; observed 189 passing API tests across 34 suites.
- `apps/pos-terminal-web`: Covered by root `pnpm test`; package script runs POS core service and POS flow policy tests under `src/features/**/__tests__`; observed all listed terminal-web tests passing.
- `apps/web`: No package-level `test` script found; not executed by root `pnpm test`.
- `packages/application`: Covered by root `pnpm test`; package script runs order lifecycle, business-flow, order action, payment-flow, and POS payment submission tests; observed the listed application tests passing.
- `packages/offline`: Covered by root `pnpm test`; package script `node --import tsx --test src/__tests__/*.test.ts`; observed 2 passing offline tests.
- `packages/domain`: No package-level `test` script found; type-check covered by root `pnpm type-check`.
- `packages/infrastructure`: No package-level `test` script found; type-check covered by root `pnpm type-check`.
- `packages/core`: No package-level `test` script found; type-check covered by root `pnpm type-check`.
- `packages/features`: No package-level `test` script found; type-check covered by root `pnpm type-check`.
- `shared`: No package-level `test` script found; type-check covered by root `pnpm type-check`.

## High Risk Files

- `apps/api/src/index.ts`
- `apps/api/src/container.ts`
- `apps/api/src/http/controllers/OrdersController.ts`
- `apps/api/src/http/controllers/SyncController.ts`
- `packages/offline/src/localOrderService.ts`
- `packages/offline/src/outbox.ts`
- `packages/offline/src/syncEngine.ts`
- `apps/pos-terminal-web/src/App.tsx`
- `apps/pos-terminal-web/src/components/pos/OrderTypeSelectionDialog.tsx`
- `apps/pos-terminal-web/src/components/pos/OrderQueuePanel.tsx`

## Notes

- This baseline commit intentionally does not change application source code.
- No required command failure was fixed or masked; the command results above are recorded as observed.
