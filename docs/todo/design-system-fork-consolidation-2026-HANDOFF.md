# HANDOFF — design-system fork drain (depth pass)

**Date:** 2026-08-12 · **Status:** doors closed (Phases 1 + 2 P1). **This session executes the drain**, not another discovery pass.
**Read first:** this file, then [`design-system-fork-consolidation-2026-PLAN.md`](design-system-fork-consolidation-2026-PLAN.md) (D1–D12 + 3a–3e). Do **not** re-litigate D1–D12. Do **not** redo landed slices.

**Thesis (keep):** genuine fork vs SoT-with-drift vs blessed sibling. Per-`entityFamily` cell registries / `*-grid-layout.ts` / C2 station-vs-desk right edge are **not** debt.

---

## 0. Paste-this prompt (give the next agent this block)

```
You are executing the DEPTH pass of Cycle Forge's design-system fork-consolidation.
Doors are already closed. Your job is to DRAIN remaining same-usecase debt and
Phase 3 token soup — not rediscover, not flatten blessed siblings, not start DTCG.

## Constitution
- AGENTS.md is law. Run `node scripts/sot-lookup.mjs "<job>"` before composing UI.
- Never start/kill the :3050 dev server. Never git stash. User owns commits.
- Never raise a ratchet baseline. Flip shrink-only → hard ban ONLY at 0 live instances.
- Do not touch parallel-session dirt: SlicedActionDock, src/app/signin/page.tsx,
  docs/portfolio/DOC-CATALOG.md, INDEX.md. Do not run portfolio-sot-sync.mjs.
- After 2026-08-12 governance reset, verify SKIPS `*.guard.test.ts` except 4 keepers
  in scripts/run-unit-tests.mjs. New enforcement MUST be `*.test.ts` (not .guard.test.ts)
  or added to KEEPER_GUARDS. Existing program tests are already `*.test.ts`.
- Compose named SoTs; grow them when wrong. Never a page-local twin.

## Already landed — DO NOT redo, DO NOT regress
Phase 1: retired-symbols.test.ts, sot-manifest + sot-lookup, jscpd shrink-only gate
  (.jscpd.json curated ignore, jscpd-baseline.json, scripts/jscpd-gate.mjs wired in
  scripts/verify.mjs, src/lib/governance/jscpd-gate.test.ts proves a new clone fails).
2a: Button success/execute in src/design-system/primitives/button-variants.ts
2b: ChromeCheckButton (variant="execute") — Incoming + Unbox compose it
2c: KPI strips compose OpsKpiBand; no TILE_BAND_CLASS
2d: WorkbenchSheetView cohort (see workbench-sheet-view.test.ts COHORT). Out-of-cohort
    reasons live IN that file. Unbox + Scan-out stay out.
2e/2f: inspector-header scan; WorkbenchRefineFacetTabs (History flat refine is a sibling)
2g P1: incoming-grid-layout.ts DELETED; incoming-grid/cells/ DELETED; Incoming row
    calls renderReceivingGridCell with linePhase:'expected'. tableId stays "incoming".
    INCOMING_GRID_COLUMNS is a NAMED export on receiving-grid-layout.ts — do not
    merge into RECEIVING_GRID_COLUMNS (different freeze, date source, status vocab).
2h P1: StationHistoryTable All-layout mounts NonlinearTableHost +
    station-history.browse. StationRowColumnHeader DELETED. Dense role=grid fallback
    DELETED. useIsColumnHidden consumers = 3 (ChipColumns, RowMetaColumns,
    OrderIdentityChips). StationListTable remains for pipeline BOARDS only.

Current ratchets (never raise):
  HANDROLLED_SHELL_BASELINE = 52          src/components/ui/surface-box-tokens.test.ts
  HANDROLLED_SHAPE_SHELL_BASELINE = 350   same file (all soft radii + card fill)
  RAW_FOCUS_BASELINE = 827                src/components/ui/focus-ring-tokens.test.ts
  RAW_NEUTRAL_BASELINE = 16               src/components/ui/color-neutrals.test.ts
  ds-allow-raw-neutral ~99
  NA_BASELINE = 55 / PULSE_BASELINE = 97  src/components/ui/honest-absence.test.ts
  jscpd-baseline.json clones/lines only shrink (scripts/jscpd-gate.mjs --write)

## Execute in this order (golden-first, one family at a time)

### PASS A — Phase 3b focus rings (highest volume)
Codemod raw `focus:ring|outline|border|shadow` → `focusRing(archetype, tone)` from
`@/design-system/tokens/focus-ring`. Skip design-system/ (SoT + primitives). Skip
`ds-allow-focus`. Per-hunk review: field vs control vs wrapper vs cell.
After each batch LOWER RAW_FOCUS_BASELINE to the new live count. Target: cut
hundreds, not 4. Do not flip to a hard ban until 0.

### PASS B — Phase 3a card shells
Codemod hand-rolled `rounded-(sm|md|lg|xl|2xl) + border-border-soft + bg-surface-card`
onto `<Panel>`. Preserve WORKSPACE_NESTED_FIELD (not a card). Mark true one-offs
`ds-allow-box` with a reason. Decrement HANDROLLED_SHELL_BASELINE and
HANDROLLED_SHAPE_SHELL_BASELINE. Nested inputs / chips / pills are not Panels.

### PASS C — Phase 3d honest absence, then 3c neutrals
- Replace UI `"N/A"` / `'N/A'` with GridCellDash or `—`. Keep protocol/print/legacy
  parsers that READ "N/A" as empty (date.ts, conditions.ts, tracking-format,
  CopyableValueFieldBlock). Mark remaining print/API writers `ds-allow-na` + why.
- Replace animate-pulse empty-state soup with settled-empty copy. Keep Skeletons.tsx,
  *Skeleton*, OpsKpiBandSkeletonTile, KPI loading strips.
- Decrement NA_BASELINE / PULSE_BASELINE.
- Then drain remaining raw gray/slate/zinc → semantic tokens; retire
  ds-allow-raw-neutral only when the hue is no longer identity/print/photo.
  Decrement RAW_NEUTRAL_BASELINE. Never raise.

### PASS D — Phase 2 leftover structure (hand-refactor, read-first)
1. Incoming + standalone History DESK chrome in
   src/components/station/ReceivingLinesTable.tsx (~L843 Incoming, ~L939 History)
   are genuine 1+3 sheets. Fold onto WorkbenchSheetView like RepairTable.
   Do NOT wrap the Unbox-embedded branch. Then move those paths from OUT_OF_COHORT
   to COHORT in workbench-sheet-view.test.ts.
2. 2g host (ONLY if you can keep these invariants — otherwise skip):
   Incoming freeze stays `select` only; date stays incomingRowDateSource (Expected);
   status stays ReceivingDeliveryStatusCell (delivery_state), NEVER ReceivingStatusCell;
   no `_fill`; tableId incoming / incoming_embed stay distinct from receiving.
   IncomingGridRow/Header/descriptor may rehome under receiving-grid/ but must
   remain a second binding.
3. 2h boards: leave StationListTable for StationPipelineBoard. Do not force
   receiving/testing board lanes onto station-history.browse.
4. Named follow-ups (operator look, not drive-bys):
   - ReceivingDetailsStack still defaults PaneHeaderActionBar variant to banned 'card'
   - PanelActionBar still swallows onClose for remaining shipped/work-order consumers

Leave as blessed siblings: UnboxWorkspaceView, ScanOutWorkspace, PhotoLibraryPage
(inverted bands), WarrantyClaimsTable, UnfoundQueueTable, WalkInHistoryHub,
CsvImportStagingHost, SupportTicketFocus, C2 StationDisplaysPushStack vs RightRailHost,
HistoryWorkspaceHeader flat grouped refine, per-entityFamily *-grid-layout.ts.

## Do not
- DTCG / Style Dictionary / Terrazzo
- Flatten cell registries or merge Incoming+History column arrays
- Mount StationDisplaysPushStack on RightRailHost
- Force Unbox/Scan-out onto WorkbenchSheetView
- Raise any *_BASELINE or knip-baseline to pass
- Restore the 271-guard fleet as .guard.test.ts (reset skips them)
- Start/kill dev server, commit, push, stash, regenerate DOC-CATALOG

## Verify as you go
After each pass:
  node --import tsx --test src/components/ui/focus-ring-tokens.test.ts \
    src/components/ui/surface-box-tokens.test.ts \
    src/components/ui/color-neutrals.test.ts \
    src/components/ui/honest-absence.test.ts \
    src/components/dashboard/workbench-sheet-view.test.ts \
    src/components/dashboard/chrome-cta-pill.test.ts \
    src/components/receiving/receiving-box-chrome-actions.test.ts \
    src/design-system/foundations/retired-symbols.test.ts \
    src/lib/sot-manifest/sot-manifest.guard.test.ts \
    src/lib/governance/jscpd-gate.test.ts \
    src/lib/governance/same-usecase-forks.test.ts \
    src/components/station/station-history-grid/station-history-binding.test.ts
  node scripts/jscpd-gate.mjs
  npx tsc --noEmit -p tsconfig.json   # if red only on foreign files
    (useOrdersImport, useGlobalWedgeScanner, stream-apply, SlicedActionDock)
    do not "fix" them; re-check only files you touched.

If a family hits 0 live instances, THEN replace its shrink-only baseline with a
hard doesNotMatch ban. Never before.

Done when: focus and shape-shell baselines have dropped substantially (not +4);
N/A/pulse soup is drained except marked protocol/print/skeleton; Incoming/History
desk chrome is on WorkbenchSheetView OR you recorded why not; no ratchet raised;
program tests + jscpd-gate green.
```

