# CONTINUE PROMPT — slot-table select gutter (paste this into a fresh session)

You are picking up mid-iteration on the CycleForge slot data table's **select
gutter**. Read `docs/handoff/slot-table-select-gutter-HANDOFF.md` first — it
carries the vocabulary, the files, the shipped rulings and the known-red list.
Do not re-derive any of it.

## Lane / environment

- Repo: `~/Projects/cycleforge-lanes/prod`, branch `prod/worktree-2026-09-11`.
- Dev server for this lane: **http://127.0.0.1:3077** (`daily-dev` process).
  Playwright storage state: `tests/.auth/admin.json`. Import `chromium` from
  `@playwright/test`, run the script from the repo root, delete it after.
- Design MCP now serves THIS lane (`.cursor/mcp.json` +
  `tools/design-mcp/cursor-plugin/mcp.json`). The already-running MCP process
  keeps its old target until the client restarts it, so until then use the CLI:
  `node tools/design-mcp/ds.mjs contract|tokens|critique …`.
- Before any `src/**/*.{tsx,jsx,css}` write: `ds_contract` / `ds_tokens` /
  `ds_critique` (or the CLI equivalents) — the PreToolUse hook gates on a fresh
  session stamp.

## Where the work stands

Shipped and verified in the browser (rest vs hover, measured geometry):
contextual gutter (status at rest ⇄ checklist on reach), urgent+shortage mark
ROTATION on one shared rAF clock, red pulsing rail for exception/out-of-stock,
cell-owned full-height rail, leaf detail chevron hidden while closed, parent
fold chevron hidden in BOTH states (hover only), gutter content inset past the
3px rail, fold-band selection wash via `ledgerRowFillClass`, and the band's
status pill rolling up `resolveRowStatus(row, queueMode)`.

**Pin ruling (2026-09-15, final).** The mark is PINNED TO THE TOP
(`COMPOUND_GUTTER_MARK_TOP_PIN_CLASS`) and the drop-down sits BELOW it in
`COMPOUND_GUTTER_CHEVRON_BAND_CLASS`. A pass read *"centered in the middle"* as
the middle of the 48px row and floated the mark there; the operator reverted it.
"Centered" was the horizontal track. Both select gutters (leaf + fold band) no
longer mount `COMPOUND_TWO_LINE_CLASS` — the mark plane is the whole cell and
the chevron is absolute. Measured from the gutter's top: square / status box
4–20 (cy 12), chevron band 23–47 with the glyph at 27–43. Group CHILD rows
carry the same chevron; child-level detail grows there next.

**Gate state on this tree (2026-09-15, after the fold-mark pass).** The cohort's
own law is GREEN: `eval:cohort slot-table` reports `tripwire: true` with 45/45
engine peers, and all 131 tripwire tests pass
(`slot-table-*`, `table-engine-law`, `compound-select-gutter-context`,
`compound-gutter-flush`, `receiving-group-child-rail`). `ds_contract` resolves
the child-rail and fold-close questions to `compound-row-chrome`; design-mcp
smoke is clean.

The cohort's OVERALL verdict is `ok: false` / `verify: false` for a reason that
is NOT this work: `verify:fast`'s typecheck fails on OTHER LANES' uncommitted
WIP. The foreign set as of the action-strip pass (all mid-edit, all growing
during this session, none touched here):

- `src/lib/jobs/google-sheets-transfer-orders.ts:496` — TS2353
  `'unboundColumns' does not exist in type 'GoogleSheetsTransferOrdersJobResult'`
- `src/lib/picking/pick-list.ts:228` — TS2353 `'imageUrl'`
- `src/app/reports/page.tsx:74/190/247` — missing `staff` key, column-model
  mismatch, missing `DeadStockReportTable`
- `src/components/mobile/redesign/MobileToShipRow.tsx:48` — TS2304
  `getExternalUrlByItemNumber` (appeared after the strip pass)

Excluding those four files (plus the stale `.next/dev/types/validator.ts`
artifact a killed dev compile leaves behind), `tsc --noEmit` is clean over
every file this lane touched — strip, gutter, fold marks, unshipped patch,
tests. `cursor-eval --fast` PASSED at 11:20 UTC before the first of those
edits landed, and the boundary baseline moved 67 → 68 in the same window —
concurrent lanes, not drift here. Re-run the gate once those files compile; do
not "fix" them.

