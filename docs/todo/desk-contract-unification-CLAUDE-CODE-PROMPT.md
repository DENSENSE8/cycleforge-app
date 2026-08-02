# Claude Code prompt — Desk contract unification + dead-code cleanup

**For:** Claude Code / Cursor Agent implementing session  
**From:** Cycle Forge engineering (codebase audit 2026-08-01)  
**Status:** ready to execute — architecture locked; audit evidence below  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Companion (right inspector header + modal→rail):** [`right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md`](./right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md)  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

> **2026-08-01 — Support carve-out:** Phase 1 “Support tickets → LedgerGrid middle” is **superseded**. Support is Workbench branch **`service-workspace`** (list \| thread \| context), not the Desk ops-queue recipe. Execute [`support-service-workspace-CLAUDE-CODE-PROMPT.md`](./support-service-workspace-CLAUDE-CODE-PROMPT.md) instead. This prompt still owns Labels / Products / warehouse locations / other pointer triage queues.

---

## Paste this into a new Claude Code session

```
Read docs/todo/desk-contract-unification-CLAUDE-CODE-PROMPT.md end-to-end, then execute
§3 → §7 in order. Do not invent a fifth layout shell.

GOAL
Unify every Desk / Labels / Products pointer-driven collection onto ONE architecture:

  LEFT   = Saved views sidebar (useSavedViews + OutboundSavedViewsList pattern)
  MIDDLE = SoT LedgerGrid / LedgerGridSurface + GridSurfaceDescriptor + row selection
  RIGHT  = Non-modal RightRailHost inspector / scrollable form (DetailStackRailRegistrar
           or useRegisterRightPanel, modal={false})
  TOP    = WorkbenchChromeHeader band + primary Add / print CTA that opens the right rail

Delete every hand-rolled twin (custom queue boards, room pickers-as-left-map, printed-history
rails-as-left-map, master-detail PDF/hub panes pretending to be the collection map).

HARD LAWS (never violate)
- AGENTS.md + .claude/rules/source-of-truth.md + display/workbench.md + contextual-display.md
- Navigators push, inspectors float — RightRailHost modal={false} for record peeks
- Compose LedgerGrid — never raw <table> / custom SupportTicketsBoard / ProductCatalogList
  as a Desk collection map
- One saved_views store (SAVED_VIEW_SURFACES + useSavedViews) — extend surfaces CHECK in
  lockstep; never localStorage forks
- Scan Stations (floor) keep Station recipe — DO NOT force Desk three-pane onto Unbox /
  Testing / Pack / Scan-out middle columns
- Never start/restart/kill the :3050 dev server; attach only
- User owns git commits; no stash; npm run verify before claiming done

REFERENCE (copy anatomy, don't fork)
- Left:  src/components/unshipped/OutboundSavedViewsList.tsx
         + DashboardOrdersContextPanel / UnshippedSidebar
- Middle: src/components/dashboard/orders-queue/OrdersGridView.tsx
         + src/features/my-day/grid/MyDayGridView.tsx
         + src/components/station/incoming-grid/IncomingGridView.tsx
- Right:  src/components/shipped/ShippedDetailsPanel.tsx (DetailStackRailRegistrar)
         + src/features/my-day/MyDayTaskInspector.tsx (useRegisterRightPanel)
- Grid SoT: makeGridSurfaceDescriptor + GridSurfaceCapabilities + register in
  grid-surface-capabilities.guard.test.ts MOUNTS
- Saved views SoT: src/lib/saved-views/surfaces.ts + src/hooks/useSavedViews.ts

Start at §3 Phase 0 (SoT contract write) then Phase 1 Support tickets.
```

---

## 0. One-sentence goal

**Delete parallel Desk UIs.** Every pointer-driven triage / labels / manuals / pairing / warehouse-locations surface must be: **saved views left · LedgerGrid middle · non-modal right form** — then remove the dead twins so the codebase shrinks toward one architecture.

---

## 1. Locked architecture (the only Desk recipe)

```text
┌──────────────────────┬────────────────────────────────┬─────────────────────────────┐
│ LEFT                 │ MIDDLE                         │ RIGHT                       │
│ ContextPanelLayout   │ WorkbenchChromeHeader (band)   │ RightRailHost               │
│ + SidebarShell       │ + primary Add / Print CTA      │ modal={false}               │
│                      │ + LedgerGridSurface            │ scrollable form / print     │
│ SAVED VIEWS list     │   select · identity · columns  │ preview / pairing editor    │
│ (useSavedViews)      │   URL selection (?id= / ?sku=) │ opened by row select OR Add │
│ optional filter map  │   Fields menu · sort URL       │                             │
│ below views          │                                │                             │
└──────────────────────┴────────────────────────────────┴─────────────────────────────┘
```

