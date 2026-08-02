# Workbench branch `ops-queue` — Desk collection recipe

The **tabular queue** branch of Workbench: operator browses a dense ledger, refines with
**saved views** + lifecycle tabs, and peeks/edits via a **pushing right rail**. Default for Sales /
Fulfillment desk queues / Inbound pointer triage / Labels unification targets.

**Inherits:** [`workbench.md`](workbench.md) (contract). Support conversation-first is **not** this
branch — see [`workbench-service.md`](workbench-service.md).

---

## Composition

```text
┌──────────────────────┬────────────────────────────────┬─────────────────────────────┐
│ LEFT                 │ MIDDLE                         │ RIGHT                       │
│ ContextPanelLayout   │ WorkbenchChromeHeader (band)   │ RightRailHost               │
│ + SidebarShell       │ + primary Add / Print CTA      │ modal={false}               │
│ SAVED VIEWS list     │ + KPI strip (in scroll body)   │ scrollable form / inspector │
│ (useSavedViews)      │ + LedgerGridSurface            │ opened by row select OR Add │
│ optional filter map  │   URL selection                │                             │
└──────────────────────┴────────────────────────────────┴─────────────────────────────┘
```

| Slot | Must | Must not |
|---|---|---|
| **Left** | `useSavedViews` list (compose `OutboundSavedViewsList`). Optional thin filter facets *below* views. | Recent/MRU rails, room pickers, library trees as the **primary** left map |
| **Middle** | `LedgerGrid` / `LedgerGridSurface` + `GridSurfaceDescriptor` + `GridSurfaceCapabilities` + URL row selection | Hand-rolled boards / raw `<table>` as the collection map |
| **Right** | Non-modal `RightRailHost` form/inspector | Full-pane Station column shell replacing the grid; modal-by-default detail |
| **Top Add** | Chrome CTA opens empty/create on the **right rail** | Modal-only create when a rail form exists |

Scan Stations keep Station + sibling Workbench map — do not force this three-pane onto the scan column.
Hybrid multi-region exits: [`workbench.md`](workbench.md) → Multi-region pages.

Reference: `DashboardOrdersView`, `OutboundSavedViewsList`, `docs/todo/desk-contract-unification-CLAUDE-CODE-PROMPT.md`.

---

## The top axis is DIRECTION (+ front-desk commerce)

Ratified 2026-07-29 (`docs/todo/dashboard-ia-rework-PLAN.md` §10.2 rows H + I); Sales domain
amended 2026-07-30 (`docs/todo/sales-into-dashboard-PLAN.md`).

A multi-domain Workbench page's top axis splits by **physical direction of flow**
(`?mode=inbound` | bare outbound) **plus** front-desk commerce history when that collection has no
other L1 home (`?mode=sales` | `?mode=pickup`). Never by entity type
(`Orders · FBA · Repair · Sales` as peers of each other).

**The predicate for what earns a top-axis slot** — all three, or it is not a slot:

1. It **owns a distinct collection surface** (its own `LedgerGrid`/`GridSurfaceDescriptor` / feed),
   not a filtered view of a sibling's.
2. It is a **Workbench / Monitor browse region** — pointer-driven pick+edit or observe. A
   scanner-driven Station fails here.
3. It has **no home elsewhere**. A domain that already owns a page or an L2 mode does not get a
   second front door.

Worked verdicts: **Orders** passes. **Receiving** fails (2) — it is a scanner-driven Station at
`/unbox`; the dashboard's `inbound` domain is its pointer-driven *counterpart*, not the Station
itself, and merging them is the anti-mix regression this whole doc opens with. **FBA** and **Repair**
fail (3) — FBA lives at `/shipping/fba` (legacy `/shipping?mode=fba` redirects there), Repair is a
Receiving mode. **Sales** passes after its L1 `/walk-in` home is deleted — it owns the walk-in
transaction feed, is Monitor browse, and lands as the dashboard `sales` domain
(`?mode=sales` / `?mode=pickup`); counter intake stays on `/pickup` + `/repair`.

