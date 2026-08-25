# Status block + item SoT — session handoff (2026-08-22)

> Written because the originating session's context got long and its later
> edits started reversing its earlier ones. **Everything below is on disk,
> uncommitted, on `main`.** `npm run verify:fast` passes; `run-unit-tests.mjs`
> is 6193 pass / 0 fail. Read §4 (reversals) before changing anything — several
> "obvious improvements" were already tried and rejected by the operator.

---

## 1. What shipped

Two new design-system SoTs, and every caller ported onto them.

### `src/design-system/components/item-record/`
The item face lifted out of the scan-station PO row: thumb | wrapping title |
five-track ledger (qty · SKU · condition · serials · price).

- **Last-8 is an invariant, not a prop.** No `displayWidth`, no `truncate`, no
  full-value escape hatch.
- **Cell affordances are `{label, onClick}`, never chip nodes.** A node slot
  would let one surface paint a full SKU where another paints last-8.
- Callers: `PoLineRow` (thin adapter, 508 → ~260 lines), `SearchOrderItems`,
  `ProductDetailsSection`. `PoLineMetaGrid` / `PoLineHeaderThumb` /
  `PoLineBadges` / `station-scan-face` are now thin re-exports.
- Pure adapter + 7 unit tests: `src/lib/item-record/shipped-order-item-record.ts`.

### `src/design-system/components/milestone-pipeline/`
A record's progress across stations. Every stage = WHO (face) · WHAT (past-tense
stage + station glyph) · WHEN · WHAT WAS READ (scan trail).

- Closed prop shape. **No slots.** `actor` (a person, gets a face) is separate
  from `detail` (a state qualifier like "Shelf set", gets none).
- Scan values render through `SerialChip` / `TrackingChip` — never a local
  `getLast8` / `.slice(-8)`.
- Callers: `OrderPipelineSection` (113 lines, pure mapper),
  `ReceivingCartonPipeline`, `ArrivalCartonPipeline`.
- `LinearWorkflowStepper` is now **wizard-only** (repair intake). Its slots
  (`marker` / `body` / `connectorPadClass`) were deleted.

### Other landed changes
- **`CopyChip` last-8 metric fix.** `w-[8ch]` + `letter-spacing: 0.12px` was 1px
  short (measured: clientWidth 58, scrollWidth 59), so EVERY last-8 chip
  app-wide silently dropped its final character. Now `8.25ch`, no truncation.
- **`ThreadPanel` entry band un-forked** — was `px-4`/default on one host and
  `px-3`/compact on another, keyed off `dense`, a READING prop. Now always
  `px-3 py-3` + compact.
- **`/search` order centre**: context → Status → Items → thread. Thread is
  full-height with the composer pinned to the floor (`StationWorkbench.bodyFill`
  → `EntityStationPane.centreFill`).
- **`ProductDetailsSection` is read-only** and `canEditProduct` is deleted from
  it, `ShippedDetailsPanelContent`, and 5 call sites.
- **`AGENTS.md` gained a rule: no layout animations.** Applied to
  `StationCollapsibleBlock` (instant collapse), `ItemRecordRow` (motion-free),
  `PoLineRow` (`animateLayout` inert).
- **Deleted**: `PipelineStageRow`, `po-lines-accordion-meta-order.test.ts`
  (regex-over-source guard), `ScannedBadge`, `StepDot`'s numbered active state.

---

## 2. Verify before you trust anything

```bash
npm run verify:fast
node scripts/run-unit-tests.mjs
```

Browser: `http://localhost:3050/search?sel=order:6154` (QA org). **Never start
or restart the dev server — the operator owns :3050.**

Current geometry at 1280x720, order 6154: Status block 109px, Items y=187,
composer y=651, rail segments all cy 129–130.

---

## 3. Open / unverified

| Item | State |
|---|---|
| **Staff photos never seen rendering** | Every staff row in BOTH the QA org and the dogfood org has `avatar_photo_id: null`. `StaffAvatar` correctly falls back to coloured initials. The ID is wired and resolving; the photo path is unproven. Upload one photo to any staffer to confirm. |
| **Multi-serial scan trail unverified** | Needs an order with serials AND a serial-scan test stamp. QA org has none. Dogfood `?sel=order:6871` (4 serials) does — but requires a dogfood-org session; a QA-org browser gets RLS-filtered to nothing. |
| **`tests/e2e/search-station-layout.spec.ts` updated but NOT run** | Needs `pnpm provision:qa-org` + playwright. The `'Items AND the composer both fit on first paint'` test is a deliberate live tripwire — if it goes red, the Status block is too tall and the fix is the block, not the assertion. |
| **`bodyFill` / `centreFill` still opt-in props** | Making them unconditional would re-geometry every station centre (Unbox, Triage, Support, Testing). Plausible, not done — needs an operator call. |
| **Pack-stage scan is an inference** | Scanned Out = tracking is solid (dock reads the label). Tested = serials is solid. **Packed = tracking is a guess** — if packers scan the serial or SKU instead, it is a one-line change in `OrderPipelineSection`. |

---

## 4. Reversals — do not re-litigate

The operator changed direction several times. Current state is the ruling:

1. **Status IS in the `/search` centre.** This reverses a 2026-08-21 ruling
   recorded in `docs/rules/display/search-station.md` (deleted in `0c2fd3746`,
   recoverable) and `docs/todo/search-station-port-HANDOFF.md`, both of which
   say "do not re-add it". The operator reversed it on 2026-08-22.
2. **The Status block is the STEPPER ONLY.** `OrderTimelineSection` (the audit
   trail) was tried in the centre and removed: it measured 1138px and put the
   composer at y=1581 in a 720 viewport. The trail stays on the `timeline` leaf.
3. **Horizontal, not vertical.** A one-column vertical timeline was built and
   rejected.
4. **No check marks.** Tried; rejected. State is tone only.
5. **Row order is fixed**: staff name, then stage + trailing glyph, then date
   and time, then the scan trail. The PFP pairs with all of it in a 1x2 grid.
6. **Item number + marketplace SKUs are removed from `/search`** but KEPT on the
   shipped panel. The listing link was removed and then restored (it is a read,
   not a write).

---

## 5. Hazards

- **A concurrent session is refactoring the sidebar rail on the same worktree.**
  It has repeatedly broken every route with mid-write imports
  (`copyRailValue`, `resolveSearchRecentSelectedId`). A 500 on `/search` is
  usually that, not your change — check the error text before debugging.
  **Never `git add -A`**; it sweeps their staged work. Stage only your files.
- **`git status` shows unrelated modified files** (grids, compound tables, home
  / tasks features). Those are not this work.
- Screenshots are unavailable in that session's browser tool (pane not
  compositing); all verification was DOM measurement.

---

## 6. Sibling handoffs written this session

- `docs/todo/search-surface-bloat-teardown-HANDOFF.md` — `CartonInspectionPage`
  (1098 lines), `SearchResultRow` (757), `SearchUnitCentre` never ported.
- `docs/todo/entry-band-sot-consolidation-HANDOFF.md` — one component for the
  thread composer, notes entry, and ticket composer.
