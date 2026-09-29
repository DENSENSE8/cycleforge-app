# Batch printing polish (Uploads) + Print station › FNSKU labels (completed 2026-09-29)

Paste the **Prompt** at the bottom into a fresh session. Other sessions edit this worktree
concurrently: re-read every file right before editing, never revert what you did not write, never
commit or stage without asking. Dev origin `http://localhost:3050` only (`AGENTS.md` §1).
Earlier history: `HANDOFF-labels-docs-buy-label.md` §6 (Buy a label: done + proved).

## 1. Uploads batch printing polish — completed

Surface: `/shipping/label-intake` bare route = **Uploads** — `src/features/labels-docs/LabelBatchesDesk.tsx`
(record header verbs, check state), `BatchCard.tsx` (the rail card), `BatchPages.tsx` (pages inline).

1. **One label → no "Print all" CTA.** `recordActions` (LabelBatchesDesk ~l.372–403) always paints
   `Print all {pages.length}` + the ink `Print N` / `Check a label`. When the batch has ONE page,
   show only the single print verb. (Check whether the Labels view desk `LabelsDocsDesk.tsx` has the
   same N=1 redundancy and apply the same rule if so.)
2. **One label → auto-checked.** The check seed (~l.168–177) checks only UNPRINTED pages on open, so
   a one-page batch that was printed before opens with nothing checked and the CTA reads
   "Check a label". Rule: a batch with exactly one page opens with that page checked (a reprint then
   goes through the existing reprint-warning dialog, `reprintWarning` in `use-desk-press.ts`).
3. **Hover bubble renders under other layers.** The `HotkeyScrim` on the Print CTA
   (`HOTKEY_SCRIM_HOST_CLASS`, `@/design-system/primitives/HotkeyScrim`) and the per-page Print /
   check hovers are clipped or painted below the record header / stage. Find the stacking context
   (the record header band from `DeskStageRecordHeader` / `DeskRecordPlane`, `overflow-hidden`
   parents, `isolate`) and fix it with the design system's z-index tokens (`ds_tokens z-index`),
   never a literal `z-[…]`. Verify the bubble is visible on hover at :3050 with a screenshot.
4. **Rail card progress bar narrower.** `BatchCard.tsx` ~l.86–96: the bar takes the width and the
   `N printed · last <date time>` text truncates. Give the bar a fixed, smaller width so the full
   last date + time reads in the left rail.

Owner rulings that still stand (do not undo): ✕ is the top-right-most control; record titles are
screen-reader only; label previews are square; batch verbs sit in ONE header row at the right;
reprints ask first ("Print again?").

Completed and proved at `:3050`: one-page batches expose one print verb, auto-select their only
page even after a prior print, show the full last-printed timestamp beside a narrower progress bar,
and portal hover bubbles to `document.body` at `z-tooltip` so transformed/isolated stage ancestors
cannot clip them. The portal requirement is also pinned in the central Design System MCP server.

## 2. Print station › FNSKU labels — completed

Owner goal: from the LEFT CONTEXTUAL SIDEBAR's Find, reach any FNSKU, choose the print station at a
packer's table, set an exact quantity, print there silently (the existing `fnsku` station job).

**Built and proved on :3050 (2026-09-29, every write intercepted, Ably job captured + dropped):**
- Top-level nav row `print-station` (`kind: 'top'`, `requires: 'print.label'`) right after
  Exceptions — `src/lib/sidebar-navigation.ts` (APP_SIDEBAR_NAV + SIDEBAR_PAGE_NAV children
  `fnsku` "All FNSKUs" / `fnsku-reprinted` "Reprinted" under group "FNSKU labels"; a page needs ≥ 2
  views or the sidebar draws no panel and no page Find — `build.ts hasSectionPanel`,
  `ContextualSidebar` l.133), `pages.ts` (Find `?q=`), `rollout.ts` contextual, `parity.ts`,
  `nav-view-icons.ts`, `desk-page-routes.ts` (`view`, `q`, `fnsku`, `page`), `mode-registry.ts`.
  Pinned order tests updated (`sidebar-navigation.test.ts`, `command-bar-nav-groups.test.ts`;
  `resolve.test.ts` already expected "Print station").
