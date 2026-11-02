# Pivot performance implementation plan

Goal: reduce stock-fetch latency while retaining live refreshes.
Spec: ../specs/2026-11-02-pivot-performance-design.md

- [x] Add failing behavioral tests for nested balance loading (scope, >1000 child rows, bounded concurrency, errors) and refresh queue (coalescing, running request, disposal).
- [x] Implement `src/lib/inventory/pivot-balances.ts`, wire into the existing API, preserve snapshot fallback.
- [x] Implement `src/lib/inventory/refresh-queue.ts`; wire existing Realtime callbacks without cancelling running requests; invalidate caches and clean up on unmount.
- [x] Run tests, TypeScript, build; benchmark and compare balance maps against Supabase in read-only mode.

Constraints: no schema mutations, no service-role use in app, no Realtime/publication changes, no deployment. Check empty lists, restricted warehouses, live filter changes, errors, teardown.

Live benchmark (same JS client, read-only): 2,290 deduplicated products, 47,859 balances, 21 warehouses. Old 55 queries/16.502s; new 10 queries/1.695s (89.7% reduction). All pairs including zero/negative values match; restricted single-warehouse scope matches. Five tests, TypeScript and production build pass. Independent review found no critical/important issues.

Local built-server smoke: anonymous inventory API returns 401; /login-clientes returns 200. Authenticated browser/API smoke remains pending: documented development admin credentials returned Auth HTTP 400. No session was created and no stock mutations were made. Live Realtime stock changes must still be checked with a valid session after local review/deployment.

Realtime follow-up: the live 1→2→1 test produced no events. PostgreSQL inspection found inventory_balance absent from supabase_realtime (items and stock_snapshots already present). Added idempotent migration supabase/migrations/20261102214837_enable_inventory_balance_realtime.sql and applied publication membership to the production database, preserving existing grants/RLS and other publication members. Stock changes only use TEST-01/X1 and are conditionally restored. Post-fix live test passed: anonymous-key observer received [20, 1], refresh queue fetched [20, 1] through the actual pivot balance loader, and final read confirmed original quantity/source/source_ts restored. Browser rendering remains for the human observer to confirm.
