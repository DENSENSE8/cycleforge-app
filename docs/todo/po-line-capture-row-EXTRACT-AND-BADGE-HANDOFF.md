# PO-line capture row — extract from SerialCard + restore the condition badge

**Status (2026-08-10):** Job 1 landed (`PoLineCaptureRow` + shared `SerialScanField`).
Job 2 landed as phase-1 in-row serial: Serial click → leading `ConditionBadge` +
`SerialScanField`; Photos stays / opens Displays; unfound stub shares Photos.
Displays-junction-for-Serial law is superseded.

Created 2026-08-10, after the always-accessible capture row shipped inside
`SerialCard`. Two jobs: **stop `SerialCard` being two components**, and **make
the condition grade a persistent badge** on the row instead of a state that the
open picker hides.

Lane: current checkout — attach to `:3050`; never start/restart/kill the dev
server. User owns commits. Never raise a DS / knip baseline.

---

## Where we are

The Unbox capture row landed as a `captureRow` branch **inside** `SerialCard`
([SerialCard.tsx](../../src/components/receiving/workspace/SerialCard.tsx), now
~934 lines). One file now hosts two unrelated components sharing state:

| Job | Lives in SerialCard as |
|---|---|
| Legacy scan card (Testing / Arrival / Units Displays) | the tail return — `serialFieldNodes` + `condExpanded` collapsible picker + `SerialChip` list + notes |
| Unbox capture row | the `if (captureRow)` block — `openPanel` · `togglePanel` · condition bar / `ConditionBadge` · `[serial][photos]` segments |

The gate (`resolveCaptureEntry`), the chrome token
([po-line-capture-chrome.ts](../../src/components/receiving/workspace/po-line-capture-chrome.ts)),
and the fact-passing at the three call sites are **done and guarded** — leave
them. This handoff is only the component split + the badge.

---

## Job 1 — extract, so `SerialCard` has ONE identity

**Target:** a new `PoLineCaptureRow` component; `SerialCard` keeps only the
legacy scan card. They share the serial *field*, not a `captureRow` flag.

```
SerialScanField        ← NEW leaf: the input + submit/edit/no-serial/lookup/add
  ├── SerialCard        (legacy body composes it — unchanged behaviour)
  └── PoLineCaptureRow  (condition bar/badge + segments + panels; composes it)
```

### Why a leaf, not a copy

The serial field is the one genuinely shared surface — the `scan` state, the
comma-paste dedupe `submit()`, edit-vs-add, the no-serial waiver swap, the
lookup spinner, and the `inputRef`/`externalInputRef` handoff. It exists once as
`serialFieldNodes` today and is rendered by both branches. Pull **exactly that**
into `SerialScanField` (props: `saved` · `disabled` · `editing`/`onEdit…` ·
`noSerialActive`/`noSerialSlot`/`onMarkNoSerial` · `lookupBusy` ·
`externalInputRef` · `embedded` · `onAdd` · `onReplaceSerial` · `onDeleteSerial`
· `resultSlot`). It owns `scan`, `editing`, `inlineNotice`, `inputRef`, and
`submit()`.

Then:

- **`SerialCard`** drops the `captureRow` prop entirely and composes
  `SerialScanField` in its tail return. Its condition picker (`condExpanded` /
  `handleConditionExpandedChange` / collapsible `ConditionPills`), the
  `SerialChip` list, and the notes block stay. Net: it gets *smaller* and stops
  branching on capture state.
- **`PoLineCaptureRow`** owns `openPanel` · `togglePanel` · the
  editing-opens-serial effect · `handleConditionPick` · the condition bar/badge
  · the `[serial][photos]` segments · the two in-row panels. It composes
  `SerialScanField` for the serial panel and calls `renderPhotoStage` for
  photos. Props mirror what the `captureRow` branch reads today
  (`condition`/`onConditionChange` · serial field props · `renderPhotoStage` ·
  `photoCount`).

### Rewire the one consumer

`PoLineUnitCaptureList` and `ReturnScanCard` mount `<SerialCard … captureRow>`
today. Point them at `<PoLineCaptureRow …>` instead. `ActiveLineConditionSerial`
already resolves the mode; nothing there changes except the element it renders
for `capture-*`.

### Guard the split

Grow [po-line-capture-entry.guard.test.ts](../../src/components/receiving/workspace/po-line-capture-entry.guard.test.ts):

- `SerialCard.tsx` no longer contains `data-capture-row`, `openPanel`, or
  `CAPTURE_SEGMENT_ORDER` — the capture row left it.
- `PoLineCaptureRow.tsx` and `SerialCard.tsx` both import `SerialScanField`
  (the field is shared, not forked — a second serial-field implementation is the
  regression this split exists to prevent).
- Re-point the existing capture-row assertions from `SerialCard.tsx` to
  `PoLineCaptureRow.tsx` (invariant row, no confirm check, hide-open-icon,
  green/blue segment faces). They must keep passing verbatim after the move.

**Behaviour-neutral.** Land this with zero visible change, guards green, before
Job 2.

---

## Job 2 — the condition grade is a persistent BADGE

