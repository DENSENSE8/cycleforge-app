# PO line capture entry — ONE always-accessible row

Rewritten **2026-08-10** after operator review of the progressive face.
Supersedes the previous "one wrapper" handoff, which was built around the
progressive Condition → Serial → Photos **stage machine**. That machine is the
thing being deleted, so the plan that organised it no longer applies.

Lane: current checkout — attach to `:3050`; never start/restart/kill the dev
server. User owns commits. Never raise a DS / knip baseline.

---

## The ruling

**Progressive disclosure on a PO line is bad UX at a bench and is retired.**

An operator standing at a carton needs to see condition, serial and photos for
the unit **at the same time**, and needs to be able to reach any of them at any
moment — not after satisfying the one before it. Staging made the row a
sequence: it hid the serial while grading, hid photos until the serial landed,
and put a green check in the operator's path to advance a step they had already
done with their hands.

Ops chrome tells the operator what is true; it does not gate them.

### Target — ONE row, always accessible

```
┌ data-po-line-entry ────────────────────────────────────────────────┐
│ [ NEW · LIKE NEW · GOOD · FAIR · POOR ……… full width ] [⛓][▦][◫] │
│   condition bar — never collapses                       units      │
│                                                           serial   │
│                                                            photos  │
└────────────────────────────────────────────────────────────────────┘
```

- **Condition owns the remaining width**, always expanded, SoT names
  (`ConditionPills` `labelVariant="full"` + `layout="barDistribute"`). It never
  collapses to a square, and there is no expand/edit pencil on this face.
- **Three trailing icon buttons, always mounted and always enabled** — Units ·
  Serial · Photos. Each is a full-height flush segment (`h-11`, `cornerClass('flush')`,
  hairline `border-l`), pressable regardless of what has or has not been captured.
- **The green check is deleted** (`NoSerialOfferCheck` on this face, and the
  emerald confirm that collapsed condition left). A no-serial waiver moves into
  the Serial surface the icon opens.
- **Nothing on this row unmounts anything else on this row.** Pressing an icon
  opens/focuses its surface *beneath* the row; the row itself is invariant.

### State is READOUT, never gating

Each icon carries its own state on its face — captured vs not — as ink/tone on
the glyph plus an `aria-label` that says the value (`Serial …7719 — edit`).
That is the fact the stage machine was trying to express by hiding things.

**Never** disable an icon because a prior step is incomplete. **Never** reorder
them. **Never** re-introduce a "current stage" attribute on this row.

---

## What this deletes

| Delete | Where |
|---|---|
| `progressiveStage` state machine + `data-progressive-stage` | `SerialCard.tsx` |
| condition collapse-left on confirm (`condExpanded` progressive branch) | `SerialCard.tsx` |
| collapsed-serial button + `data-progressive-serial` | `SerialCard.tsx` |
| photo expand → collapse-on-shot (`data-progressive-photos`, `photoExpanded`) | `SerialCard.tsx` · `PoLineItemPhotoPeers.tsx` |
| `NoSerialOfferCheck` on the Unbox centre face | `SerialCard.tsx` |
| `progressiveCapture` as a **derived boolean prop** at call sites | ALS · `LinePoItemsSection` · `UnmatchedAccordionSurface` · `ReturnScanCard` |

`SerialCard`'s non-progressive branches (Testing / Arrival single-qty, Units
Displays `flush`) are **untouched** — this is an Unbox-centre face change, not a
`SerialCard` rewrite.

---

## Structure — one wrapper, one resolver, one token

The architecture the previous handoff argued for still holds, and gets smaller
once the stage machine is gone. Three artifacts, one of which already exists.

### 1. One resolver — call sites pass FACTS, never a conclusion

The live defect is that `progressiveCapture` is *computed at each call site*:

| Site | Today |
|---|---|
| [`LinePoItemsSection.tsx:368`](../../src/components/receiving/workspace/line-edit/LinePoItemsSection.tsx) | `progressiveCapture={dockOwnsCapture && isControllerLine}` |
| [`UnmatchedAccordionSurface.tsx:729`](../../src/components/receiving/workspace/unmatched-items/UnmatchedAccordionSurface.tsx) | `progressiveCapture={dockOwnsCapture && isActiveLine}` |
| [`ReturnScanCard.tsx:69`](../../src/components/receiving/workspace/unmatched-items/ReturnScanCard.tsx) | `dockOwnsCapture && body === 'serial'` → mounts `SerialCard` **directly**, bypassing ALS |

Every rule change is rediscovered N times. Extend
[`line-receive-mode.ts`](../../src/components/receiving/workspace/line-receive-mode.ts)
— already the pure `qtyRollup | unitTrack` SoT — with the entry gate:

```ts
export type CaptureEntryMode =
  | 'capture-unit'    // the always-accessible row × N units
  | 'capture-rollup'  // BulkQuantityPanel (qty ≫ cap, no serials)
  | 'capture-stub'    // empty unfound — no line id yet
  | 'unit-rows'       // Units Displays / non-progressive multi
  | 'single';         // Testing / Arrival single-qty

export function resolveCaptureEntry(facts: {
  dockOwnsCapture: boolean; isActiveLine: boolean;
  flush?: boolean; forceUnitRows?: boolean;
  receivingId: number | null; lineId: number;
  quantityExpected: number; serialCount: number; forceUnitMode?: boolean;
}): CaptureEntryMode;
```

`ActiveLineConditionSerial` then **drops `progressiveCapture` from its prop
surface** and takes `dockOwnsCapture` + `isActiveLine`. Both `&&` expressions
disappear from the call sites; the rule lives in one pure, unit-tested function.

### 2. One wrapper