### Rules

| Slot | Must | Must not |
|---|---|---|
| **Left** | `useSavedViews` always-visible list (compose/generalize `OutboundSavedViewsList`). Optional thin filter facets *below* views. | Recent/MRU rails, room pickers, library trees, pairing queues, printed-history feeds as the **primary** left map |
| **Middle** | `LedgerGrid` / `LedgerGridSurface` + `GridSurfaceDescriptor` + declared `GridSurfaceCapabilities` + row selection writing URL | Hand-rolled boards, raw `<table>`, catalog split panes, PDF viewer, Product Hub as the collection map |
| **Right** | Non-modal `RightRailHost` form/inspector (print form, manual viewer+print, pairing editor, ticket form, location form) | Full-pane Station focus replacing the grid; page-local `fixed right-0` panels; modal-by-default detail |
| **Top Add** | Chrome CTA opens empty/create form on the **right rail** (same shell as row-select) | Modal-only create when a rail form exists; invent a fourth pane |

### Tabs vs saved views (already law — keep)

- Lifecycle / system states → `WorkbenchChromeHeader` tabs  
- Operator facet combos → saved views on the left  
- Never ship a saved view that clones one lifecycle tab  

### Station carve-out (do not regress)

Scan Stations (`stationGroup: 'floor'`) keep **Station** recipe (recent rail OK, scan bar, `StationWorkbench`). This prompt targets **Desk + Labels hub + Products modes that are pointer triage**, not the scan column.

---

## 2. Audit evidence (current codebase — 2026-08-01)

### 2.1 Surfaces that VIOLATE the Desk recipe (must migrate)

| Surface | Route | Left today | Middle today | Right today | Hand-rolled killers |
|---|---|---|---|---|---|
| **Support tickets** | `/support` | Recent tickets (`SupportTicketsRecentRail`) | Custom queue (`SupportTicketsBoard` + `SupportTicketRow`) | Full-pane `SupportTicketFocus` (Station workbench) | No LedgerGrid, no saved views, no RightRailHost record plane |
| **Warehouse labels** | `/warehouse` (`tab=labels`) | Room picker (`LabelRoomSidebar` / `BinLabelPrinter` sidebar) | 5-step print builder (`LabelPrintWorkspace`) | None | Not a locations table at all |
| **Product labels** | `/products?view=labels` | Printed history (`ProductLabelsRecentRail`) | Catalog list + barcode (`ProductCatalogList` / `MultiSkuSnBarcode`) or unit detail | None | No LedgerGrid / saved views / RightRailHost |
| **Products manuals** | `/products` (default manuals) | Folder tree (`LibraryBrowser`) | PDF viewer in middle (`ManualLibrary`) | N/A (detail IS middle) | Master–detail, not Desk |
| **Products pairing** | `/products?view=pairing` | Pairing queue `<ul>` (`PairingQueueList`) | Full `ProductHubPanel` | Modals only | Master–detail, not Desk |

**Key absolute paths (migrate or delete):**

```
# Support
src/app/support/page.tsx
src/components/sidebar/SupportSidebarPanel.tsx
src/components/support/zendesk/SupportWorkspace.tsx
src/components/support/zendesk/SupportTicketsWorkspace.tsx
src/components/support/zendesk/SupportTicketsBoard.tsx
src/components/support/zendesk/queue/SupportTicketsRecentRail.tsx
src/components/support/zendesk/queue/SupportTicketRow.tsx
src/components/support/station/SupportTicketFocus.tsx

# Warehouse labels
src/app/warehouse/page.tsx
src/components/warehouse/WarehouseShell.tsx
src/components/warehouse/LabelPrintWorkspace.tsx
src/components/sidebar/WarehouseSidebarPanel.tsx
src/components/barcode/BinLabelPrinter.tsx
src/components/warehouse/BinsTable.tsx          # raw <table> — also migrate if locations tab

# Product labels / manuals / pairing
src/app/products/page.tsx
src/components/products/ProductsWorkspace.tsx
src/components/sidebar/ProductsSidebarPanel.tsx
src/components/labels/LabelsProductsWorkspace.tsx
src/components/labels/ProductLabelsRecentRail.tsx
src/components/labels/ProductCatalogList.tsx
src/components/manuals/ManualLibrary.tsx
src/components/manuals/LibraryBrowser.tsx
src/components/products/pairing/ProductsPairingShell.tsx
src/components/products/pairing/PairingQueueList.tsx
src/components/products/pairing/ProductHubPanel.tsx
```