**Why direction (+ commerce) beats a full entity axis.** An entity axis reads cleaner on a nav
diagram and is the right default for a *catalog* console (Shopify, Linear), where every top-level
value is the same kind of thing: a pointer-driven list you filter. This app's entities are not the
same kind of thing — one of them is a scan bench. Direction matches what a 1–15 person floor
physically switches between (the dock vs. the ship station); commerce history is the third browse
collection that shared the Sales L1 page and now shares the dashboard shell without widening to
FBA/Repair (they keep their homes).

**Consequence — an axis value that stops owning a table is a deletion candidate, not a tab.**
The vestigial `'fba'` member of `DashboardOrderView` was deleted 2026-07-29 (IA row L): FBA owns
`/shipping/fba`, and no nav entry constructs `?fba`.

## Tabs vs. saved views — the boundary rule

Both ship, and they are not two ways to do one thing. The line is **who defines the set**:

| | Hardcoded tabs | Saved views |
|---|---|---|
| Defined by | the **system** | the **operator** |
| Represents | a mutually-exclusive lifecycle **state transition** | a named **facet combination** |
| Example | Pending → Tested → Packed → Shipped | "late eBay units, oldest first" |
| Cardinality | fixed, 3–5, same for every staffer | open-ended, per staffer |
| Lives in | the lifecycle strip (`WorkbenchChromeHeader` left) | the sidebar filter map / table ⋮ menu |

**The test:** if adding one more of them would require a **migration or a status-machine change**, it
is a tab. If it is just a different combination of params the surface already reads, it is a saved
view.

- **Never ship a saved view that reproduces one lifecycle tab** ("all Packed orders") — that is the
  duplication this rule exists to prevent, and it desyncs the moment the tab's query changes.
- **Never grow the tab strip to hold a filter** ("Late", "eBay only"). A tab that is a filter is a
  saved view wearing tab chrome, and it costs every staffer strip width to serve one workflow.
- **One core, many faces.** `useSavedViews` (`src/hooks/useSavedViews.ts`) is the single
  storage + URL-apply implementation; a surface supplies only `storageKey` + `paramKeys` and its own
  UI. Exactly two consumers: `OutboundSavedViewsList` (dashboard sidebar) and `TableOptionsMenu`
  (station + testing history ⋮). Never fork the apply-to-URL logic for a new surface.
- **One store, three faces (the split-brain is CLOSED — 2026-07-29).** Every saved view, on every
  surface, lives in the polymorphic **`saved_views`** table (org-scoped, `staff_id`-owned,
  `is_shared`). `2026-07-29g_saved_views.sql` created it; `2026-07-29h` dropped the
  `operations_saved_views` / `media_library_saved_views` duplicates. `useSavedViews` writes it
  through `/api/saved-views` and **no longer touches localStorage** — a dashboard view now follows
  a staffer to a second device.
  - The `storageKey` prop kept its name for call-site stability; it resolves to a DB `surface`
    discriminator via **`src/lib/saved-views/surfaces.ts`**. That module is the SoT for the
    discriminator: **keep `SAVED_VIEW_SURFACES` in lockstep with the `saved_views_surface_chk`
    CHECK** in the birth migration, or a new surface fails its first insert.
  - Ops and Media Library keep their own hooks/routes (`useOperationsSavedViews`,
    `useMediaLibrarySavedViews`) because their UIs differ. **Three client hooks over one store is
    not a fork** — the thing that must never be duplicated is the storage and the apply-to-URL
    logic, and there is exactly one of each. Do not "consolidate" the hooks for symmetry.

---

---

## Sticky docking — one sticky layer per scroll port