Rename `PoLineUnitCaptureList` → **`PoLineCaptureEntry`**, give it the
`capture-stub` body, and reduce
[`ActiveLineConditionSerial`](../../src/components/receiving/workspace/line-edit/ActiveLineConditionSerial.tsx)
to a thin adapter: resolve the mode → the three `capture-*` modes go to the
entry; `unit-rows` / `single` keep today's branches.

`ReturnScanCard` then mounts `PoLineCaptureEntry` and keeps only its thumb +
meta chrome — closing the third door.

### 3. One token

New `po-line-capture-chrome.ts` holding the row's chrome: the `data-po-line-entry`
box classes, the `h-11` trailing-segment class, the icon-button face, the
captured/uncaptured ink pair. Imported by
[`PoLineRow`](../../src/components/receiving/workspace/PoLineRow.tsx),
the entry, and
[`BulkQuantityPanel`](../../src/components/receiving/workspace/BulkQuantityPanel.tsx).

**That is the "one update moves all of them."** Change the segment height, the
icon set, or the captured tone in one file and every SKU line — found, unfound,
qty 1, qty 150, empty stub — moves with it.

---

## Locked (do not re-litigate)

- **Dual loci.** The dock owns the wedge/procedure; this row is the mouse
  go-back locus. Do **not** move the trio into dock Band 1 (`h-11`).
- **Dock multi-serial stays serial-only** (`UnboxSerialStepSurface` /
  `hideCondition` `ReceivingUnitRows`) — `ConditionDockControl` owns grade there.
- **Units Displays `forceUnitRows` + `flush` stays `ReceivingUnitRows`.**
- **`capture-rollup`** when `qty > UNIT_ROW_DISPLAY_CAP` and no serials — never
  150 rows. The rollup gets the same full-width condition bar and the same
  trailing icons.
- Photos on the empty stub stay optional (no line id); lined path keeps
  `PoLineItemPhotoPeers` line-scoped `unbox_item`.
- Compose / grow the SoT; delete forks; no page-local twins.

---

## Files

- [`SerialCard.tsx`](../../src/components/receiving/workspace/SerialCard.tsx) — delete the stage machine; the Unbox face becomes the invariant row
- [`PoLineUnitCaptureList.tsx`](../../src/components/receiving/workspace/line-edit/PoLineUnitCaptureList.tsx) → `PoLineCaptureEntry`
- [`ActiveLineConditionSerial.tsx`](../../src/components/receiving/workspace/line-edit/ActiveLineConditionSerial.tsx) — thin adapter
- [`LinePoItemsSection.tsx`](../../src/components/receiving/workspace/line-edit/LinePoItemsSection.tsx) · [`UnmatchedAccordionSurface.tsx`](../../src/components/receiving/workspace/unmatched-items/UnmatchedAccordionSurface.tsx) — pass facts
- [`ReturnScanCard.tsx`](../../src/components/receiving/workspace/unmatched-items/ReturnScanCard.tsx) — mount the entry
- [`line-receive-mode.ts`](../../src/components/receiving/workspace/line-receive-mode.ts) — `resolveCaptureEntry`
- `po-line-capture-chrome.ts` — **new**
- [`PoLineItemPhotoPeers.tsx`](../../src/components/receiving/workspace/line-edit/PoLineItemPhotoPeers.tsx) — drop `expanded`
- [`ConditionPills.tsx`](../../src/components/receiving/workspace/ConditionPills.tsx) — no change; the entry stops passing `collapsible`

SoT one-liners to update: [`display/unbox-station.md`](../../.claude/rules/display/unbox-station.md)
(capture trio) · [`source-of-truth.md`](../../.claude/rules/source-of-truth.md)
(Station PO line row · Unbox centre).

---

## Guards

Shrink-only ratchets, all source-level:

| Assert | File |
|---|---|
| No `data-progressive-stage` / `-serial` / `-photos` anywhere | `po-line-flat-chrome.guard.test.ts` |
| The entry row mounts condition **and** all three icons unconditionally — no `disabled` on a capture icon | new `po-line-capture-entry.guard.test.ts` |
| `NoSerialOfferCheck` has no Unbox-centre consumer | same |
| Only `line-receive-mode.ts` contains `dockOwnsCapture &&`; `progressiveCapture` appears in zero prop positions | same |
| Only `PoLineRow` paints `data-po-line-entry` | `po-line-flat-chrome.guard.test.ts` |
| Rollup keeps the full condition bar | `bulk-qty-display.guard.test.ts` |

---

## Verify

```bash
npm run verify
```

Targeted:

```bash
node --test --import tsx \
  src/components/receiving/workspace/po-line-flat-chrome.guard.test.ts \
  src/components/receiving/workspace/bulk-qty-display.guard.test.ts \
  src/components/receiving/workspace/units-explosion.guard.test.ts \
  src/components/receiving/workspace/unmatched-items/unified-unfound-surface.test.ts
```

Bench check on `:3050`: a multi-SKU carton — every active line shows the full
condition bar plus three live icons at all times; qty 150 shows the same face
over the rollup; unfound lined and empty stub match.

---

## Out of scope

Per-unit photo schema · dock Band 1 redesign · Arrival/Testing non-progressive
ledger · Units Displays flush explosion · raising any baseline.

---

## Order of work

1. `resolveCaptureEntry` + its unit test (pure, no UI) — reproduce today's three
   expressions **exactly**, land green.
2. Invert the props at the three call sites; delete `progressiveCapture`.
3. `po-line-capture-chrome.ts`, then rebuild the row against it.
4. Delete the stage machine in `SerialCard`.
5. `ReturnScanCard` → entry; rename the wrapper.
6. Guards, SoT lines, verify.

Steps 1–2 are behaviour-neutral and worth landing before any pixel moves.
