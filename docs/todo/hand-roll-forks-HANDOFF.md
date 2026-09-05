# Hand-roll forks — handoff prompt

Paste the block below into a fresh session. Full triage with counts, file lists
and the annotated/untriaged split:
https://claude.ai/code/artifact/2532aafa-d371-428c-8bcd-bc748a2d60c2

Sweep provenance: `ds_critique` over 1,885 `.tsx` on `cyc-82-morphing-action-menu`,
2026-09-03. 606 fork findings / 478 files / 173 never triaged / 11 classes.

---

## PROMPT

Work only in `/home/michaelgarisek/Projects/cycleforge-app`. Do not merge, do not
prod-write, do not touch printer / pack / kiosk UI.

Before ANY UI write call `ds_contract` (arg is `intent`, not `query`), and for
engine files `find_symbol` → `impact_analysis` first. Project hooks enforce a
fresh design-mcp session stamp; `lastTool` must be `ds_contract`.

### Scope — Tier 1 only. Do not start the long tail.

**1. Delete the `*NotesComposer` fork.**
`src/components/shipped/details-panel/ShippedNotesComposer.tsx` is the only file
matching the router refuse pattern `composer.notes-composer` (`\w+NotesComposer`).
It imports no composer — it hand-rolls `IconButton` + its own send. The shipped
panel already migrated off it (see the comment in `ShippedPanelEditorDock.tsx`).
The single surviving consumer is `src/components/repair/RepairDetailsPanel.tsx`,
which mounts it at :279 and :290. Migrate those two mounts, then delete the file.
Ask `ds_contract "notes on a record panel"` for the replacement — do NOT assume
it is `StationComposerHost` (that is the station mouth, not a panel).

**2. Native `type="date"` → `DateRangePickerField`.**
Refuse id `slot-table.native-date-input`. 11 mounts in 6 files. `variant="compact"`
is one civil day in a cell; `variant="range"` is a filter. Order:
- `src/design-system/components/WorkOrderAssignmentCard.tsx` — inside the
  primitive lane, so it is the one teaching the wrong pattern. Fix first.
- `src/components/shipped/details-panel/OrderAssignDisplayHost.tsx:122` — a
  deadline on a live desk record → `variant="compact"`.
- `src/components/audit-log/AuditLogFilterStrip.tsx` ×4 — a custom range filter →
  `variant="range"`. This file also hand-rolls a `<button>` (:176) and an
  `<input>` (:194) and is 533 lines; convert the dates only, leave the rest.
- `src/components/fba/FbaCreateShipmentForm.tsx` ×1
- `src/components/admin/staff-management/AvailabilityRulesSection.tsx` ×2
- `src/app/admin/inventory/events/page.tsx` ×2

**3. Center Lock Q5 — 6 desk-side `RightRailHost detail:` occupants.**
CLAUDE.md: "Forbidden on desks: `RightRailHost detail:*`". 31 files mount a
`detail:` occupant but only these 6 reach a surface that mounts `DeskPageChrome`
/ `DeskStageOverlay` — the other 25 are stations, sidebars and workspaces where a
rail is the house answer. Do not touch those 25.
- `src/components/outbound/orders/CsvImportStagingRail.tsx`
- `src/components/outbound/orders/OrderIngestRail.tsx`
- `src/components/photos/photo-inspector/PhotoInspectorPanel.tsx`
- `src/components/photos/photo-inspector/PhotoBatchInspectorPanel.tsx`
- `src/components/receiving/rail/ReceivingLineRailShell.tsx`
- `src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx`

Read `docs/warehouse-os/PLAN-center-lock.md` first — it is the classifier. L1 is
in-cell, L2 is `DeskStageOverlay` on the stage. Confirm each is really desk-side
before moving it; the trace was heuristic (consumer imports `DeskPageChrome`).

### Triage axis — read this before counting anything

The repo annotates reviewed exceptions: `ds-raw-button` (638 markers),
`ds-allow-raw-neutral`, `ds-allow-hex`, `ds-allow-radius`, `ds-allow-focus`,
`ds-allow-title`, `ds-allow-control-size`, `ds-allow-spacing`, `ds-allow-na`,
`ds-raw-anchor`. A raw control carrying one was looked at and kept on purpose.
305 of the 478 fork files carry one; 173 do not. Rank by the untriaged count,
never the raw count — the 332 raw `<button>` findings are only 40 unreviewed,
while the 190 raw `<input>` findings are 106 unreviewed.

### Verify

- `node scripts/verify.mjs --fast`
- `pnpm run eval:cohort slot-table` after any DateRangePickerField / cell edit
- `pnpm run eval:cohort shortcuts` if you touch TableStatusBar or hotkeys
- Signed-in browser check on :3050 before claiming done; screenshot required.
- `pnpm run` is broken by the verify-deps check — use
  `pnpm --config.verify-deps-before-run=false run <script>`.

### Do not

- Do not delete `DataTableColumnActionRow.tsx` — zero mounts since the bottom
  selection strip came off the engine, but it is `engine:DataTableColumnActionRow`,
  a KEEP id in the shortcuts cohort. Retire the cohort entry first or leave it.
- Do not re-add selection verbs to `DataTable`. `selectionActions` /
  `selectionActionLayout` / `selectionActionCount` were removed engine-wide on
  2026-09-03: the verbs live on the row's first checkbox now. An opt-out prop is
  a fork with a prop for a name.
- Do not treat the 19 `*-grid-layout.ts` files as second tables. `eval:discover`
  returns 0 DELETE; they are sanctioned `*_SHEET_COLUMNS` materializations.
- Do not touch the two standing human-judgment items (FBA field-catalog orphan,
  `support-tickets` TABLE_COLUMNS zombie).