### 2.2 Positive references (copy these)

| Surface | Why it is the gold standard |
|---|---|
| **Dashboard Orders** `/dashboard` | Left `OutboundSavedViewsList` + middle `OrdersGridView`→`LedgerGrid` + right non-modal `ShippedDetailsPanel` / `UnshippedDetailsPanel` |
| **Incoming** `/incoming` | Middle `IncomingGridView`→`LedgerGridSurface` + right `IncomingDetailsPanel` — **promote saved views into left** (surface `receiving_incoming` already in CHECK) |
| **My Day** `/?mode=today` | Middle `MyDayGridView` + right `MyDayTaskInspector` via `useRegisterRightPanel` `modal:false` |
| **Ready** `/shipping/ready` | Middle already `ReadyGridView` — add left saved views + right inspector |
| **Catalog** `/products?view=catalog` | Already LedgerGrid (`CatalogGridView`) — add Desk left saved views + right rail if missing |

### 2.3 `useSavedViews` consumers today (too few)

| Consumer | Role |
|---|---|
| `OutboundSavedViewsList` | Only **always-visible left** saved-views UI |
| `TableOptionsMenu` | ⋮ popover on station/testing history only |

**Declared surfaces** (`src/lib/saved-views/surfaces.ts`):  
`operations`, `media_library`, `dashboard_unshipped|packed|shipped`, `tech_history`, `packer_history`, `receiving_history`, `receiving_incoming`, `testing_history`.

**Missing surfaces to ADD** (migration + CHECK lockstep):  
`support_tickets`, `warehouse_locations` (or `warehouse_labels`), `product_labels`, `product_manuals`, `product_pairing`, optionally `shipping_ready`, `shipping_labels`.

### 2.4 LedgerGrid mounts today (guard list)

Certified in `src/lib/tables/grid-surface-capabilities.guard.test.ts`:  
orders · receiving · incoming · catalog · repair · pickup · warranty · ready · my-day · station-history · fba.

**None** of Support tickets / Warehouse labels / Product labels / Manuals / Pairing are mounted. That is the debt.

### 2.5 Adjacent debt (same pass or immediate follow-up)

| Surface | Issue |
|---|---|
| `/shipping/labels` | Left = `LabelsRecentRail` (printed history); open order = full-pane overlay — same Desk violation |
| Ready left rail | Teaching copy only — empty vs target |
| Incoming left | View facets only — wire `receiving_incoming` saved views as left list |
| `BinsTable.tsx` | Raw `<table>` |
| Tracking exceptions / Unfound queues | Non-Ledger queues |

---

## 3. Execution phases (do in order)

### Phase 0 — Write the contract (docs first, short)

Update SoT so implementers cannot “reinterpret”:

1. `.claude/rules/display/workbench.md`  
   - Add section **Desk recipe (mandatory for Desk spine + Labels hub + Products collection modes)** with the three-pane law above.  
   - Explicitly demote “master–detail PDF/hub in middle” for manuals/pairing/labels to **legacy — migrate**.  
2. `.claude/rules/source-of-truth.md`  
   - Add waist rows: Desk left = saved views list SoT; Desk middle = LedgerGrid; Desk right = RightRailHost.  
3. Optional: `.claude/rules/contextual-display.md` — one paragraph linking Desk recipe to Workbench contract (recipe, not new archetype).

Do **not** invent a fifth archetype. Desk = Workbench recipe.

### Phase 1 — Support tickets → Desk

**Target UX**

- Left: Saved views for ticket filters (status/assignee/tags/search params you already URL).  
- Middle: `SupportTicketsGridView` → `LedgerGridSurface` with select + identity columns + triage-relevant fields.  
- Row select → right rail ticket inspector (thread + reply composer can live *inside* the rail or as docked chrome — **do not** replace the grid with `SupportTicketFocus` as the only focus path).  
- Top Add / New ticket → opens empty form on right rail.

**Delete after green**

- `SupportTicketsBoard` / `SupportTicketRow` as primary map (or reduce to cell atoms).  
- `SupportTicketsRecentRail` as left primary (MRU may move to GlobalHeader Recents — already SoT — or a secondary section *below* saved views, never replacing them).  
- Full-pane-only `SupportTicketFocus` as the default open path (Station anatomy may remain for deep focus if allowlisted — prefer rail-first).

**Wire**

- New `support_tickets` in `SAVED_VIEW_SURFACES` + migration CHECK.  
- Register mount in `grid-surface-capabilities.guard.test.ts`.  
- E2E: select row → right rail opens non-modal; saved view apply updates URL.