**Never stack two `sticky top-*` bands inside the same scroll port.** The lower band has to know the upper band's height to dock beneath it, and a hardcoded offset (`top-[var(--x,72px)]`, a guessed px) drifts the moment the upper band's real height differs — the seam/overlap bug. z-index orders *front-to-back*; it says nothing about *vertical docking*, so a second sticky band is never made safe by a higher `z-`.

**House pattern (the fix): pinned chrome OUTSIDE the scroll port.** The single always-visible top bar (lifecycle tabs + filters) renders in a non-scrolling slot **above** the `overflow-y-auto` body; the body then has exactly one sticky layer — the day-band `DateGroupHeader`s at `top-0` — which docks directly under the chrome with **no offset math**.

- Reference: `DashboardScrollShell`'s `chrome` prop (`src/components/dashboard/DashboardScrollShell.tsx`) — the chrome slot owns the `z-header` band as a non-scrolling sibling; `DashboardOrdersView` / `ShippingWorkspaceView` pass the workspace header there and keep the KPI strip **inside** the body.
- Anything that is not always-visible chrome (KPI strips, banners) belongs in the body, never the chrome.
- **In the body ≠ scrolls away.** On a lane whose table is a **bounded host**
  (`workbenchTableViewportClass` → `h-[calc(100dvh-13rem)]`), the grid owns Y
  scroll internally, so the body never grows with row count and an in-body KPI
  strip effectively stays put. That is deliberate — an unbounded card grows past
  the fold and loses the bottom edge that sells its elevation
  (`WORKBENCH_TABLE_VIEWPORT` docblock). Do not "fix" a KPI that does not scroll
  away on such a lane; the sticky layers that matter there live inside the
  **grid's** port (column header at `top-0`, day bands), not the page's.
  Pinned by `to-ship-pending-grid.spec.ts` → "the bounded host keeps the KPI
  pinned and the card fully on screen".
- Only reach for a **measured** offset (ResizeObserver → CSS var per layer) if a port genuinely needs 3+ dynamic-height sticky bars — the two-zone shell removes the need in every current surface. A fixed px offset is never the answer.
- z bands stay from the SoT (`src/design-system/tokens/z-index.ts`): chrome/top bar = `z-header`, in-body pins = `z-raised`/`z-sticky`. Never hardcode `z-[NNN]`.

**Chrome face density (`WorkbenchChromeHeader`).** Two densities on one SoT — never a page-local twin tab band. `default` is the content-driven raised card (`p-1.5` + md solid-hug tabs with their own rail) — escape only when a surface cannot use the band face. **`density="band"` is the house standard** for every lifecycle `WorkbenchChromeHeader` consumer (Outbound, Incoming, History, Unbox, Triage, Pack, Testing, Shipping, Labels, Ready, FBA, Walk-In, Repair, Support, Review, …): a **single-surface 40px face** (`h-10 p-0.5` + `TabSwitch size="sm"` on a **flat** rail — **2px inset required**; active pill uses `nestedCornerClass('card', 0.5)` / `rounded-xl` so it nests concentrically inside the card shell; no flush full-height active pill, no nested bordered track, no `rounded-full` mismatch). Nested TabSwitch cards under band are forbidden (Kinetic Ledger / Linear chrome). Lifecycle tabs are **text-only** (no leading icons for Queue · Viewed · History-style states). When beside a floated context panel / scan dock, wrap with `WORKBENCH_CHROME_BESIDE_SCAN` (`py-2` = panel `m-2`) so the band face shares a Y row with `receivingScanBandClass` — never flush with `py-0`. Guard: `workbench-chrome-band.guard.test.ts`.

