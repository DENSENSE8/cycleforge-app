# Research briefing — the three undecided IA rows (H · K · L)

## Row H — L2 mode switching

**1. Verdict**
**Persistent in-sidebar rail (pills).** Replace the MasterNav dropdown with the existing dormant pill rails for L2 mode switching.

**2. Why**
- **Switch cost:** In a 1-15 person floor ops tool where operators use tablets, a click-opened dropdown introduces a high interaction cost for core navigation. The ~40px of vertical space used by the rail is a cheap trade for 1-click self-advertising modes.
- **House rule:** "Two shapes for one job" is banned. We cannot do both (dropdown for some, rail for others). 
- **Implementation Reality:** `MasterNavProvider` hardcodes `enabled = true` (`src/components/layout/SidebarShell.tsx:48`), so flipping to the dormant code requires tearing out the dropdown and enabling the rail across all 10 panels.

**3. Falsification**
If the ~40px rail pushes the first actionable row of the datatable below the fold on the warehouse's smallest iPad resolution, or if modes >6 cause the pills to wrap and break the sidebar header layout, the persistent rail fails the ergonomic test.

**4. Deletion list**
- The entire MasterNav dropdown mechanism (`ModesPanel` in `MasterNavView.tsx`).
- The `MasterNavContext` and provider (`MasterNavContext.tsx`).

**5. Migration path**
1. Rip out the `MasterNavProvider` from `SidebarShell.tsx` and `ContextPanelLayout.tsx`.
2. Delete the `!masterNavEnabled` gates in the 10 sidebar panels (e.g., `OutboundSidebarPanel.tsx:27-51`) to unconditionally render the `HorizontalButtonSlider`.
3. Remove the mode-switching dropdown UI from `MasterNavView.tsx`.

**6. Blast radius**
- **Files Touched:** `SidebarShell.tsx`, `ContextPanelLayout.tsx`, `MasterNavView.tsx`, and all 10 `*SidebarPanel.tsx` files.
- **House boundaries:** Crosses the shared-primitive public API (nav contract), but does not touch tenancy or audit.

---

## Row K — Saved views storage

**1. Verdict**
**Shape A (polymorphic `saved_views` table).** 

**2. Why**
- **Org-wide sharing is a real requirement:** `src/components/photos/MediaSavedViewsSection.tsx:102` explicitly surfaces a `shareWithOrg` checkbox gated by `canManage`. The `is_shared` feature is actively used in the UI for the Photos domain. 
- **Shape B fails this requirement:** `staff_preferences` is scoped to a single `staff_id`, making org-wide sharing impossible without convoluted cross-row reading.
- **Per-browser is a bug:** Operators moving from a desktop to a floor tablet expect their views to follow them. The `localStorage` tier (`src/hooks/useSavedViews.ts`) breaks this contract.

**3. Falsification**
If database telemetry shows that no saved views with `is_shared = true` have ever been created in production, or if operators universally prefer personal scratchpad filters to named shared views, then Shape A is over-built.

**4. Deletion list**
- `2026-06-24_operations_saved_views.sql` and `2026-07-01_media_library_saved_views.sql` (superseded by the new table).
- The `localStorage` implementation in `src/hooks/useSavedViews.ts`.

**5. Migration path**
1. Create the polymorphic `saved_views` table with a `surface` CHECK constraint (`'dashboard' | 'operations' | 'media_library'`).
2. Run a data migration (SQL `INSERT INTO ... SELECT`) moving rows from `operations_saved_views` and `media_library_saved_views` into the new table, mapping to the appropriate `surface`.
3. Update the queries in `src/lib/operations/saved-views-queries.ts` and `src/lib/photos/saved-views-queries.ts` to target the new table.
4. Port `useSavedViews` to use the server-backed API instead of `localStorage`.
5. Drop the old tables.

**6. Blast radius**
- **Files Touched:** Migrations, `saved-views-queries.ts` for ops/photos, `useSavedViews.ts`.
- **House boundaries:** Crosses the **tenancy** boundary (live table migration with `enforce_tenant_isolation()`) and **Ask-first** polymorphic tables rule. 

---

## Row L — FBA front doors

**1. Verdict**
**One canonical route (`/shipping/fba`), one redirect (`/fba`).** The vestigial `/dashboard?orderView=fba` should be deleted, not redirected.

**2. Why**
- **Two different surfaces:** `FbaWorkspace` (`src/components/outbound/workspaces/FbaWorkspace.tsx:17`) is the new FNSKU item-grain board. `FbaShipmentsTable` (`src/components/fba/FbaShipmentsTable.tsx`) is the legacy shipment-grain table. They are not a fork of the same chrome; they are fundamentally different surfaces at different grains.
- **The top-axis predicate:** `workbench.md` line 127 explicitly states that `?fba` on the dashboard fails the rule because it already owns a home (`/shipping?mode=fba` which redirects to `/shipping/fba`). 
- **The redirect precedent:** `/fba` redirecting to Outbound FBA is a legitimate bookmark-preservation strategy (`src/app/fba/page.tsx:35`), not a "parked page."

**3. Falsification**
If operators cannot perform shipment-grain handoffs in the new `FbaWorkspace` and actively rely on the legacy `FbaShipmentsTable` for their workflow, then deleting the table breaks the floor process.

**4. Deletion list**
- The `'fba'` value from `DashboardOrderView` (`src/utils/dashboard-search-state.ts`).
- The `orderView === 'fba'` arm in `DashboardOrdersView.tsx:129`.
- The `FbaShipmentsTable.tsx` component (assuming `ShippingWorkspaceView` in `/test` is also cleaned up).

**5. Migration path**
1. Remove `fba` from `DashboardOrderView` types and unmount it from `DashboardOrdersView.tsx`.
2. Old bookmarks to `/dashboard?orderView=fba` will naturally fall back to the default `Pending` tab.
3. Keep the `/fba` -> `fbaOutboundHref` redirect to preserve legacy top-level bookmarks.

**6. Blast radius**
- **Files Touched:** `DashboardOrdersView.tsx`, `dashboard-search-state.ts`.
- **House boundaries:** Enforces the ratified directional top-axis rule.

---

## 7. Corrections to the Briefing's own claims

1. **The Briefing claimed `/shipping?mode=fba` renders `FbaShipmentsTable` via `ShippingWorkspaceView.tsx:106`. This is FALSE.** 
   - `next.config.ts:32` unconditionally redirects `/shipping?mode=fba` to `/shipping/fba`. 
   - `/shipping/fba/page.tsx:5` renders `FbaWorkspace`, which is the new item-grain board. 
   - `ShippingWorkspaceView` is only used on a `/test` route (via `TechRightPane.tsx`) and is not the primary UX.

2. **The Briefing assumed `FbaWorkspace` and `FbaShipmentsTable` might be a fork of the same surface. They are TWO DISTINCT surfaces.**
   - `FbaShipmentsTable` is the legacy shipment-grain table. 
   - `FbaWorkspace` (`FbaOutboundWorkspace`) is the new FNSKU item-grain board with Plan/Combine tabs and its own KPI strip. They share a domain, not a contract.
