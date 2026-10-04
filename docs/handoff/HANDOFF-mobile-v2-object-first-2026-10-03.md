# Handoff — Mobile V2 object-first, one sheet system, next: mobile-first location & rack labels (2026-10-03)

Law you inherit (read first, in order):
`AGENTS.md` → `docs/mobile-first/SURFACE_LAW.md` (§4 desktop frame law, §6 R1–R10)
→ `docs/mobile-first/V2_OBJECT_FIRST.md` (delete list, §4 Fitts budget, §5 stock sheet)
→ `docs/mobile-first/V2_ARCHITECTURE.md` → `docs/design-system/CONSOLIDATION_LEDGER.md`.

Dev origin is `http://localhost:3050` only. Saved Playwright session:
`tests/.auth/admin.json` (re-mint: `PW_BASE_URL=http://localhost:3050 node tests/shot.mjs /m/stock /tmp/x.png`).
**Another agent session edits this working tree concurrently** (receiving,
shipping/live): ~1,300 uncommitted paths. Re-read before every edit; never revert
changes you did not make.

---

## 1. State at handoff

### Done and proved at :3050
- Stock selection rebuilt (`src/components/mobile/location/LocationStockPositions.tsx`):
  one staged Radix sheet — rest (identity · evidence preview · Camera / Adjust / **Move**),
  adjust, move (scan-first, typed code, Split, receipt + Undo), `•••` (destructive last).
- Load path: location GET one round trip of latency, `photoIds` + `walk` in the payload,
  no `/api/sku-stock` on row tap, no whole-building `/api/locations` on open,
  `/m/stock/detail` point lookup, `idx_serial_units_org_current_location` applied
  (223 ms → 0.8 ms), `transferBinQty` one statement + side effects in `after()`
  (moves 1.8–3.2 s → 0.56–1.0 s). One move writer: `src/lib/inventory/stock-transfer-client.ts`.
- `TouchQtyStepper` (design system) replaced `FnskuCopiesStepper` and the phone use of `StockQtySlider`.

### Done this turn, NOT yet integration-verified
- **One sheet system (owner ruling: Radix, not the house sheet).** `src/components/ui/BottomSheet.tsx`
  is deleted; all 43 consumers moved to `@/components/ui/sheet`
  (`SheetContent side="bottom"` content-sized, `size="full"`, new `SheetBody`);
  `ConfirmSheet` now lives at `src/components/ui/ConfirmSheet.tsx` (Radix, `level` dropped).
  Gate/doc mentions updated: `eslint.config.mjs`, `scripts/motion-timer-audit.mjs`,
  `src/design-system/pinned.json` (`Sheet` entry), `tools/design-mcp/README.md`, SURFACE_LAW §5/§7.
- **Nested sheets removed** in Allocate (`MobileV2FulfillmentOrders.tsx`: staged sheet, photo via
  `MobileSwipePhotoViewer`, paperwork inline via `MobileV2OrderPaperworkPanel`);
  `mobile-v2-allocate-layout.test.ts` deleted (source-text test).
- Test ids that moved onto `SheetBody`: `m-order-cart`, `m-order-pair`, `m-order-team-chooser`,
  `set-bin-sheet`, `pair-unit-bin-sheet`, `mobile-task-composer`, `mobile-task-brief-reader`.
- **ShellFanout — done, unverified by integrator** (`agent://ShellFanout`): inbox seeds
  (`ActivityInboxContext.tsx`, new `useActivityInboxFeed()`) wait for the desk badge;
  command aliases load only on desk routes, station scan bars, or on demand for an unknown
  `CMD-*` scan (`useCommandAliasHydration(enabled)`, `loadCommandAliases`); print-station
  heartbeat waits for idle and fires once (the ×2 was dev Strict Mode). Kept on purpose:
  staff colours, staff preferences, scan settings, realtime token (the phone renders them).

