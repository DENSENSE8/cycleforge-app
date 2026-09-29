# HANDOFF — Remove the desk Floor (industrial) display; desks are triage-only (written 2026-09-28)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the ground
truth it relies on (code read 2026-09-28 at `469de5ad6` + working tree; other sessions edit this
tree — re-read before every edit). Dev origin `http://localhost:3050` only (AGENTS.md §1).

## 0. Status — LANDED 2026-09-28 (the §2 census below is history)

Owner addition, same day: the industrial edge-to-edge look is only for **mobile action** — phone and
iPad, taking the next action on a warehouse task. The **Daily** page is triage on desktop and mobile.

| Piece | Now |
|---|---|
| Stage | `DeskStageView = 'in-place' \| 'split'`. Floor view, ⌘/Ctrl+Shift+F, `useDeskFloorFace`, `publish/useDeskFloorActive`, `DESK_FLOOR_*` tokens, the `flush` industrial desk frame (`DeskIndustrialBar`), the header `segment` face and `SlicedActionDock` `segment` chrome are deleted. The split chord tests replace the floor chord tests (`DeskStageContext.test.ts`) |
| Modes | `resolveRegionMode(requested, routeMode, {form})`: the route decides, with no device or coarse-pointer collapse. `runtime` is gone (`/shipping`, `/shipping/label-intake` → triage). `/m/*` operation flows are `industrial` (scan, pack, scan-out, unbox, unit, location count/pair, FNSKU, repair-scan); reading flows are triage (`/m/home`, `/m/orders`, `/m/work`, `/m/pick`, forms). The table is in `mode-registry.ts` / `mode-registry.test.ts` |
| Desk lists | To ship, Picking and **Daily** use multi-row `RecordCard` lists. Unboxed, Deliveries and Imports use cards. Stock, QC labels, Replenish and Shipped use `TriageCardList density="row"` (`TriageRow`) |
| Deleted | `DockedReceivingRecord`, `IncomingDeliveryRecord`, `ReplenishmentPlanRecord`, `ShippedPackageRecord`, `AgendaRecord`, `useDailySmoothScroll` |
| Orphaned (delete once another session's diff lands) | `OutboundOrdersLedger.tsx`, `OutboundOrdersLedgerToolbar.tsx`, `OrdersLedgerStandIn` |
| Guard | `eslint.config.mjs` "Desk industrial-ledger guard": `RecordLedger` and the `IndustrialRecord` component are banned in `src/app` / `src/components` / `src/features` outside `src/app/m/**` and `src/components/mobile/**`. The burn-down list is empty |
| Laws | BRIEF §14 (Mode D struck in §12, the Floor line struck in §13), `HANDOFF-lane-mode-policy.md` §0, `MODE-SPLIT-INVENTORY.md` Floor rail withdrawn, `RECORD-CARD-MIGRATION.md` floor verdict withdrawn, `DESIGN_SYSTEM.md` task modes, `pinned.json` DeskStageContext |

Behaviour change to confirm with the owner: on Daily's card face, the checkbox **selects** the
record like every triage card. Ticking an item done is select → **Mark done** in the select bar, or
the record's own Check off; previously the row's circle ticked it directly.

## 1. Owner ruling (2026-09-28, verbatim intent) — supersedes `HANDOFF-lane-mode-policy.md` §1

> Remove the Floor / industrial display across the entire desktop. Show the floor display only on
> the mobile operations — the industrial warehouse floor itself.
> - **Desktop** is a very user-friendly interface: the **In place** and **Split** toggle, consistent
>   across the whole desktop codebase. No Floor.
> - **Phone** splits by job:
>   - **operations** (moving a thing from one operation to the next — unbox, scanning, updating the
>     stock count): **industrial**, edge to edge, exact pressable next step, muscle memory;
>   - **reading** (a task, importing inbound orders, anything a desk would show): the **triage**
>     design system, custom hand-built for mobile.
> - There must be a **user-friendly data-table display method that is one row and edge to edge** —
>   friendlier than the Google-Sheets-like and the old Excel-like data tables.
>
> This is a deep readout task: remove the Floor / industrial display method in general, keep only
> In place / Split on desktop.

What this withdraws:
- `HANDOFF-lane-mode-policy.md` §1 "data lanes display in BOTH systems" (Floor on every dual lane desk).
- BRIEF §12 Mode D (user-invoked industrial view on desktop) and the Floor half of
  `MODE-SPLIT-INVENTORY.md` owner decision 6.
- `RECORD-CARD-MIGRATION.md` verdict **floor** (industrial ledger, Ctrl/⌘+Shift+F) — no desk mount keeps it.

What stays: the industrial mode itself (tokens, `IndustrialRecord`, `RecordLedger`) for `/m/*`
operation flows and scan stations' phone twins; BRIEF §5 invariants (state colours, codes, scan bar).

## 2. Where the desk Floor lives today (census, 2026-09-28)

| Piece | Where |
|---|---|
| Record-view union `'in-place' \| 'split' \| 'floor'`, setter, persistence | `src/design-system/components/DeskStageContext.tsx` (`DeskStageView`, `isDeskFloorChord`, `DESK_FLOOR_SHORTCUT_HINT`) + `DeskStageContext.test.ts`; per-staffer stored desk view `src/lib/settings/registry.ts` (`DESK_VIEW_DESKS` — note: "Floor is a session posture and is never stored") |
| The toggle (In place · Split · Floor radiogroup) | `src/design-system/components/DeskRecordViewSwitch.tsx:78-81` |
| Floor chord binding + chrome | `DeskPageChrome.tsx`, `DeskStageOverlay.tsx`, `DeskRecordPlane.tsx` (`beside` = split \|\| floor; `DESK_FLOOR_LIST_CLASS` / `DESK_FLOOR_RAIL_CLASS` in `src/design-system/tokens/desk-stage.ts`) |
| Industrial ledger mounts on DESKS (each must move to the triage list or the new one-row list) | `components/outbound/orders/OutboundOrdersLedger.tsx` (+ `OutboundOrdersLedgerToolbar.tsx`, `UnshippedTable.tsx`, `dashboard/OrdersQueueFirstPaint.tsx` SSR stand-in), `components/inventory/stock/StockLedger.tsx`, `inventory/qc-labels/QcLabelsLedger.tsx`, `receiving/history/DockedReceiptsLedger.tsx`, `receiving/incoming/IncomingDeliveriesLedger.tsx`, `replenish/ReplenishmentNeedTable.tsx`, `shipped/ledger/ShippedLedger.tsx`, `station/ReceivingLinesTable.tsx`, `features/home/DailyAgenda.tsx` (+ `features/home/grid/daily-table-definition.ts`, `features/tasks/grid/tasks-table-definition.ts`), `components/exceptions/**` (being moved to `TriageCardList` in the same session that wrote this) |
| Floor chord / floor-aware call sites | `components/dashboard/DashboardOrdersView.tsx`, `components/sidebar/rail-shell/RailRow.tsx`, `lib/scan-hotkey/store.ts`, `components/photos/PhotoLibraryFindRow.tsx`, `components/tables/DataTable.tsx`, `design-system/components/triage-card-list/TriageSelectBar.tsx` |
| Route → mode (desk routes declared `runtime` so Floor can flip them industrial) | `src/lib/routing/mode-registry.ts:71,74` (`/shipping`, `/shipping/label-intake` = `runtime`); `/m/*` industrial entries `:85-93` stay |
| Mode resolution / phone collapse | `src/design-system/providers/ModeRegion.tsx` (`resolveRegionMode`) |
| Law text to rewrite | `docs/design-system/BRIEF.md` §12–13, `HANDOFF-lane-mode-policy.md`, `MODE-SPLIT-INVENTORY.md`, `RECORD-CARD-MIGRATION.md`, `src/design-system/pinned.json` (Floor / RecordLedger / DeskRecordViewSwitch entries), `DESIGN_SYSTEM.md` § Task modes |

## 3. Target model

- **Desktop** — every desk list is either
  - the **triage card list** (`TriageCardList`, the Allocate desk's list: multi-line cards, triage
    numbering "N · 1–100 of N", pager, status chips), or
  - the new **one-row list** (below) where one line per record is the job;
  and every desk offers exactly **In place / Split** (⌘/Ctrl+Shift+S). No Floor radio, no
  ⌘/Ctrl+Shift+F, no `runtime` desk routes.
- **Phone** — `/m/*` operation flows (scan kernel, unbox, pick, pack, stock count / pair, scan-out)
  stay **industrial**, edge to edge, big pressable next step. `/m/*` reading flows (tasks, daily,
  imports, order management, exceptions hub) render the **mobile triage** faces.
- **One-row edge-to-edge list** — a design-system display method, NOT a spreadsheet: one record =
  one full-bleed row (hairline divider, no cell borders, no column resize/reorder chrome), a fixed
  fact order read left → right (state badge · identity · title · 2–4 key facts · right-aligned next
  step), hover/selected row wash, keyboard J/K + Enter opens the record through `DeskRecordPlane`
  (In place / Split). It is a **density of `TriageCardList`** (same data model, selection bar,
  numbering, chips, record plane) — `density="row"` — not a new table. Keep-sheet mounts
  (`RECORD-CARD-MIGRATION.md` keep-sheet list: columns are the job) keep `DataTable` until the owner
  moves them.

## 4. Phases (each proven in the browser before the next)

1. **Readout** — list every desk mount, its current look (triage / Floor ledger / sheet), and its
   target (card list / one-row / keep-sheet). Owner signs off the table before any code.
2. **Primitive** — add `density="row"` to `TriageCardList` (one-row face) with the same selection,
   numbering, chips and record plane. `ds_contract`/`ds_critique` it; pin it in `pinned.json`.
3. **Remove Floor** — delete `'floor'` from `DeskStageView`, the switch option, the chord, the floor
   classes and `beside`'s floor arm; migrate each desk ledger mount to the card list or one-row list;
   turn `runtime` desk routes into `triage`; delete now-dead ledger code on desks (the industrial
   primitives stay for `/m/*`). Clean cutover: no alias, no hidden Floor flag.
4. **Phone split** — audit `/m/*` routes in `mode-registry.ts`: operation flows `industrial`,
   reading flows mobile triage; fix any reading flow painting industrial.
5. **Laws + docs** — rewrite BRIEF §12–13, the lane-mode policy, MODE-SPLIT-INVENTORY,
   RECORD-CARD-MIGRATION verdicts, DESIGN_SYSTEM § Task modes, `pinned.json`; add a lint/guard that
   fails a `RecordLedger` / `IndustrialRecord` import outside `src/components/mobile/**`,
   `src/app/m/**` and the design system itself.

## 5. Acceptance

- `rg "'floor'" src` finds no desk record-view value; ⌘/Ctrl+Shift+F does nothing on any desk.
- Every desk: toggle shows exactly In place · Split; screenshots (1440×900) of each desk in both.
- The one-row list: screenshots next to the card list for the same data; J/K/Enter/Esc work and Esc
  returns focus to the row.
- `/m/scan`, `/m/pick`, unbox, stock count still paint industrial; `/m/home`, tasks, imports,
  exceptions paint mobile triage (screenshots at 390×844).
- Guard fails on a planted desk `RecordLedger` import, passes after removal.
- `pnpm verify:fast` green.

## Prompt

> You own removing the desk Floor (industrial) display in CycleForge. Read
> `docs/design-system/HANDOFF-remove-desk-floor.md` first, then every file in its §2 census. Work on
> :3050 only, in managed browser tabs; other sessions edit this tree — re-read before each edit and
> touch only your lines.
>
> Owner ruling (§1): desktop is triage-only with an **In place / Split** toggle everywhere — no Floor;
> the industrial display lives only in `/m/*` operation flows (edge to edge, pressable next step);
> `/m/*` reading flows use the mobile triage design; add a user-friendly **one-row edge-to-edge list**
> as a density of `TriageCardList`, friendlier than the sheet/Excel tables.
>
> Do, in order, proving each in the browser before the next:
> 1. §4.1 readout table (every desk mount → target). Stop and ask the owner to sign it off.
> 2. §4.2 the one-row density of `TriageCardList`.
> 3. §4.3 remove Floor everywhere and migrate each desk mount; clean cutover.
> 4. §4.4 phone operation vs reading split.
> 5. §4.5 laws, docs, `pinned.json`, and the desk-`RecordLedger` guard.
> 6. `pnpm verify:fast`.
>
> Report as a table: desk, before, after, screenshot, files changed.