**Ruling:** the grade an operator has set must stay legible on the row at all
times — not vanish behind the full-width picker at rest, and not only appear
once a panel is open.

Today: at rest the row is the full-width `ConditionPills` bar (no readout of the
*current* pick beyond the highlighted pill); when a panel opens it collapses to
a `ConditionBadge`. So the compact badge exists only in the open state. Restore
it as a **persistent leading readout**.

### Target layout

```
[ ●GRADE ][ condition picker — fills remaining ][ serial ][ photos ]   ← at rest
[ ●GRADE ][ condition picker — fills remaining ][ serial field …… ][ photos ]  ← serial open
```

- A leading `ConditionBadge` (the `size="compact"` grade readout, or the filled
  grade square) is **always mounted**, left of everything, showing the current
  grade — `—` when ungraded (honest absence, never a check).
- The picker still fills the rest **at rest** so grading is one press. When a
  surface opens, the picker yields (the open field takes the width) but the
  **badge stays** — that is the persistent readout the user asked back.
- Pressing the badge returns the row to rest (the "back to grading" affordance
  the open-state `ConditionBadge` already had). Keep that handler.

### The check stays dead

The badge is `ConditionBadge` (no confirm ✓ by construction) or the read-only
grade square — **never** `collapsible` `ConditionPills`, whose ungraded fallback
draws the gray check this whole thread removed. The guard
*the confirm check cannot return to the capture row* already bans `collapsible`
in the capture markup — keep it, now pointed at `PoLineCaptureRow.tsx`.

### Chrome token

The badge cell is chrome — add its class to
[po-line-capture-chrome.ts](../../src/components/receiving/workspace/po-line-capture-chrome.ts)
(`PO_LINE_CAPTURE_BADGE_CLASS` — `h-full`, flush, hairline `border-r`, hover to
signal it returns to grading), so the one token file still owns every cell face.

---

## Locked (do not re-litigate)

- `resolveCaptureEntry` is THE gate — call sites pass facts, never a `&&`.
- One serial-field implementation (`SerialScanField`) — never a second.
- Row is invariant: condition badge + both segments always mounted; no segment
  ever `disabled`; the open surface hides only *its own* icon.
- Serial segment green (`bg-emerald-50 text-emerald-700`); Photos segment reuses
  `STATION_CONTEXT_PHOTO_TONE` (the carton identity blue) — never a re-typed blue.
- No confirm check anywhere on the row.
- Dual loci untouched: dock owns the wedge; this row is mouse go-back.

---

## Files

- **new** `SerialScanField.tsx` — the shared serial input leaf
- **new** `PoLineCaptureRow.tsx` — condition badge/bar + segments + panels
- [SerialCard.tsx](../../src/components/receiving/workspace/SerialCard.tsx) — drop `captureRow`; compose `SerialScanField`
- [po-line-capture-chrome.ts](../../src/components/receiving/workspace/po-line-capture-chrome.ts) — add the badge cell class
- [line-edit/PoLineUnitCaptureList.tsx](../../src/components/receiving/workspace/line-edit/PoLineUnitCaptureList.tsx) · [unmatched-items/ReturnScanCard.tsx](../../src/components/receiving/workspace/unmatched-items/ReturnScanCard.tsx) — mount `PoLineCaptureRow`
- [po-line-capture-entry.guard.test.ts](../../src/components/receiving/workspace/po-line-capture-entry.guard.test.ts) — re-point + add the split/badge asserts

SoT one-liners to touch after code is green:
[display/unbox-station.md](../../.claude/rules/display/unbox-station.md) (capture trio) ·
[source-of-truth.md](../../.claude/rules/source-of-truth.md) (Station PO line row).

---

## Verify

```bash
npx tsc --noEmit -p tsconfig.json
npx tsx --test \
  src/components/receiving/workspace/po-line-capture-entry.guard.test.ts \
  src/components/receiving/workspace/units-explosion.guard.test.ts \
  src/components/receiving/workspace/po-line-flat-chrome.guard.test.ts \
  src/components/receiving/workspace/unmatched-items/unified-unfound-surface.test.ts \
  src/components/receiving/workspace/bulk-qty-display.guard.test.ts \
  src/components/receiving/workspace/line-receive-mode.test.ts
npm run verify
```

Bench (authenticated `:3050/unbox`, or the QA org for E2E): a matched line shows
`[grade badge][picker][serial][photos]` at rest; pressing serial swaps the
picker for the field while the **badge stays**; pressing the badge returns to
rest; no check anywhere; qty-150 rollup and the empty unfound stub match.

---

## Out of scope

The retired progressive stage machine (gone) · dock Band 1 · Units Displays
flush explosion · per-unit photo schema · raising any baseline.

---

## Order

1. Extract `SerialScanField`; compose it in `SerialCard` — behaviour-neutral, green.
2. Extract `PoLineCaptureRow`; move the `captureRow` branch out of `SerialCard`;
   rewire the two consumers; re-point guards — behaviour-neutral, green.
3. Add the persistent condition badge + its token; update guards.
4. SoT lines; `npm run verify`.