- **LocationPicker — done, agent-verified at :3050, unverified by integrator** (`agent://LocationPicker`):
  `GET /api/locations?room=` (walk order, faces, units, LPNs; unfiltered response unchanged);
  `MobileV2DetailTopBar` gained optional `onTitlePress`; new `MobileV2LocationPicker.tsx`
  (Radix sheet, search incl. GS1 unwrap, recents `cf:m-location-recents`, 48 px rows, aisle
  headers, current row centred); `MobileV2LocationRecord.tsx` drops Previous/Next, swipe follows
  the finger (28 % or 500 px/s commit, 24 px edge dead zones, neighbour prefetch); DetailDock's
  `cursor` prop deleted (last user). `RecordCursor` still has other importers — leave it.

### Integrator checklist (finish before starting §2)
1. `pnpm verify:fast`. Known red NOT from this work: typecheck in
   `src/app/shipping/live/page.tsx` (missing `FulfillmentBoardView`), layer law in
   `src/components/receiving/incoming/cards/pasted-number-faces.ts:37`. Everything else must be green.
2. Ledger (`docs/design-system/consolidation-ledger.json`): retire `mobile-sheet-systems`
   (deletedPaths `src/components/ui/BottomSheet.tsx`, forbiddenSource `components/ui/BottomSheet`);
   update `mobile-nested-sheets` (Allocate done; drop it from currentPaths; replace the
   `PhotoViewerPortal` wording with `MobileSwipePhotoViewer`); retire or update
   `mobile-location-ordinal-picker` and `mobile-shell-request-fanout` from the agents' reports.
   Run `node scripts/design-consolidation-guard.mjs`.
3. `docs/mobile-first/V2_OBJECT_FIRST.md` §2 rows D13–D16 → `done` with measured numbers.
4. Browser smoke at 430×932: stock sheet stages (`/tmp/cf-stock-smoke.mjs` is the throwaway pattern),
   Allocate (one `[role=dialog]` in every stage), daily task sheet + Status/Alert stacked over it,
   repair pickup (`size="full"`), a ConfirmSheet (repair info edit), `/m/loc/C0310300` picker + swipe.
   Smoke residue rule: a move + Undo into an empty location leaves a 0-qty row; delete your own.
5. `node scripts/e2e-mobile-stock-qol.mjs` (read-only; must print `"ok": true`).

---

## 2. Next task — mobile-first location & rack label printing (gold prompt)

### Goal
An operator standing at a rack prints **location labels** (one bin or a run of bins)
and **rack labels** from the phone: `/m/…` first, completable one-handed, scan- or
pick-driven. The desk page mounts the **same component tree** in a fixed phone-width,
single-column frame. SURFACE_LAW §8 lists this verb as `/m/… TBD — must exist before
desk Labels is "done"`; this task closes that row.

### What exists (evidence)
- Desk host: `/inventory/locations` → `src/components/warehouse/LocationsWorkspace.tsx`
  tabs `labels` → `LabelPrintWorkspace` → `src/components/barcode/BinLabelPrinter.tsx`, and
  rack tab → `RackLabelWorkspace` / `RackDetailView`.
- **Dual trees (refused by SURFACE_LAW §4.3):** `BinLabelPrinter.tsx` renders
  `lg:hidden` `BinBuilderMobile` and `hidden lg:block` `BinBuilderDesktop`;
  `rack-printer/` repeats it (`RackBuilderMobile` / `RackBuilderDesktop`).
- **Forked parts:** `bin-label-printer/{RoomPicker,StepPills,ZoneLetterTile}.tsx` and
  `rack-printer/{RoomPicker,StepPills,ZoneLetterTile}.tsx` are near-duplicates.
- State/print: `useBinLabelPrinter.ts`, `useRackLabelPrinter.ts`; print execution
  `src/lib/print/printLabelRun.ts` (`printBinLabelRun`, `printRackLabelRun`); registration
  `POST /api/locations/register` (`bin-printer-api.ts`); run expansion
  `src/lib/locations/expand-print-run.ts`; run picker `src/components/labels/LabelPrintRunPanel.tsx` (581 lines).
