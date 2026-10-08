# Solcom Global Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved Solcom reference style across the application with persistent light/dark themes and Inventory-only KPI hover details.

**Architecture:** A root client provider owns the `dark | light` theme, persists it in `localStorage`, and exposes a toggle to the shared Topbar. Semantic CSS variables feed the global shell, common UI components, and page surfaces; Inventory receives focused KPI and pivot-table styling while existing data and behavior remain intact.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Vanilla CSS, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-08-solcom-global-theme-redesign-design.md`

## Global Constraints

- El modo oscuro será el inicial, acorde con la referencia y el tema actual.
- La selección se guardará localmente en el navegador y se conservará al navegar y recargar.
- El cambio será local: sin push, despliegue, cambios de base de datos, migraciones ni dependencias nuevas.
- En Inventario se rediseñarán las tarjetas KPI y la tabla pivote, conservando métricas, datos, filtros, virtualización, selección de colores por bodega y comportamiento existente.
- Se conservarán los colores semánticos de estados, alertas, roles y bodegas cuando identifiquen información.
- No alterar autenticación, permisos, rutas, integraciones Zoho, exportaciones ni datos de negocio.

## Review Focus

- Storage bloqueado, vacío o con valor desconocido: la aplicación debe iniciar en oscuro sin fallar.
- Tema claro guardado antes de render: la página y el control del Topbar deben quedar sincronizados sin un destello oscuro.
- Perfil con alcance limitado de bodegas: los tooltips describen el alcance del KPI sin sugerir que el número es global.
- Colores de bodegas y celdas que representan existencias: conservan semántica y contraste en ambos temas.
- Navegación móvil, uso de teclado y `prefers-reduced-motion`: el shell y los tooltips siguen utilizables.

---

### Task 1: Global theme state and semantic tokens

**Files:**
- Create: `src/contexts/ThemeContext.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Produces: `Theme = 'dark' | 'light'`
- Produces: `useTheme(): { theme: Theme; toggleTheme: () => void }`
- Storage key: `solcom-theme`
- Root selector: `data-theme="dark|light"`

- [ ] Add `ThemeProvider` and `useTheme` to `src/contexts/ThemeContext.tsx`; persist each toggle and fall back to dark for missing or invalid storage values.
- [ ] Add a pre-render theme bootstrap in the root layout, set `suppressHydrationWarning` on `<html>`, and wrap the application with `ThemeProvider`.
- [ ] Define dark and light values for the semantic background, panel, card, elevated surface, hover, border, text, muted text, controls, focus, overlay, and shadow tokens in `globals.css`.
- [ ] Keep existing brand and status tokens available, and set browser `color-scheme` to match native form controls.
- [ ] Manually inspect server/client initial values and ensure the existing Notification provider remains under the root tree.

### Task 2: Global Sidebar, Topbar, and shared UI

**Files:**
- Modify: `src/components/dashboard/Sidebar.tsx`
- Modify: `src/components/dashboard/Topbar.tsx`
- Modify: `src/components/dashboard/UserProfileDropdown.tsx`
- Modify: `src/components/dashboard/NotificationsDropdown.tsx`
- Modify: `src/components/ui/Card.tsx`
- Modify: `src/components/ui/Table.tsx`
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Input.tsx`
- Modify: `src/components/ui/Select.tsx`
- Modify: `src/components/ui/Badge.tsx`

**Interfaces:**
- Consumes: `useTheme()` from Task 1.
- Produces: one accessible theme toggle in the shared Topbar.
- Preserves: existing permission checks, navigation, dropdown actions, and component props behavior.

- [ ] Replace fixed neutral shell colors with semantic tokens; retain Solis red for active navigation and brand actions.
- [ ] Add the Topbar theme control with a visible icon, Spanish accessible label, and keyboard focus treatment.
- [ ] Migrate default shared component surfaces, text, borders, inputs, table rows, dropdowns, and menus to semantic tokens while retaining caller overrides.
- [ ] Add focus-visible and reduced-motion behavior to shell and shared interactive elements.
- [ ] Manually review collapsed/mobile Sidebar, notifications, and profile dropdown styles in both token sets.

### Task 3: App-wide surface color migration

**Files:**
- Modify: theme-dependent page and component files under `src/app/**` and `src/components/**` that set fixed neutral background, text, border, or shadow colors.
- Exclude: warehouse palette values, status/alert/role colors, chart series, map-provider styles, and deliberate brand colors.

**Interfaces:**
- Consumes: semantic tokens from Task 1.
- Produces: page surfaces that respond to `data-theme` across dashboard, authentication, client portal, and tracking routes.

- [ ] Search the application and component trees for fixed neutral surface/text colors; group results by shared visual responsibility before editing.
- [ ] Replace only theme-dependent neutral values with semantic tokens; preserve explicit semantic and data-encoding colors.
- [ ] Check conditional styles and gradients as well as direct hex colors so both modes update consistently.
- [ ] Manually inspect representative dashboard, login, client portal, modal, and tracking surfaces for remaining fixed dark/light neutrals.

### Task 4: Inventory KPI interaction and pivot-table styling

**Files:**
- Modify: `src/components/dashboard/KPIGrid.tsx`
- Modify: `src/components/dashboard/PivotInventoryTable.tsx`
- Modify: `src/components/dashboard/InventoryFilters.tsx`
- Modify: `src/components/dashboard/InventoryTable.tsx`
- Modify: `src/app/(dashboard)/inventory/page.tsx`
- Modify if required for keyboard semantics: `src/components/ui/Card.tsx`

**Interfaces:**
- Consumes: theme tokens from Task 1 and shared UI styles from Task 2.
- KPI tooltip copy:
  - `Total SKUs`: unique SKU count within the profile's warehouse scope.
  - `Total Productos`: product count within the profile's warehouse scope.
  - `Bodegas Activas`: active warehouse count within the profile's scope.
  - `Total Stock`: sum of stock within the profile's warehouse scope.
- Produces: hover/focus tooltips for the four listed KPIs; KPI cards stay read-only.

- [ ] Replace the current mouse-only inline card effect with token-based hover and `:focus-visible` styling; remove pointer cursor from read-only cards.
- [ ] Add concise Spanish tooltips to the four specified KPIs; ensure pointer hover and keyboard focus both expose them.
- [ ] Add restrained color glow/elevation and honor `prefers-reduced-motion`.
- [ ] Replace fixed pivot-table neutrals in hierarchy rows, toolbar, tooltip, loading, and empty states with theme tokens; retain warehouse and stock-value colors.
- [ ] Preserve KPI endpoints, realtime refresh, table virtualization, sorting, filters, resizing, cart behavior, and warehouse-color configuration.
- [ ] Manually inspect narrow widths, long KPI values, tooltip focus/blur, and pivot horizontal/vertical scrolling.

### Task 5: Local change review

**Files:**
- Review: all implementation files above.
- Preserve: pre-existing changes in Zoho synchronization and inventory audit/report files.

- [ ] Review the final diff to confirm only theme and Inventory presentation behavior changed.
- [ ] Search for remaining fixed neutral surface colors in the app scope and migrate any missed theme-dependent ones.
- [ ] Check that this work has not staged or committed the user's pre-existing files; do not push or deploy.
- [ ] Do not add or run tests, builds, browser automation, or other verification commands unless the user asks for verification.