**Trailing Display & Actions (`WorkbenchTrailingCluster`).** Display sort (`QueueSortSwitch`) lives in the **pinned page chrome trailing cluster**, not an in-card Sheets-like action bar (that would stack a second sticky band — forbidden above) and not GlobalHeader. Compose `WorkbenchTrailingCluster` as `WorkbenchChromeHeader`’s `trailing` prop with honest absence: **Sort → actions** (`before` / `after` escapes for pagination / refresh only); a surface with neither passes no `trailing` at all. `actions` holds solid CTAs — Import / Add on desk queues, and on **hybrid scan stations** the mandatory **return-to-scan** primary (every strip tab, top-right above KPIs — [`workbench.md`](workbench.md) → Multi-region). Filters / refine stay in `right` (query ≠ display). Leading hairline only when `actions` are present. Multi-select triage stays on `ContextualSelectionBar` (bottom) — never morph the top bar. Guard: `workbench-trailing-cluster.guard.test.ts`.

**Column display is NOT chrome — it belongs to the grid, in a gutter beside the card** (ratified 2026-08-02). `WorkbenchTrailingCluster` has **no `fields` slot**, and `GridFieldsMenu` is deleted. The single operator entry is `GridColumnGutter` — mounted by `LedgerGridSurface` (`columnDetails={{ open, onOpen }}`), or hand-wrapped by a view that composes `LedgerGrid` directly (Orders) — opening the non-modal `GridColumnDetailsPanel` rail (`detail:grid-column-details`), which owns visibility · highlight · chip · **Reset to default** (widths included).

- **Why it left page chrome.** Fields mutates the column set of the card it sits on, so a page-chrome control acting on that card is an altitude mismatch — the thing that reads as "internal tool" even when the atoms are right. The migration also *removed a fork*: seven surfaces shipped **both** doors onto the same rail id, because `GridFieldsMenu` mounted `GridColumnDetailsPanel` itself and so did every grid view.
- **Why it is not in the header band either.** It shipped there for a day, in both possible forms, and both were wrong in the same way: a permanent `w-9` track plus `pr-9` on the header row **reserved gutter width on every grid forever** to host an occasional action; dropping that padding then let the control **overlay the last column's label** (it covered `TRACKING`). A control at the right edge of the band can only buy its space from the data. The gutter buys page width beside the card instead — geometry the E2E asserts, because a screenshot cannot tell "beside the card" from "over the last column".
- **Neither header may mount it.** `LedgerGridColumnHeader` and `OrdersQueueColumnHeader` take no `onOpenColumnDetails`; the guard bans the prop, the marker, and `pr-9` in both.
- **This does not weaken "one sticky layer per scroll port".** What that law bans is a **second sticky band above the grid** — a `TableActionBar` — and that ban is unchanged and still guarded. The gutter is outside the port entirely, so it cannot add one.
- **The trigger is icon-only** (`ColumnsThree` + `HoverTooltip` "Column display"), `aria-haspopup="dialog"`, filled while the rail is open, muted at rest. Never a numeric badge on the glyph.

**Column WIDTH is a drag, on every family, from one handle.** `ColumnResizeHandle` (`@/design-system/components/grid`) mounts on each resizable header cell; the drag mutates only the surface's `--cf-col-<key>` CSS var, so header, rows, group summaries **and the frozen pane's sticky-left `calc()`** all reflow together with zero React render, and the width is committed once on drop to `staff_preferences.tableColumns[tableId].widths` (`useGridColumnWidths`). Keyboard: ←/→ nudge, Enter = resize-to-fit; double-click = resize-to-fit.

- **Which columns get a grip is one rule** — `isGridColumnResizable`. Variable-content tracks yes; the `select` gutter and the **fixed-format types** (`number` · `id` · `location`) no, because those cells render a last-8 `CopyChip` or a short tabular numeral run, so a drag only moves whitespace beside the same eight characters. A genuine exception sets `resizable` on the column model, where the column is declared.
- **Never re-derive the resizable set per surface.** `ORDERS_QUEUE_RESIZABLE_KEYS` used to mean "everything but `select`"; it now composes the house rule, so Orders offers the same grips as every other family.

---

Indexed by [`workbench.md`](workbench.md) · ../contextual-display.md