### Phase 2 — Warehouse labels → locations Desk

**Target UX (user-specified)**

- Left: Saved views (e.g. by room/zone/aisle filters) — **not** “pick a room” as the map.  
- Middle: LedgerGrid of **all locations / bins** (select · location id · room · aisle · bay · level · position · label status…).  
- Top Add → right rail **scrollable form** to create/print a warehouse/bin label.  
- Row select → same right rail prefilled for that location (print / edit).

**Migrate**

- Room picker becomes a **filter facet or column filter**, not the left spine of the page.  
- `BinLabelPrinter` wizard collapses into the **right-rail form** (or a stepped form inside the rail).  
- Delete/retire `LabelPrintWorkspace` as middle primary.

**Also:** migrate `BinsTable` raw `<table>` onto LedgerGrid if still used.

### Phase 3 — Product labels → Desk

**Target UX (user-specified)**

- Left: Saved views (SKU filters, condition, channel, recently printable sets) — **not** printed-history rail.  
- Middle: LedgerGrid of printable SKUs / units (select · SKU · title · condition · channels…).  
- Row select / Print CTA → right rail **label print form** (preview + print actions).  
- Printed history moves to: a saved view, a chrome History tab, or GlobalHeader Recents — **not** left primary.

**Delete**

- `ProductLabelsRecentRail` as left map.  
- `ProductCatalogList` as middle map.  
- Split print builder as middle primary.

### Phase 4 — Products manuals → Desk

**Target UX (user-specified)**

- Left: Saved views (folder/tag/type filters as view params).  
- Middle: LedgerGrid of manuals (select · title · folder · updated · pages…).  
- Row select → right rail **manual viewer + print** (scrollable).  
- Top Add → right rail upload/create form.

**Delete / demote**

- `LibraryBrowser` tree as left primary (tree may become Fields/filter or a grouped column — not a forked shell).  
- PDF-as-middle-pane master–detail (`ManualLibrary` current layout).

### Phase 5 — Products pairing → Desk

**Target UX (user-specified)**

- Left: Saved views (unmatched / channel / status).  
- Middle: LedgerGrid of pairing rows (select · SKU · unmatched ids · channels…).  
- Top Add → right rail “add / pair” form.  
- Row select → right rail **exact pairing editor** (extract from `ProductHubPanel` into rail form atoms).

**Delete**

- `PairingQueueList` as left map.  
- Full-pane `ProductHubPanel` as middle (hub becomes the right inspector content).

### Phase 6 — Sweep + dead code

After Phases 1–5 verify green:

1. **kniple** every unused export from deleted boards/rails/printers.  
2. Grep for leftover `SupportTicketsBoard`, `ProductLabelsRecentRail`, `LabelRoomSidebar` as primary maps.  
3. Promote Incoming + Ready left rails to saved views (cheap wins — surfaces partially exist).  
4. Align `/shipping/labels` to the same Desk recipe (follow-up OK if time-boxed).  
5. Add a **guard test**: Desk spine pages + Labels hub + Products `labels|manuals|pairing` must mount LedgerGrid + a saved-views left consumer (allowlist Station floors + genuine Monitor pages).

### Phase 7 — Verify

```bash
npm run verify
```

Fix every gate. Never raise ratchet baselines. Never `--no-verify`.

---

## 4. Implementation playbook (per surface)

For **each** Phase 1–5 surface, do this checklist — no shortcuts:

1. **Column model** — `*-grid-layout.ts` with `frozen` identity prefix (`select` + title/id). Use `resolveGridColumnAlign`.  
2. **Descriptor** — `makeGridSurfaceDescriptor` + explicit `GridSurfaceCapabilities` (usually `multiSelect` / `fieldsMenu` / `inCellEdit` as appropriate; `rowTriageFlags` only if domain has triage wash SoT).  
3. **Grid view** — thin `*GridView.tsx` + `*GridRow.tsx` + `*GridColumnHeader.tsx` composing LedgerGrid atoms (copy Ready / My Day / Warranty pattern).  
4. **Register** mount in `grid-surface-capabilities.guard.test.ts` (+ tier/align guards if applicable).  
5. **Saved view surface** — add to `SAVED_VIEW_SURFACES` + SQL CHECK migration + `surfaces.test.ts` lockstep.  
6. **Left rail** — generalize `OutboundSavedViewsList` into a shared `SavedViewsList` (paramKeys + storageKey/surface) under `src/components/saved-views/` or design-system; mount via `SidebarShell` inside `ContextPanelLayout`.  
7. **URL selection** — `?ticket=` / `?location=` / `?sku=` / `?id=` / `?pair=` — durable; clear on mode change.  
8. **Right rail** — extract existing form/viewer into panel registered with `DetailStackRailRegistrar` or `useRegisterRightPanel`, **`modal: false`**. Add CTA opens same panel with create mode.  
9. **Delete** old board/rail/builder files once call sites are gone.  
10. **E2E** on QA org — table visible, saved view save/apply, row → right rail, Add → right rail.  
11. **`npm run verify`**.

