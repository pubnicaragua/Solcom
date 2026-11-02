# Inventory KPIs and Rutas access

Reported: KPI cards stay at `...` after searching; visitor sees Rutas.

Evidence: tests reproduced that KPIGrid with no base pivot data never resolves while the filtered pivot loads, and canAccessPath('/rutas/centro', visitor) returned true. Sidebar explicitly exempted Rutas. Database confirms visitor custom role VISUAL DE EXISTENCIA and inventory-only user module overrides; its role is not operator as older AGENTS documentation suggested.

Fix: preserve reuse of unfiltered pivot data; only when filters/family mode can interrupt that request and there is no summary, fetch existing scoped KPI endpoint independently. Abort on cleanup, stop indefinite placeholders on timeout/error, retain loaded data. Register Rutas in module definitions and remove Sidebar bypass so default admin/explicit module access is required, including middleware path checks. No permission or inventory data is changed.

- [x] Write/run failing tests for filtered-first summary load, API failure, protected direct Rutas URLs.
- [x] Implement; normal pivot loads make no duplicate KPI request.
- [x] Run tests and TypeScript.
- [x] Independent review; no critical/important findings. Local server restarted in development mode on port 3000; login HTTP 200.
- [x] Added cancellation/late-response and explicit zero-duplicate-request checks after review. All 11 tests pass; TypeScript passes.

Run `npm test` for all tests. Test renderer and tsx are dev dependencies only.
