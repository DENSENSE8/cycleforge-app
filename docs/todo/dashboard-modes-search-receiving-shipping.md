# Dashboard sidebar modes — Search · Receiving · Shipping

**Status:** planned (2026-07-17). **Lane:** WS-DOGFOOD (`main`) — dogfood-surface work on the live
`/dashboard`. **Governing skill:** `sidebar-mode`. **Contract:** `.claude/rules/display/workbench.md`
(master–detail Workbench), `contextual-display.md`.

## Goal (as requested)

Add three **sidebar modes** to `/dashboard`, ordered left → right in the rail:

1. **Search** (leftmost) — the global-search behavior from `GlobalHeaderSearch.tsx`, with the sidebar
   showing the signed-in staffer's **most-recently-searched** queries (per staff id, DB-backed).
2. **Receiving** (middle) — a two-tab table like the receiving triage surface: a **Triage** tab ordered
   by *when scanned*, an **Unbox** tab ordered by *when unboxed*, **each with its own KPI strip and its
   own filtering**.
3. **Shipping** (rightmost) — the existing dashboard **outbound orders** surface (`DashboardOrdersView`:
   To Ship · Packed · Shipped · FBA + `OutboundKpiStrip`).

These are **additive** — the current default `/dashboard` behavior is preserved; we light up the rail the
same way the Receiving / Tech / Operations station pages already do it.

## Confirmed decisions (2026-07-17)

- **Shipping pane** = reuse **`DashboardOrdersView`** (dashboard outbound orders), not the tech
  `ShippingWorkspaceView`.
- **Search recents** = **DB-backed per-staff table** (`search_recents`, tenant-from-birth) + a route +
  a hook; cross-device, survives cache wipe.