NOTE on the last entry: `MobileToShipRow` is the **mobile** To-ship surface —
the other lane is mid-edit on the same verbs this pass relabelled on the desk.
When it lands, check `/m` parity against HANDOFF item 11 (the strip now reads
`Clear urgent` ⇄ `Mark urgent` as transition labels, `Report out of stock`
as a verb) so the phone and the desk don't drift apart on the same words.

**Re-run both gates after any edit here:**

```bash
pnpm run eval:cohort slot-table
node ~/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast
```

The cohort now runs the gutter/fold mounts as tripwires
(`compound-select-gutter-context.test.ts`, `compound-gutter-flush.test.ts`,
`receiving-group-child-rail.test.tsx`), so a broken mark fails the cohort rather
than waiting for a screenshot.

A dev server on **:3077** is what the browser proofs need. If the lane's
`daily-dev` is down, do NOT start a bare `next dev` — it boots without the
lane's DB env and every route 500s on the single-branch guard (`[db] …`
`describeBranchSplit`). Start it the way the lane does, with its env loaded.

If the cohort fails, it will be one of the 14 new `SLOT_TABLE_ENGINE_CONTRACT`
predicates in `src/lib/tables/slot-table-cohort.ts` greping the wrong file —
each predicate maps to exactly ONE file through
`slotTableEngineContractSource`, and the `default` case silently returns
`compoundCells`. Fix the mapping or the regex, never delete the law.

## Do not touch (other agents' uncommitted work)

- `src/lib/tables/field-catalog/unit-tsn-links.test.ts:230` (1 fail) —
  `orderId: null` vs `'55123'` in untracked `tsn-links-grid/`.
- `src/components/tables/compound/compound-row-model.test.ts` (3 fails) — the
  **Daily** family declares an extra `status:1` track; source is the modified
  `src/lib/daily-checks/daily-grid-layout.ts`. Clean at HEAD.
- `src/lib/kiosk/cart-compound-view.test.ts` (6 fails) — fails at HEAD too.
- `~/Projects/cycleforge-app` — same git remote, behind this lane. Never
  hand-port the design-mcp edits there; they conflict on merge.

## Next increments, in the order the operator is most likely to ask

1. **Select-track width.** Gutter is 24px (`COMPOUND_SELECT_TRACK_REM = 1.5`);
   the mark is centred in the 21px after the rail (measured 3.5px a side). If
   "still too far left" comes back, move the TRACK, not the padding — and
   measure the frozen-prefix shift on a second peer before committing.
2. **Selection feedback everywhere.** `useCompoundSpreadsheet.paintRow`
   hardcodes `selected={false}` and passes no `select` capability, so every
   generic compound peer is display-only. The first family to wire multi-select
   there must thread the selection model or it will tick boxes with no wash —
   the same gap the fold band had.
3. **Sibling fold bands.** Confirm `ReceivingGridGroupRow` (Unbox) and
   `PickupGridGroupRow` read identically — the engine band is shared, the Pickup
   group row is its own shell.
4. **Touch.** `(hover: none)` stands the square permanently, so the resting
   status face never paints on a tablet. If the floor wants the mark there, the
   answer is a wider track showing both, not a media-query fork.
5. **Rail on a two-mark row** paints the hottest fact only. If the bar should
   alternate with the glyphs, drive `CompoundEdgeRail` off
   `compoundSelectStatusMarks` — never add a second bar.

## Rules that must survive your edits

- One engine, no forks: `CompoundSelect` / `CompoundSelectStatusFace` /
  `CompoundEdgeRail` / `SlotTableGroupParentRow` serve every `PRODUCT_TABLES`
  peer. A change here ships to Receiving, Incoming, Ready, Kiosk, Reports…
  gate on data presence (`edgeMark` / `itemStatus`), never on a family name.
- Ordinary rows stay EMPTY at rest (2026-09-04 ruling against a glyph on every
  row). Never restore a faded check or a standing chevron.
- Buttons keep their full hit plane and `aria-expanded` label at every opacity —
  gate the GLYPH, never the control.
- One rAF clock: `edge-mark-pulse.ts`. No per-mount `animate`, no
  `animate-pulse`, and reduced motion must hold the hottest mark still.
- Geometry constants live in `compound-row-chrome.ts`. Never retype 48, 1.5rem
  or 3px.
- Every new law goes in `SLOT_TABLE_PAINT_LAW` + a contract predicate + a
  mounted test in `compound-select-gutter-context.test.ts`, and every new face
  in `src/components/tables/compound` needs its filename added to the
  `PRIMITIVE_HOMES` match in `tools/design-mcp/server.mjs` plus a
  `src/design-system/pinned.json` entry (pins are keyed by FILENAME, not by
  exported symbol).