---

## 1. Current position (2026-08-12, after the doors pass)

| Slice | State |
|---|---|
| 1a/1c/1d | Landed. Tests are `*.test.ts` (governance reset deleted `*.guard.test.ts`). |
| 1b jscpd | Landed. Baseline shrink-only. Ignore set curated. |
| 2a–2f | Landed. |
| 2g P1 | Cells unified. Host/freeze/status vocab still split (correct). |
| 2h P1 | All-layout on registry. Boards still on StationListTable. |
| 2d | COHORT in `workbench-sheet-view.test.ts` (19 views). Remaining 1+3: Incoming + History desk inside `ReceivingLinesTable`. |
| 3a–3d | Guards exist; **soup not drained**. Focus 827, shape-shells 350, N/A 55, pulse 97. |
| 3e | Do not flip. Nothing is at 0. |

## 2. Hard numbers (start of depth pass — only decrement)

See the prompt block. Re-measure with the live tests before the first decrement of this session; if live < baseline, shrink immediately.

## 3. Key files

| Job | Path |
|---|---|
| Button fills | `src/design-system/primitives/button-variants.ts` |
| Check face | `src/components/receiving/ChromeCheckButton.tsx` |
| Sheet shell + cohort | `src/components/dashboard/WorkbenchSheetView.tsx` + `workbench-sheet-view.test.ts` |
| Incoming cells | `src/components/station/receiving-grid/cells/` (`linePhase: 'expected'`) |
| Incoming columns | `INCOMING_GRID_COLUMNS` in `src/lib/receiving/receiving-grid-layout.ts` |
| Station history binding | `src/components/station/station-history-grid/` |
| Focus SoT | `src/design-system/tokens/focus-ring.ts` |
| Panel | `src/design-system/primitives/Panel.tsx` |
| Honest absence | `GridCellDash` in `src/components/ui/grid-cells.tsx` |
| jscpd | `.jscpd.json`, `jscpd-baseline.json`, `scripts/jscpd-gate.mjs` |

## 4. Non-negotiables

Same as PLAN §5 + AGENTS.md. C2 right-edge fork stays. Per-family layouts stay. No DTCG. No calendar ratchet. User commits.