- Phone printer choice already exists: `src/components/mobile/fnsku/FnskuStationSheet.tsx`
  + `StaffPrintStationPicker` / `printStationState` + `useStaffPrintBridgeClient` — reuse, do not fork.
- Faces: `locationCode` / `skuExceptionLocationFace` (no `00` position sentinel on faces;
  printed stickers keep the full code). Label preview SoT: `LabelFacePreview`.

### Build (one tree, mobile first)
1. **Route** `/m/labels` (class A, `MobileV2Shell`), with entry from the location record
   (`MobileV2LocationRecord` dock or `•••`: "Print label" for this location / this rack)
   and from the app switcher. Register the route in SURFACE_LAW §8 and
   `src/lib/mobile/mobile-first-surface.ts`. Nav law: parent and child never share a name
   (`ds_nav_names`).
2. **Flow** (stages in one screen, path chips = status/jump-back per SURFACE_LAW §5):
   - *What*: Location label · Rack label (`TabSwitch` segmented, binary mode).
   - *Where*: **scan a location or rack sticker first** (`MobileCaptureWindow`), or pick
     room → aisle → bay → level → position with `TouchQtyStepper`-sized steppers / ordered
     lists (no sliders as the only input, F7). Prefill from the location the operator came from.
   - *How many*: single, or a run (vary position / level / bay) with a live count; preview
     the first sticker with `LabelFacePreview`.
   - *Printer*: the remembered station; change via the existing station picker in a Radix bottom `Sheet`.
   - **Print** is the single full-width primary on the safe-area floor (`DetailDock`),
     label = `Print 12 labels` / `Print C-03-10-3`; disabled states name what is missing (R9).
   - Receipt toast with the count; reprint = one tap. Registration failures surface the server message inline.
3. **Shared component boundaries** (design system or `src/components/labels/`):
   one `LabelBuilder` step machine driven by a variant (`bin` | `rack`) over one
   controller hook (merge `useBinLabelPrinter` + `useRackLabelPrinter` where their
   state is the same), one `RoomPicker`, one `StepPills`, one `ZoneLetterTile`.
   Delete the duplicates and both Mobile/Desktop builder pairs. Add a consolidation-ledger
   entry before the first deletion, retire it when the last fork is gone (`forbiddenSource`).
4. **Desktop port = frame, not fork:** `/inventory/locations?tab=labels` (and the rack tab)
   mount the same `LabelBuilder` inside a fixed phone-width, single-column, centred frame
   (`max-w-md`, thick gutters, SURFACE_LAW §4). Build that frame once as a small
   design-system component (e.g. `MobileFirstFrame`) if none exists — grep first; the
   dock inside it uses `DetailDock placement="float"` or `inline`, never a second sticky
   bar. Desk may add only density that the phone also has; no `lg:hidden` / `hidden lg:block`.
5. Fitts (V2_OBJECT_FIRST §4): 48 px rows/cells, primary at the bottom, scan instead of
   typing codes, Back in the dock, no edge-swipe-only navigation, no fixed `h-[NNdvh]` sheets.

### Non-goals
- No new print backend or second label template; `printLabelRun.ts` and
  `/api/locations/register` stay the only execution path.
- No changes to sticker artwork / GS1 payloads.

### Acceptance
- On a 430×932 viewport at `/m/labels`: scan (or pick) `C-03-10-3`, print a single
  location label and a 5-label position run to the remembered station; rack label likewise;
  every step completable with the thumb, primary always at the bottom.
- `/inventory/locations?tab=labels` shows the **same** tree in a centred phone-width column
  (one DOM tree: `grep -n "lg:hidden\|hidden lg" src/components/barcode` returns nothing).
- Duplicated `RoomPicker` / `StepPills` / `ZoneLetterTile` and the four Builder Mobile/Desktop
  files are deleted; ledger entry retired; `pnpm verify:fast` green except the known
  other-session failures in §1; `ds_critique` clean on the new files.
- Prove printing with the real station bridge if one is online; otherwise prove the
  `printBinLabelRun` / `printRackLabelRun` calls and registration in the network log and say so.
