# Sidebar permission loading

Report: sidebar remains blank while dashboard is visible.

Evidence: useUserRole explicitly fetched once and then again on INITIAL_SESSION, called remote getUser on each auth event, loaded profile/overrides/role permissions sequentially, and set loading true for same-user token events. Additional useRoleAccess consumers duplicated authentication/profile/permission reads. No network deadline or visible recovery existed. Sidebar intentionally hides unauthorized/loading modules, so the duplicated loading was previously masked by the unconditional Rutas entry.

Changes: consume SDK INITIAL_SESSION; defer queries outside callback; share concurrent metadata loads by SDK client and user; resolve profile then fetch overrides and raw custom-role permissions in parallel. Granular access consumes these same permissions. Profile dropdown uses session only for display. Backend authorization remains unchanged. Keep verified menu during same-user refresh; clear immediately on identity switch/signout. Bound queries and missing initial event to 8 seconds; show loading/error/retry UI, including resubscription when initial event was missing.

Verification: failing behavioral tests followed by implementation; tests cover concurrent consumers (3 queries, no getUser), custom role permissions, token refresh, signout/late response, errors/retry and missing session deadline. Read-only live test of metadata loading for visitor role: 0.632s, allowed modules [inventory]. This excludes browser/session-bootstrap latency. Independent review identified initial-session retry gap; fixed by bounded resubscription and regression test. No stock, role or database permission changes in this fix.

Final checks: all 19 tests pass and TypeScript passes. Review also identified a timing-dependent test; fixed by awaiting observable permission states instead of fixed sleeps. Local development server remains on port 3000 for visual validation.