- Route `src/app/print-station/page.tsx` (DeskPageLayout bare + SurfaceParamHygiene — without the
  desk frame the record plane renders nothing), query `src/lib/print-station/fnsku-queries.ts`,
  types `fnsku.ts`, list `src/features/print-station/FnskuPrintDesk.tsx` (rows keyed by a per-load
  ordinal; `?fnsku=` is the real key), record `FnskuPrintRecord.tsx` (real label preview via
  `fnskuLabelPreviewUrl` in `src/lib/print/fnskuLabel.ts`, quantity 1–99 with quick counts + exact,
  every org station with who is at it, Print). `usePrintStations` gained `sendFnsku` (shared
  `sendStationJob`) and `lastSeenStaffId`.
- Proved: Find narrows server-side; an exact FNSKU auto-opens; local print logs
  `label_print_jobs` (`fba_fnsku`, copies N) and says "Printed N labels … here"; a remote station
  gets exactly `{grain:'fnsku', fnsku, copies}` on `org:{id}:printstation:{stationId}`; no ack →
  "did not answer … Nothing was printed"; state survives the post-print refresh.

**Final owner rulings applied and proved on :3050 (2026-09-29):**
1. `/print-station` uses the triage mode with no `labels-documents` look or industrial classes.
   Print is the primary action.
2. The FNSKU list uses default-density `RecordCard` cards: FBA state, Amazon channel, FNSKU
   identity, title, condition grade, and the next Print action. ASIN, SKU, and reprint-state facts
   are not painted. The obsolete `fnsku-print-lifecycle.ts` token was deleted.
3. Condition editing lives in the record's right panel. Choosing a condition redraws the label
   preview immediately; an explicit Save persists through `PATCH /api/admin/fba-fnskus/[fnsku]`.
   The list reads through React Query, the save patches every `PRINT_STATION_FNSKUS_KEY` cache
   entry optimistically with rollback/toast on failure, and printing invalidates that query prefix.
4. A selected station that disappears from a refreshed roster falls back to the default target,
   then the first available station. This was re-proved with the selected remote roster entry
   removed during a live `:3050` session.
5. `/inventory/stock` now uses triage `RecordCard` cards instead of the legacy one-row,
   industrial/monotone display.
6. Follow-up polish: the on-screen and HTML fallback label faces have no decorative frame;
   browser-scaled preview text is smooth and fallback typography uses print-stable point sizes.
7. A top-right **Add FNSKU** action opens the existing catalog fields as a fixed-width inline
   triage form above the cards.
8. The label title and selected print-station name are editable inline. Title edits redraw the
   label before persistence; station renames use the organization print-station registry.
9. The Print action is bottom-right under the station roster.
10. While an FNSKU record is open, its Back + FNSKU title band replaces the page-level
    **All FNSKUs** header and occupies the topmost desk-header position.
11. Printed condition text omits the internal house-grade prefix (`A`, `A+`, `B+`, and so on);
    the preview and both print paths show only Amazon's condition words in a smaller 600-weight line.

## 3. Verification result

- `pnpm verify:fast`: passed all 11 gates, including lint, generated route types/typecheck,
  tenancy, boundary, nav names, SKU identity, layer laws, tokens, and OpenAPI.
- Targeted ESLint over every changed repository source file: passed.
- Full `npx tsc --noEmit -p tsconfig.json --pretty false`: passed.
- Printing/labels/routing/nav target run: 333 passed, 6 unrelated nav assertions remain red.
  Existing mismatches are palette `home`/`studio` order, missing Scan Stations `pickup`,
  `ready-to-pack` expecting `/pick?ship=urgent`, and packer/deep-link child resolution.
- Central Design System MCP smoke suite: passed. A fresh `ds_tokens z-index --filter tooltip`
  process returns the new portal-plus-`z-tooltip` guidance.
- Live browser proof used `http://localhost:3050`, intercepted every non-read write, and dropped
  every Ably websocket before rendering Uploads, Print station, and Inventory stock.
- Follow-up browser proof intercepted the create, title PATCH, and station-name PUT. It confirmed
  live label redraw, an unframed/smooth preview, a 512px inline form, hidden page header, and the
  bottom-right Print action.
