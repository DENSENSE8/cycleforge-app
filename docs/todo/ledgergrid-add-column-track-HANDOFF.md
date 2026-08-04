# LedgerGrid — trailing + column track + Column display in triage HANDOFF

**Status (2026-08-04):** Sheets flush geometry is landed (flush plane, select-only
freeze, `h-10` header/rows, overscroll hard-stops). This handoff is the **next
display method** for column discovery on the Unbox/Receiving golden — not a new
table engine, not resize Phase 1, not procedure chrome.

**Do not redo:** `TABLE_SURFACE_SHEET_CLASS`, `WORKBENCH_SHEET_*` hosts,
select-only freeze, triage seam (`border-r` only), factory/row `h-10`,
`overscroll-*-none` on LedgerGrid.

---

## Paste this into a new session

> Read `docs/todo/ledgergrid-add-column-track-HANDOFF.md` (this file).
>
> **Job:** on Unbox/Receiving Sheets, put column discovery where a spreadsheet
> expects it — a trailing empty `+` track in the grid, and Column display in the
> triage band under the KPI row — then retire the floating top-right gutter
> trigger. Grow SoT; do not fork a second Fields rail.
>
> ### Locked product shape
>
> ```text
> Unbox chrome (pinned)
>   Band 1  tabs · Returns bin | Unbox
>   Band 2  KPI tiles
>   Band 3  triage  [search …] [staff · sort · week] [▤ Column display]   ← NEW door
> Sheet
>   | select | … fact columns … | [+] |   ← trailing empty track; header = + only
> ```
>
> 1. **Trailing empty column (in-grid)** — after the last fact column on
>    Receiving/Unbox: narrow track (`minmax(2rem,2rem)`), **header cell = `+`**,
>    body/summary cells empty. Part of sheet content width (h-scroll includes
>    it) — **not** a page gutter and **not** `pr-9` on the header row. Key e.g.
>    `add` / `_add`: not in Fields list, not sortable, not frozen. `+` calls
>    `useOpenGridColumnDetails()` (seed first hidden optional key when useful).
>    Prefer a **dedicated trailing add cell** in the Receiving header adapter /
>    row render — do **not** smuggle `onOpenColumnDetails` onto
>    `LedgerGridColumnHeader` (factory guard bans it).
> 2. **Remove** the floating top-right `GridColumnDetailsTrigger` over the card
>    corner (`GridColumnGutter` hover reveal). Keep the gutter (or rename) as
>    **context + `GridColumnDetailsPanel` mount only**.
> 3. **Move Column display (`ColumnsThree`)** into **Unbox triage**
>    (`UnboxTriageBand` — band **below the KPI row**), right cluster beside
>    refine controls. Same open API / same rail.
> 4. **Provider altitude** — lift `GridColumnGutter` (open context + panel)
>    **above** Unbox chrome + sheet so triage and the `+` header share one
>    `useOpenGridColumnDetails`. Prefer one provider over prop-drilling through
>    the controls slot.
> 5. **`+` and ▤ share one rail** —
>    `GridColumnDetailsPanel` (`detail:grid-column-details`). “Add column” =
>    show a hidden optional track / open the rail — **do not** invent ad-hoc
>    column types.
> 6. **SoT (required evolution)** — current law says Column display is not page
>    chrome and the sole entry is hover `GridColumnGutter`. Update:
>    - [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md)
>      map + Grid column visibility section
>    - [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md)
>      “Column display is NOT chrome…” — Unbox triage is **data-table chrome**
>      for the same grid; in-grid `+` replaces the corner hover door. Do not
>      leave “sole entry = gutter” prose lying.
> 7. **Guards** — update gutter/E2E expectations that assumed hover-only corner;
>    pin triage ▤ marker + no corner trigger on Receiving golden; extend
>    `receiving-grid-sheet.guard.test.ts` (or sibling) for the `add` track +
>    triage door.
> 8. **Verify** — sheet/gutter guards + `npm run verify` (or `--fast` while
>    iterating; full before done). Attach `:3050` `/unbox` @1440 — never
>    start/restart the dev server.
>
> **Smoke @1440:** no corner ▤; triage ▤ opens the rail; h-scroll shows trailing
> `+` and it opens the same rail; select-only freeze + overscroll hard-stops
> unchanged; header/row/triage still `h-10`.
>
> **Scope:** Unbox/Receiving golden first. Do **not** force Orders
> (`OrdersQueueColumnHeader` fork) or every LedgerGrid family in the same PR
> unless the DS track is clearly portable.
>
> **Non-goals:** Phase 1 resize unlock; inventing custom columns; procedure
> deck; restoring Fields on `WorkbenchTrailingCluster`; second table engine;
> undoing Sheets flush.

---

## Already landed (cite, don’t rediscover)

| Piece | Where |
|---|---|
| Sheet token / flush hosts | `TABLE_SURFACE_SHEET_CLASS` · `WORKBENCH_SHEET_HOST` · `WORKBENCH_SHEET_CHROME` |
| Golden mount | `ReceivingGridView` → `LedgerGridSurface` `surface="sheet"` |
| Select-only freeze | `receiving-grid-layout.ts` |
| Header + row `h-10` | `LedgerGridColumnHeader` · `ReceivingGridRow` / summary |
| Overscroll hard-stop | `LedgerGrid` `overscroll-x-none` · `overscroll-y-none` |
| Gutter + rail (today) | `GridColumnGutter` wraps `LedgerGridSurface`; trigger floats top-right |
| Open API | `useOpenGridColumnDetails` · `useGridColumnFieldsApi` (header menus already) |
| Unbox triage | `UnboxWorkspaceHeader` → `UnboxTriageBand` (`right` / controls slot) |
| Factory guard | `ledger-grid-column-header.guard.test.ts` bans `onOpenColumnDetails` on factory |
| Sheet guards | `receiving-grid-sheet.guard.test.ts` |

Prior Sheets flush handoff:
[`ledgergrid-sheets-flush-display-FINISH-HANDOFF.md`](./ledgergrid-sheets-flush-display-FINISH-HANDOFF.md).

---

## Implementation outline (follow-on)

1. **Provider split** — `GridColumnGutter` keeps context + panel; stop rendering
   corner `GridColumnDetailsTrigger`.
2. **Triage trigger** — mount `GridColumnDetailsTrigger` in triage `right`
   (same open context; provider above chrome+body).
3. **Add-column track** — Receiving model trailing key; header `+`; empty
   leaf/summary cells; include in `contentMinWidthRem` / width var.
4. **SoT + guards** — rewrite sole-entry / not-chrome prose; pin new doors;
   retire hover-corner E2E assumptions.
5. **Orders** — leave alone unless explicitly asked.

---

## Done when

- Unbox triage shows ▤ and opens `GridColumnDetailsPanel`; card corner trigger
  is gone.
- Sheet has a trailing empty `+` column track that opens the same rail.
- SoT describes the new doors (triage + in-grid `+`); old “sole entry = hover
  gutter” wording is gone or scoped as historical.
- Guards + verify green; smoke @1440 matches the shape above.