---

## 5. Simplification mandate (dead code)

The success metric is **fewer patterns**, not more wrappers.

**Prefer delete over feature-flag.**

After migration, these classes of code should have **zero** Desk call sites:

- Page-local queue boards that reimplement row chrome  
- Left “recent printed / recent tickets / room list” as the primary navigator for Desk  
- Middle PDF viewers / Product Hubs / print wizards that block a spreadsheet map  
- Private `fixed right-0` detail panels  
- Second saved-views storage (localStorage, per-feature tables)

**Keep** (Station-only):

- `RecentActivityRailBase` / `SidebarRailShell` on floor stations  
- `StationWorkbench` / `StationComposerDock` / scan bars  

**Keep** (shared SoT):

- `LedgerGrid*`, `RightRailHost`, `ContextPanelLayout`, `useSavedViews`, `WorkbenchChromeHeader`

---

## 6. Anti-goals / do-not-touch

- Do not merge Station + Desk into one archetype.  
- Do not put LedgerGrid into Unbox/Testing scan middle as part of this work.  
- Do not raise knip / DS ratchet baselines to pass.  
- Do not invent Notion custom-table schema in this prompt (separate product track).  
- Do not reopen tabs-vs-saved-views or direction-vs-entity dashboard axis.  
- Do not start the Next dev server.  
- Do not commit unless the user asks.

---

## 7. Definition of done

- [ ] SoT docs describe Desk recipe as mandatory for listed surfaces  
- [ ] Support / Warehouse labels / Product labels / Manuals / Pairing each show: saved views left · LedgerGrid middle · non-modal right form  
- [ ] Hand-rolled boards/rails listed in §2.1 removed or reduced to atoms  
- [ ] New `SAVED_VIEW_SURFACES` values + CHECK migration + lockstep test  
- [ ] All new grids in capabilities guard MOUNTS  
- [ ] E2E coverage for at least Support + one Labels surface + Pairing or Manuals  
- [ ] `npm run verify` green  
- [ ] Work-log note in `docs/agent-log/entries/main.md` summarizing deletions  

---

## 8. Suggested first commit slice (if user asks to commit)

1. Phase 0 SoT docs only  
2. Shared `SavedViewsList` extracted from `OutboundSavedViewsList` (behavior-preserving)  
3. Support tickets grid + saved views + right rail (largest user-visible win)  
4. Remaining surfaces one PR each  

---

## 9. Quick file index — SoT modules to compose

```
src/hooks/useSavedViews.ts
src/lib/saved-views/surfaces.ts
src/components/unshipped/OutboundSavedViewsList.tsx   # extract → shared
src/design-system/components/grid/LedgerGrid.tsx
src/design-system/components/grid/grid-surface-descriptor.ts
src/components/right-rail/RightRailHost.tsx
src/components/right-rail/DetailStackRailRegistrar.tsx
src/components/layout/SidebarShell.tsx
src/components/layout/ContextPanelLayout.tsx          # verify path; context-panel-column SoT
src/design-system/components/WorkbenchChromeHeader.tsx
.claude/rules/display/workbench.md
.claude/rules/source-of-truth.md
.claude/rules/contextual-display.md
```

---

## 10. User quotes (acceptance language)

> Support tickets page does not display saved views on the left-hand side. It does not display from the source of truth table. It handrolls its own table component just for support tickets.

> Warehouse labels displays a pick a room on the left sidebar when it should be the saved views with a data table in the middle displaying all the locations and then an add button on the top context that will display a pushover right details panel for a scrollable form.

> Product label … most recent printed list in the left side bar when it should display a saved view … middle must be updated to a source of truth table display with selection … push out component for the label … on the right.

> Products manuals … data table display in the middle … saved views on the left … selection … manual push out from the right-hand side to be printed.

> Products pairing … saved views on the left … data table in the middle … on selection a right panel pop for the exact pairing.

> This is the exact pattern the entire codebase should follow instead of hand rolling its own patterns, and the codebase must be extremely simplified to fit this exact architecture.

Treat those quotes as acceptance tests.
