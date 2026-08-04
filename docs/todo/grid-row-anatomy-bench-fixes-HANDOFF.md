# Grid row anatomy — bench fixes HANDOFF

**Created 2026-08-02**, immediately after §2 of
[`grid-data-table-notion-pass-HANDOFF.md`](grid-data-table-notion-pass-HANDOFF.md) landed and was
looked at on `:3050` for the first time. Three defects came back from that look. All three are in
code shipped **this session**, all three are small, and one of them (§1) finally answers a question
the SoT has been carrying as "deliberately left red".

Read §4 before running `npm run verify` — the tree currently holds another session's in-flight work
and four gates are red for reasons that are **not** this work.

---

## Paste this into a new session

> Read `docs/todo/grid-row-anatomy-bench-fixes-HANDOFF.md`.
>
> §5 lists what already landed — verify by call site, do NOT re-implement. Your job is §1–§3: three
> bench defects in that work. §1 adjudicates the open `date`/`location` alignment question the SoT
> has been holding red, so it is a **ruling plus a code change plus a doc edit**, not a tweak. §2 is
> a one-prop fix at ~6 call sites. §3 needs a new declared field on the column model — do not solve
> it with `labelFitRem`.
>
> Attach to `:3050` (never start, restart, or kill one) and look at `/unbox` before agreeing it is
> done — every one of these three shipped green and was still wrong on screen.
>
> `npm run verify` before done; §4 says which reds are pre-existing.

---

## 1. Tracking (and Date) are end-aligned; they must read left

**Bench:** *"tracking number must not have extra padding on the left side it must be locked in."*

The `tracking` cell renders a short last-8 face (`66058406`) in an 8rem track, `end`-aligned. Every
row therefore shows ~3rem of empty track on the LEFT and the value floating against the right edge —
so the eye cannot run a straight line down the identifiers, which is the entire job of a column.

**This is the open question, now answered.** `source-of-truth.md` → *Grid column justification*
carries:

> **Still open, and deliberately left red:** `date` and `location` (tracking). … the spec wants both
> **start**, the code says **end**, and nobody has adjudicated them. **Do not green the suite by
> editing those assertions** — that would delete the open question rather than answer it.

The operator has now adjudicated it, and they agree with the spec.
`tests/e2e/ledger-grid-column-display.spec.ts` D2 (~line 150) already asserts `flex-start` for
`date`, `order` **and** `tracking`. So this change turns those assertions green **by answering the
question**, which is the one sanctioned way to do it.

**The reasoning that makes it a rule, not a preference:** `end`-alignment is for a **magnitude** you
compare down a column — a quantity, a price, an age. A tracking number and a date are neither; they
are *labels you read*, and a label reads from its left edge. That is the same distinction already
ruled for the order number ("a name you read, not a magnitude you compare"); tracking and date were
left out only because nobody had looked at them, not because a different principle applied.

### Do

- `ALIGN_BY_TYPE` in `src/design-system/components/grid/grid-header-align.ts`: `location` → `start`,
  `date` → `start`. **This one IS a type-map change**, unlike the `order` case — every `location`
  and `date` column in the house is a label, so the exception is not per-surface.
  - Check the blast radius first: `location` also types receiving's `location` (bin/shelf code, a
    label → start is right) and `tracking`. `date` types `date` / `sla` / `tested` / `logged` /
    `created` / `last_counted` / `due` / `age` etc. **`age` is the one to look at** — it renders
    `3d` / `4h`, which IS a magnitude. If it reads wrong start-aligned, give `age` an explicit
    `align: 'end'` on its layout models; do not abandon the type-map change for it.
- `number` and `id` stay `end`. A quantity is a magnitude, and SKU / serial / ticket are reference
  attributes (the `order` columns keep their explicit `align: 'start'` override).
- Update `source-of-truth.md` → *Grid column justification*: move `date` / `location` out of "still
  open, deliberately left red" into the shipped table, with the label-vs-magnitude reasoning and the
  note that the spec was right first. Update the type table above it.

### Don't

- Don't hand-type `justify-start` on the tracking cell. Header and cell both resolve through
  `resolveGridColumnAlign`; splitting them is the exact drift that module exists to prevent.

---

## 2. The chip adds its own padding on top of the cell inset

**Bench:** *"same thing with the left order number column."*

`order` is already `align: 'start'` — so this is a second, independent defect, and it is why the
order column looks unlocked even though its alignment is correct.

`CopyChip`'s wrapper carries **`px-1.5`** by default
(`src/components/ui/CopyChip.tsx` ~line 247: `const outerPx = outerPad === 'flush' ? 'px-0' : 'px-1.5'`).
In a grid cell that stacks on top of the cell's own `px-2`, so every chip value sits 6px inside its
column's content edge and no chip lines up with the plain-text cells above or below it. It is
visible in the screenshots as the underline running wider than the digits on both sides.

**`outerPad="flush"` already exists.** This is a prop, not a new mechanism.

### Do

Pass `outerPad="flush"` to every `CopyChip`-family value rendered **inside a LedgerGrid cell**:

