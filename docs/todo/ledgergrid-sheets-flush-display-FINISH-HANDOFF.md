# LedgerGrid Sheets flush — finish SoT + header height HANDOFF

**Status (2026-08-04):** Display geometry for Unbox golden is largely landed
(flush sheet plane, select-only freeze, single hairline seams, `h-10` factory
header). This handoff is **docs + residual exactness only** — not a new table
engine, not resize Phase 1, not Unbox procedure chrome.

**Do not redo:** flush hosts, sheet token, select-only freeze, triage seam,
`LedgerGridColumnHeader` → `h-10` (already live @1440).

---

## Paste this into a new session

> Read `docs/todo/ledgergrid-sheets-flush-display-FINISH-HANDOFF.md` (this file).
>
> **Job:** finish the Sheets flush *display method* in SoT so the next agent
> composes it without rediscovering Unbox, then close any leftover header-height
> exactness on the golden path.
>
> 1. **SoT docs (primary)** — grow, don’t fork:
>    - [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md)
>      → **Ops table / spreadsheet surface shell**: document the full recipe in
>      one place — `TABLE_SURFACE_SHEET_CLASS` + `WORKBENCH_SHEET_HOST` +
>      `WORKBENCH_SHEET_CHROME`; one hairline per seam (upper owns bottom / lower
>      owns no top); column header band is **`h-10`** (same as Unbox chrome
>      bands); Receiving freezes **`select` only** (operator-editable freeze =
>      future). Map row already mentions sheet tokens — deepen the detail
>      section so CLIP vs SHEET choice is unambiguous.
>    - [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md)
>      → Unbox chrome/triage: drop stale “`cornerClass('card')` island” wording;
>      point at flush sheet chrome (`border-l-0` / rail-abutting, `gap-0` bands,
>      triage = `border-r` only).
>    - Optional one-liner in [`AGENTS.md`](../../AGENTS.md) only if a new hard
>      law is missing (prefer SoT detail over AGENTS bloat).
> 2. **Header height residual** — factory is already `h-10` in
>    `LedgerGridColumnHeader`. Confirm Unbox triage + grid header still match
>    at `:3050` `/unbox` @1440. **Do not** force Orders’
>    `OrdersQueueColumnHeader` (`min-h-11`) onto `h-10` unless explicitly asked
>    — Orders is the permanent fork.
> 3. **Guards** — keep
>    `receiving-grid-sheet.guard.test.ts` green; add/adjust only if SoT claims a
>    new pin the guard doesn’t already cover.
> 4. **Verify** — `npx tsx --test src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts`
>    + `npm run verify` (or `--fast` while iterating; full verify before done).
>    Attach `:3050` — never start/restart the dev server.
>
> **Non-goals:** second table engine; Phase 1 resize unlock; body row density;
> squaring every family; Unbox AI→Claim residual; procedure deck.

---

## Already landed (cite, don’t rediscover)

| Piece | Where |
|---|---|
| Sheet token (no radius / lift, `border-l-0`) | `src/design-system/tokens/table-surface.ts` → `TABLE_SURFACE_SHEET_CLASS` |
| Flush hosts | `WORKBENCH_SHEET_HOST` · `WORKBENCH_SHEET_CHROME` in `workbench-shell.tsx` |
| Golden mount | `ReceivingGridView` → `LedgerGridSurface` `surface="sheet"` |
| Select-only freeze | `receiving-grid-layout.ts` (`order` / `title` scroll) |
| Single seam under search | `UnboxTriageBand` = `border-r` only; sheet keeps `border-t` |
| Header `h-10` | `LedgerGridColumnHeader` row + select + fact cells |
| Guards | `receiving-grid-sheet.guard.test.ts` |

Live smoke already proven @1440: context↔sheet gap 0; triage bottom = sheet top;
header height = triage height (40px); select/Order bottoms aligned.

---

## Done when

- SoT (map + Ops table section + workbench-ops-queue Unbox chrome) describes the
  Sheets flush recipe so an agent can mount another family without inventing gutters.
- Unbox header/triage/grid heights still match; sheet guards green; verify green.

---

## Related (next)

Trailing `+` column track + Column display in Unbox triage (replaces corner
gutter trigger):
[`ledgergrid-add-column-track-HANDOFF.md`](./ledgergrid-add-column-track-HANDOFF.md).