- **Mode model** = **add** modes (don't change the dashboard). Follow the station pages' canonical mode
  implementation (`SIDEBAR_PAGE_NAV.modes[]` + `resolveMode` + `ModeRail`).

---

## What already exists (so we compose, not fork)

The dashboard already carries the **entire** sidebar-mode apparatus; it's just dormant because its nav
entry declares a single mode (so `ModeRail` renders nothing at `modes.length <= 1`).

| Concern | Location | Note |
|---|---|---|
| Page nav registry | `src/lib/sidebar-navigation.ts` → `SIDEBAR_PAGE_NAV` (dashboard ~L471) | one mode today (`outbound`/"Shipping"); `resolveMode` always → `outbound` |
| Mode rail (the pills) | `src/components/sidebar/master-nav/ModeRail.tsx` | `HorizontalButtonSlider variant="segmented"`; auto-shows when `modes.length > 1` |
| Rail wiring | `master-nav/MasterNavView.tsx` (`showModeRail`), `useSidebarModeNav.ts` (`navigate(pageId, modeId)` → `applyModeTarget(mode.to())`) | same-page `router.replace` |
| Active-mode read | `master-nav/useActiveSidebarMode.ts` (`resolveSidebarMode`) | reads URL per each page's `resolveMode` |
| Sidebar dispatch | `src/components/sidebar/SidebarContextPanel.tsx` (`routeKey === 'dashboard'` → `DashboardOrdersContextPanel`) | per-page sidebar body |
| Dashboard sidebar body | `src/components/sidebar/DashboardOrdersContextPanel.tsx` | today: inbound → `null`; outbound → `UnshippedSidebar`/`DashboardManagementPanel` |
| Page mount | `src/app/dashboard/page.tsx` → `DashboardPageContent` | branches on domain (`getDashboardDomainFromSearch`): inbound vs outbound |
| Domain param | `src/lib/dashboard/dashboard-domains.ts` (`DASHBOARD_DOMAIN_PARAM = 'mode'`, `DASHBOARD_INBOUND_MODE = 'inbound'`) | **⚠ `?mode=` is already used** for outbound/inbound |
| Layout shell (owns search) | `src/components/sidebar/SidebarShell.tsx` (the **active** one; ignore `components/layout/SidebarShell.tsx`) | Law 2: search is a shell `search` prop |

**Reference mode implementations to copy** (per "see stations pages for modes proper implementations"):
Receiving (`ReceivingSidebarPanel` + `receiving-sidebar-shared.ts` `RECEIVING_MODE_ITEMS`), Tech
(`tech-station-view-config.ts` `TechSidebarTopMode`), Operations (`SIDEBAR_PAGE_NAV` multi-mode `to()`).

### The one reconciliation to get right: the `?mode=` param

`?mode=` is **already** the dashboard's outbound/inbound domain switch. The new rail's `to()` targets also
write `?mode=`. Resolve them into **one** axis so we don't create the "two competing axes" the survey
flagged:

- `?mode` absent / `outbound` / `shipping` → **Shipping** mode (current default outbound pane) — *default
  stays byte-identical, so this is non-breaking.*
- `?mode=receiving` (and legacy alias `?mode=inbound`) → **Receiving** mode.
- `?mode=search` → **Search** mode.

`resolveMode` (nav entry) and `DashboardPageContent` both read this single resolver.

---

## Design

### URL contract

- `?mode=search | receiving | shipping` (absent ⇒ shipping ⇒ today's outbound default). `inbound` kept as
  a back-compat alias for `receiving`.
- **Receiving sub-tab:** `?rtab=triage | unbox` (triage default). Mode-scoped — cleared on mode switch.
- Existing lifecycle params (`?unshipped/?packed/?shipped/?fba`, `?ostatus`, `?search`) remain owned by
  the Shipping (outbound) pane, untouched.
- Switching modes **clears mode-scoped params** (`rtab`, search `q`, receiving `state/sort/source`,
  `open`) — the same discipline as `useReceivingMode.updateMode` stripping `MODE_SCOPED_PARAMS`.

### Right-pane routing (`DashboardPageContent`)

```
resolveDashboardMode(searchParams):
  'search'    → <DashboardSearchResults/>          (net-new)
  'receiving' → <DashboardReceivingView/>          (net-new; Triage/Unbox tabs)
  'shipping'  → existing outbound split            (DashboardOrdersView + DashboardOrderDetails) — unchanged
```

Inbound-domain callers (`DashboardInboundView`) fold under Receiving mode or stay reachable via the alias.

### Sidebar body per mode (`DashboardOrdersContextPanel` / dispatch)

Per Law 3, the sidebar owns search + mode + list; the right pane is visual display.

- **Search:** `SidebarShell` with `search={{...}}` (the query field) + a **recents list** below (per-staff,
  DB). Selecting a recent re-runs it; selecting a hit navigates.
- **Receiving:** the receiving picker/search for the current `rtab` (compose the existing receiving
  sidebar search; the two table tabs live in the right pane's chrome, not the sidebar).
- **Shipping:** the existing order feed (`UnshippedSidebar` / `DashboardManagementPanel`) — unchanged.

---

## Mode 1 — Search

**Reuse, don't re-implement** `GlobalHeaderSearch.tsx`'s brains:
- `useAiQuickJump(query, { pageContext, limit })` (+ the classic `/api/global-search` fallback) for hits.
- `groupHitsForPreview` / `flattenPreviewGroups` (`search-tabs.ts`) → grouped display.
- `SearchResultRow` and `SearchRecentsDropdown` (`GlobalSearchDropdown.tsx` internals) are directly
  reusable presentational rows.

**Sidebar** (`DashboardSearchSidebar`): `SidebarShell search={{ value, onChange, placeholder: 'Search everything…', isSearching }}`; body = the staffer's recents (grouped by day via `groupRecentsByDay`), with remove + clear.

**Right pane** (`DashboardSearchResults`): grouped preview → "See all" full list (the `/search` two-column
workbench shape for order-heavy queries). Empty/loading/first-use states per `ui-design-system.md`.

### DB-backed per-staff recents (the migration slice)

Follow `.claude/rules/polymorphic-tables.md` (tenant-from-birth) + `backend-patterns.md` (route skeleton):

- **Migration** `src/lib/migrations/2026-07-1X_search_recents.sql`:
  `search_recents(id BIGSERIAL PK, organization_id UUID NOT NULL, staff_id …, query TEXT, scope TEXT,
  scope_label TEXT, scope_href TEXT, result_count INT, top_hit JSONB, created_at TIMESTAMPTZ)`.
  Org-led index `(organization_id, staff_id, created_at DESC)`; a unique
  `(organization_id, staff_id, scope, lower(query))` for MRU dedupe (upsert bumps `created_at`).
  `enforce_tenant_isolation('search_recents')` in the same migration. Cap retained rows per staff
  (trim to N on insert, or read `LIMIT`).
- **Drizzle** model in `src/lib/drizzle/schema.ts` (same change).
- **Route** `src/app/api/search/recents/route.ts` — `withAuth` GET (list latest N for `ctx` staff),
  POST (upsert MRU), DELETE (one id or clear-all). `orgId`/`staffId` from `ctx`, never body; `recordAudit`;
  `withTenantTransaction`. Wire permission into `permission-registry.ts` + `route-permission-manifest.test.ts`
  (use the `new-route` skill).
- **Hook** `src/hooks/useStaffSearchRecents.ts` — same surface as `useSearchRecents`
  (`{ recents, push, remove, clear }`) but backed by the route + React Query (staleTime, optimistic push).

The existing localStorage `search-recents.ts` stays for the header today; **compound opportunity**: point
the header at the DB store too once proven (recommend, don't do in this pass).

---

## Mode 2 — Receiving (Triage / Unbox tabs)

**Right pane** `DashboardReceivingView`: the golden workbench recipe —
`DashboardScrollShell chrome={<WorkbenchChromeHeader tabs=[Triage, Unbox] …/>}` + a per-tab KPI strip
(scrolls away, inside the body) + the receiving list. Compose the **shared** `ReceivingLinesTable` hooks
(`useReceivingLinesData`, `useReceivingGrouping`) — do **not** hand-roll a table (the anti-fork rule +
`.claude/rules/display/workbench.md` "hand-rolled table = fork").

**Tabs** = `TabSwitch`/`WorkbenchChromeHeader` writing `?rtab=`, exactly like `IncomingWorkspaceHeader`
writes the All/Zoho/eBay `?inbound=` source tabs.

**Ordering** via `ReceivingActivityAxis` (`receiving-lines-table-helpers.ts`):
- **Triage tab** → axis `'scanned'` → `receivingRowActivityTs = scanned_at ?? received_at ?? created_at`
  (matches the existing `?view=scanned` "door-scanned, not yet unboxed" feed in `receiving-views.ts`).
- **Unbox tab** → axis `'unboxed'` → `unboxed_at ?? created_at` (matches `?view=unbox_opened`).

History mode *already* proves both axes (`HISTORY_SORT_OPTIONS`: `unboxed_newest` default + `scanned_newest`
→ `historySortGroupAxis`). Two clean paths — pick one during build:
- **(A, preferred)** add two thin `ReceivingModeDescriptor`s in `receiving-modes.ts`
  (`dashboardTriage` / `dashboardUnbox`) each pinning its axis, `apiView` (`scanned` / `unbox_opened`),
  `queryKey`, `buildParams`, `sortOptions`, `defaultSort` — the tab selects the descriptor.
- **(B)** reuse the History descriptor and flip its sort axis from the tab. Less explicit; only if (A)
  proves heavy.

**Per-tab KPI (each tab its own strip):**
- **Triage KPI** — reuse the triage metrics feed (`['receiving','triage','metrics']`, `TriageMetricsStrip`):
  scanned backlog / awaiting-unbox counts.
- **Unbox KPI** — a thin unbox-throughput strip (unboxed today, queue depth). Source from the
  incoming-summary route (`/api/receiving-lines/incoming/summary`, which already computes
  `delivered_not_unboxed` etc.) or a small new count; render with `KpiTile` + `MONITOR_KPI_TILE_CLASS` in
  the `flex flex-wrap gap-3` band, the `IncomingKpiStrip` / `OutboundKpiStrip` pattern (attention-first).

**Per-tab filtering:** each tab carries its own filter set (Triage: source / status like the triage
surface; Unbox: unbox status / queue). Filters ride mode-scoped URL params, cleared on tab switch.

---

## Mode 3 — Shipping

Little new code: the mode **resolves to the existing outbound split** (`DashboardOrdersView` +
`DashboardOrderDetails`) with its current lifecycle tabs (To Ship · Packed · Shipped · FBA), `OutboundKpiStrip`,
`?ostatus` filters, and the existing order-feed sidebar (`UnshippedSidebar` / `DashboardManagementPanel`).
Work is limited to: making `resolveDashboardMode('shipping' | absent)` route here, and the rail pill
highlighting Shipping when no `?mode` is set. **Default `/dashboard` must stay byte-identical.**

---

## Phasing — STATUS (all code-complete 2026-07-17)

| Phase | Deliverable | Status |
|---|---|---|
| **P0** | Mode plumbing: `getDashboardModeFromSearch`, dashboard `modes[]` (Search/Receiving/Shipping) + `resolveMode` in `sidebar-navigation.ts`; rail lights up; page + context-panel branch on mode. `?mode=` reconciled (Shipping id stays `outbound`; Receiving writes `?mode=inbound`, `receiving` alias). | ✅ DONE (round-trip test green) |
| **P1** | Shipping mode = existing outbound split through the resolver; sidebar = existing order feed. Default `/dashboard` byte-identical. | ✅ DONE (non-breaking) |
| **P2** | Receiving mode: `DashboardReceivingView` + Triage/Unbox tabs (the History `?sort=` axis) + per-tab KPI (`DashboardReceivingKpiStrip`) + per-tab filtering (`DashboardReceivingHeader`), composing `ReceivingLinesTable`. Superseded + removed `DashboardInboundView`/`InboundWorkspaceHeader`. | ✅ DONE |
| **P3** | Search mode UI: adopted `DashboardSearchView` (reuses `SearchResultsSurface` + header contextual pill) + `DashboardSearchSidebar` (per-staff recents map). | ✅ DONE |
| **P4** | DB-backed per-staff recents: migration `2026-07-17b_search_recents.sql` + Drizzle `searchRecents` + `/api/search/recents` route + `staff-recents.ts` helper + `useStaffSearchRecents`. Reviewer fixes applied (single-txn upsert+trim+relist, COALESCE-on-conflict, `topHit` shape guard). | ✅ CODE DONE — **migration UNAPPLIED: run `/db-migrate` to create the table** |

**Remaining to be fully live:** apply the migration (`/db-migrate`), then browser-verify the recents
round-trip (search → recents populate → re-run from sidebar → cross-device). Static verification
(tsc, unit tests, DS guards, route-auth manifest, api-route + neon reviewers) is green.

## Verify (per phase, and before "done")

- `npm run lint`; `npx tsc --noEmit` — the `DashboardMode` union must be exhaustive everywhere switched.
- Guard test if search wiring touched: `src/components/ui/sidebar-search-bar.guard.test.ts`
  (`SearchBar` stays shell-only — never render `<SidebarSearchBar>` directly).
- New route → `api-route-reviewer` + `permission-registry-guard` agents; `npm run verify` (route-auth drift).
- New table → `.claude/rules/polymorphic-tables.md` shape; `neon-cost-reviewer` on the recents route +
  any new polling (reuse cache; don't add a hot per-keystroke write path — debounce recents push).
- Manual: deep-link `?mode=receiving&rtab=unbox` loads directly; switching modes clears stale
  `q`/`rtab`/`filter`/`open`; refresh preserves mode; **`/dashboard` with no params is unchanged**; Triage
  orders by scanned, Unbox by unboxed; each tab shows its own KPI + filters.

## Risks / watch-outs

- **`?mode=` collision** — the single biggest one; the resolver must subsume the old outbound/inbound
  domain switch (inbound → receiving alias) or the two axes fight.
- **Two `SidebarShell`s** — use `src/components/sidebar/SidebarShell.tsx`; the mode rail is composed in
  `MasterNavView`, **not** a `headerAbove` slot on the shell.
- **Non-breaking default** — Shipping/absent must render exactly today's outbound pane.
- **Recents write cost** — debounce the DB push (only on submit / hit-open, not per keystroke).
- **Table reuse** — Receiving must compose the shared `ReceivingLinesTable` hooks, not a parallel table.

## Compound opportunities

- **Do now (low blast radius):** two explicit receiving descriptors (path A) that other surfaces can
  reuse for a scanned-vs-unboxed split.
- **Promote to DS/next (2+ call sites):** point the global header search (`GlobalHeaderSearch`) at the new
  DB-backed per-staff recents too, retiring the localStorage store as the SoT.
- **Deferred (ask first):** a shared `useDashboardMode` resolver promoted alongside the station
  `resolveSidebarMode` if a second page wants the same Search/Receiving/Shipping triad.