| File | Cell |
|---|---|
| `src/components/station/receiving-grid/cells/ReceivingOrderCell.tsx` | `OrderIdChip` |
| `src/components/station/receiving-grid/cells/ReceivingTrackingCell.tsx` | `TrackingChip` |
| `src/components/station/receiving-grid/cells/ReceivingSerialCell.tsx` | `SerialChip` |
| `src/components/station/receiving-grid/ReceivingGridGroupSummary.tsx` | `order` · `tracking` · `serial` |
| `src/components/station/incoming-grid/IncomingGridRow.tsx` | `order` · `tracking` |
| `src/components/station/incoming-grid/IncomingGridGroupSummary.tsx` | `order` · `tracking` |
| `src/components/receiving/pickup/grid/PickupGridGroupRow.tsx` | `order` (leaf + group) |

Audit the rest of the families rather than trusting this list — `grep -rn "OrderIdChip\|TrackingChip\|SerialChip" src/components/**/grid* src/features/**/grid*`.

**Then consider making it the default for grid cells rather than a prop at 12 call sites.** Twelve
call sites that must all remember a prop is the shape that drifts; the fact that this list exists is
an argument for a `gridCell` variant on the chip, or for the grid cell to zero it. Decide with
`pattern-evolution.md` in hand — but do not leave half the families flush and half not.

### Verify it at the bench, not in the diff

The tell is that a chip value and a plain-text value in the column above/below it start at the same
x. A screenshot of one column cannot show that; look at `order` (chip) against `title` (plain).

---

## 3. The Qty header renders TWO hashes

**Bench:** *"qty hash just the icon itself not a second # icon."* Confirmed in the screenshot: `# #`.

This is a defect in §2.5 as shipped this session. `RECEIVING_GRID_COLUMNS` / `INCOMING_GRID_COLUMNS`
set `gridLabel: '#'` on `qty`. In `GridHeaderLabel`:

```tsx
const visibleLabel = label ?? column.gridLabel ?? column.label ?? column.key;   // '#'
const showLabel = gridHeaderShowsLabel(column, visibleLabel);                    // true — '#' fits
…
return (<>{mark}<span>{visibleLabel}</span></>);   // mark = the `number` type glyph = a hash
```

So the type glyph renders **and** the label renders, and both are a hash. The intent was "the header
is the glyph alone", which is the `showLabel === false` branch — it already emits an `sr-only` full
label plus the mark, so the column stays nameable.

### Do

Add a **declared** way for a column to say "my header is my glyph":

- a field on `LedgerGridColumnModel` — `headerGlyphOnly?: boolean` reads best; `gridLabel: null`
  also works but overloads a string field with a sentinel.
- `gridHeaderShowsLabel` returns `false` when it is set, before the width test.
- Set it on `qty` in `receiving-grid-layout.ts` and `incoming-grid-layout.ts`, and **remove the
  `gridLabel: '#'` from both** (that line is the bug).

### Don't

- **Don't get there by starving `labelFitRem`.** It works today and silently flips back to the word
  the moment anyone widens the track or bumps the density — a bug that reappears months later with
  no diff to blame. The current comments in both layout files already say this; keep them true.
- Don't drop the `sr-only` label. A header that is only a glyph still has to be nameable.

### And re-check the precondition while you are there

`#` alone is only readable because `order` was frozen into the identity pane this session, putting
the two hash-glyph columns on opposite sides of it. That reasoning is written into the comment above
`qty` in both layout files and into `display/workbench-ops-queue.md` → Row anatomy §5. If §1's
type-map change moves anything, re-read it.

---

## 4. The tree is shared — which reds are NOT yours

Another session is working the same worktree (GitButler; see §4.6 of the parent handoff). At the
time of writing `npm run verify` reports:

