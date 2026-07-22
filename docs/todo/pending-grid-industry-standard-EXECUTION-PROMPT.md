# Execution prompt — Pending grid: industry-standard data-driven spreadsheet

**Copy everything below the line into a fresh Claude Code (Fable 5) session.**
Repo: `cycleforge-app` · lane: `main` (WS-DOGFOOD) · surface: `/dashboard?unshipped`.

---

You are Claude Code (Fable 5) in the Cycle Forge monorepo with **fresh context**.

## Mission (one line)

Implement the **Pending / To Ship grid upgrade** exactly as specified in the master plan:
**`docs/todo/pending-grid-industry-standard-fable-prompt.md`** — read it in full before writing any
code. It is the contract; this prompt is only the bootstrap.

The master plan already contains (do NOT redo either):

- **Research digest (pre-gathered 2026-07-21, cited)** — adopted industry standards for column
  reorder, frozen columns, in-cell editing keys, corner indicators, chip editors, platform icons.
  Adopt them; web-search only where you deviate.
- **Codebase grounding (file:line audited 2026-07-21)** — verified facts about `LedgerGrid`,
  `ORDERS_QUEUE_COLUMNS`, `useOrderAssignment`, staff prefs, dnd-kit house patterns, the
  replenishment payload, and the listing-URL truth. Trust it; re-verify only files changed since.

## Locked decisions (already made — do not relitigate)

1. **Pending is grid-only.** No Board|Grid switcher, day bands, density chrome, column-hide UI, or
   drag-resize revival.
2. **Target column plan (purposeful cells):**
   `select · title · date · age · qty · condition · stock · platform · order · tracking` —
   `title` is the only flex track; the **`notes` column is deleted**; `stock` (replenishment
   metrics) takes its width; `platform` shrinks to a fixed icon track.
3. **`select` + `title` are locked left** (frozen + immovable, Airtable primary-field precedent);
   every other column is drag-reorderable (dnd-kit, house 6px activation, keyboard path), order
   persisted per staff in `tableColumns['orders'].order` preserving sibling `hidden`/`widths`.
4. **Notes + OOS = corner indicators on the frozen Product cell** (Phase 4b): note = slate triangle
   top-right, OOS = rose triangle top-left; hover = exact text via `HoverTooltip`; click (or
   Shift+F2) = cell-anchored editor; `canOos` gate stays. No row-height changes, ever.
5. **Condition = chip-as-trigger dropdown** (`ConditionGradeChip` is the button; listbox over
   `conditionOptions()`; quiet `— ⌄` when empty). Ship-by / Qty / Title = Sheets-style in-cell
   editors per the keyboard contract table in the plan (Enter/F2/typing start · Enter/Tab/blur
   commit · Esc revert).
6. **All editors commit through `useOrderAssignment`** (payload already supports every field).
   "Edit listing link" edits **`item_number`** (URL is derived — see plan's Listing URL section);
   a stored URL column is ask-first.
7. **Platform = fixed-size monochrome brand icons** (Simple Icons CC0, vendored into the repo;
   lettermark fallback for fba/goodwill/other) — grow `SourcePlatformMeta` + `PlatformMark`,
   never fork.
8. **OOS is data-driven**: `stock` column shows shortfall/status/PO from `replenishment_*` fields
   only; free-text `out_of_stock` reason lives only in the indicator hover; quiet-empty when in
   stock. No fake numbers; stock-on-hand join is ask-first.

## Hard rules

- Obey `AGENTS.md` + `.claude/rules/ui-design-system.md` + `.claude/rules/source-of-truth.md`.
  Kinetic Ledger tokens only; dates via `src/utils/date.ts` (calendar widgets:
  `dateKeyToLocalDate`/`localDateToDateKey`); conditions via SoT; no page-local hex or z-index.
- **Do not commit or stash.** The working tree has unrelated in-flight changes — leave them
  untouched; stage/edit only files you own for this task. The user manages commits.
- Keep the existing e2e guardrails green (`to-ship-pending-grid.spec.ts`,
  `orders-queue-skin-scoping.spec.ts`) — update the notes-cell assertions in the same change that
  deletes the column. The airtable skin must not leak to Packed.
- `npm run verify` green before claiming done; append a work-log entry per landed unit
  (`pnpm worklog "…" --result …`).

## Order of work

1. `pnpm worklog:tail` → read the **master plan in full** → skim the current
   `OrdersQueueTableRow` / `OrdersQueueColumnHeader` / `OrderGroupSummary` render paths.
2. **Phase 2** — column reorder (cell-renderer registry + `ordersQueueGridTemplate(order?)` +
   sanitizer + dnd-kit + prefs persistence).
3. **Phase 3** — platform brand icons.
4. **Phase 4** — in-cell editors (build one `LedgerCellEditor` shell with typed variants).
5. **Phase 4b** — corner indicators; delete the notes column; retire `RowInlineEditBubble`.
6. **Phase 5** — `stock` metrics column.
7. **Phase 6** — dogfood org 01: run the full 22-row browser matrix in the plan on a real testing
   order; screenshots under `test-results/`; extend unit + e2e coverage as specified.
8. Update `docs/todo/pending-grid-minimal-simplify-handoff.md` to the new contract (it is stale on
   column order — fix that too), fill the plan's "Compound opportunities" section, write the
   work-log entry.

Definition of done = the Phase 7 checklist in the master plan, every box checked.