| Gate | Status | Whose |
|---|---|---|
| Typecheck | ✓ | — |
| Route-permission drift · Route-auth · Schema drift | ✓ | — |
| Tenancy isolation | ! advisory, **22** violations | pre-existing, unchanged count |
| Lint | ✗ `src/lib/receiving/lines/build-sql.ts` — `Parsing error: ':' expected` | **other session** (164-line in-flight change) |
| Unit tests | ✗ 17 failures | **other session** — 13 are `list SQL matches legacy — …` (that same file), plus `resolveSupportTerminal`, `support chat type hierarchy`, `hardcoded reason/disposition array count`, `every *_PARAM constant is declared by a spec` |
| Dead-code (knip) | ✗ 11 findings | **other session** — all in `line-edit/steps/dock/*`, `incoming-removal-reason`, `tracking-paste`, `zoho-receipt-face`, `support/markdown`, `timeline`. (This work's one finding, an over-exported `GRID_ROW_PX`, was fixed by making it module-private — same call as `isFlexTrack`.) |
| Doc catalog drift | ✓ fixed | ran `node scripts/portfolio-sot-sync.mjs` |

Every lint error in the paths this work touched is clear. **Re-attribute before fixing** — run the
failing gate against your own files first, exactly as `verify.md` says. Note the parse error moved
line 840 → 899 between two runs, i.e. that file is being actively typed in.

---

## 5. Already landed this session — verify, don't redo

### 5.1 The frozen pane never actually pinned (bug, fixed)

`gridFrozenLeft` emitted `calc(… + var(--cf-col-select, minmax(2rem, 2rem)) + …)`. `minmax()` is a
grid-track function and is **illegal inside `calc()`**, so the whole value was invalid and `left`
computed to **`auto`** — every frozen cell after the first failed to pin, on all 14 families.
Measured in Chrome: the emitted expression → `auto`, the same one with rem fallbacks → `116px`.

It was invisible because a staffer who had drag-resized the preceding column set the var to a real
px value, which made it work for exactly the person testing it.

Fixed by one implementation in `grid-column-geometry.ts` — `gridFrozenLeft(columns, key)`, fallback
= the track's rem floor (`gridColumnTrackRem`), pane derived from `gridFrozenKeys`. It **takes the
columns**, because four surfaces (receiving · incoming · catalog · repair) had been aliasing the
orders-queue copy and computing their offsets from ORDERS' `select · order · title` pane. Ten
byte-identical local copies collapsed. Guard: `grid-frozen-left.guard.test.ts` (43 assertions —
no `minmax(` in any emitted calc, every var fallback a bare length, offsets = exactly the
predecessors in order, and no surface reusing another's expression).

### 5.2 §2.1 — no status dot in any identity cell

Removed from receiving (leaf + fold), incoming (leaf + fold), pickup (leaf + group) and Today
(`MyDayGridRow`, where it was the *lane* dot). Audited: no identity cell still paints one.

Incoming is the one judgement call worth knowing about. Its title dot was the **workflow** lifecycle
while its `status` column is the **carrier delivery state** — two different axes, so deleting it was
not purely redundant. It went because the two things it actually distinguished are each already said
by a column of their own: in-transit vs delivered by the `status` delivery icon, and
quantity-complete by `qty`. Reasoning is in the code comment; re-open it if the floor disagrees.

### 5.3 §2.2 — the status column is a dot inside the house chip

New `GridStatusCellValue` in `@/components/ui/grid-cells` (the named SoT for shared row VALUE cells).
3-layer chip, dot leading it *inside*, tone from the surface's lifecycle registry, ring derived from
the resolved ink (`ring-current/20`) so no registry needed a new field. Adopted by receiving (leaf +
fold), pickup, and Today's lane + status tracks — which deleted two page-local chip forks
(`PickupStatusChip`'s hand-rolled span, `MyDayGridRow`'s `GridTagChip`).

**Ready (`ReadyGridRow`) was deliberately left alone**: its `verdict` track is its status equivalent
but there is no verdict-dot SoT, and inventing one would invent a fact. Its `destination` fallback
already leads with `serialStatusDot` inside its own column, which is correct.

### 5.4 §2.3 — day + time share one column

Audited every family: **receiving was the only one that split them**, and §1.4 had already fixed it.
Nothing else to migrate. The rule is now stated in the SoT so the next surface does not re-split.

Receiving's `stage` column — which after that fix rendered only the clock `date` already showed —
was retired by the parallel session while this work was in flight.

### 5.5 §2.4 / §2.5 — order frozen, Qty header

`order` moved to index 1 with `frozen: true` and no `hideKey` / `tier` on **receiving and incoming**
(Orders already had it). Guards + specs updated for the new pane and core sets. Deliberately NOT
applied to pickup / repair / import-exception — reasons in
`grid-column-editability.ts`'s docblock (Repair quotes a ticket; Pickup's order is already its group
header; Catalog has no order at all).

The `#` header shipped **broken** — see §3.

### 5.6 SoT documents updated

`ui-design-system.md` (One row anatomy + Eyebrow headers/chips), `source-of-truth.md` (Grid identity
pane, Grid column justification, two new SoT-table rows), `display/workbench-ops-queue.md` (new **Row
anatomy** section carrying all five rulings with their reasons), `DESIGN_SYSTEM.md`.

The one distinction worth not losing: **the `META_COL` dot track on list/accordion rows stays
correct** — a list has no columns, so the row's left edge is the only address a state mark can have.
Both rules are live and both are written down; do not delete one to make them agree.

---

## Done when

- [ ] `tracking` and `date` read left; `age` checked and given an explicit `end` if it needs one
- [ ] D2's `flex-start` assertions pass **because the code agrees**, not because the spec was edited
- [ ] Chip values start at the same x as plain-text values in the columns above and below
- [ ] The Qty header renders one hash, via a declared field and not `labelFitRem`
- [ ] `source-of-truth.md` no longer describes `date`/`location` as unadjudicated
- [ ] `npm run verify` — with §4's pre-existing reds attributed, not inherited
- [ ] Looked at on `:3050`

## Non-goals

Re-doing §5 · hand-typing `justify-*` on a cell · greening D2 by editing assertions · changing
`ALIGN_BY_TYPE.id` or `.number` · freezing `order` on pickup / repair / import-exception · fixing
another session's `build-sql.ts`.
