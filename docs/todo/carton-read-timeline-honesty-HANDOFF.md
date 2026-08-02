# Hand-off — carton read + timeline honesty (`/carton/[id]`, unit journeys)

**For:** Claude Code / Cursor Agent
**From:** the 2026-08-02 carton-read pass (column balance → activity rows → unfound-return write path)
**Status:** HAND-OFF. Everything in §1 shipped and is guarded. §3 is the open work; §4 is settled and must not be reopened.
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050` (never start/restart it). User owns commits.

**Read first:** `.claude/rules/display/carton-read.md` · `.claude/rules/display/reference-timeline.md` ·
`.claude/rules/source-of-truth.md` · [`carton-read-display-polish-CLAUDE-CODE-PROMPT.md`](./carton-read-display-polish-CLAUDE-CODE-PROMPT.md)
(the prompt this continues; its §2.1 / §2.2 are now done, its §2.3 / §2.4 are not).

---

## 0. The through-line

Every defect fixed in this pass was the same shape, and it is worth naming because
it will recur:

> **A layer invented an answer, or discarded one, and the UI printed the result
> with a straight face.**

Four instances, all in one screen:

| Defect | Shape |
|---|---|
| `pairing_state` read `UNFOUND` on a carton with no `receiving_triage` row | `COALESCE` **invented** a state nobody wrote, and it read back as a search that had failed |
| A journey NOTE rendered as the word "Note" | Three layers **discarded** `ie.notes` — two hand-written projections and the adapter — while the SQL had always selected it |
| Two activity rows one second apart looked identical | The row **discarded** both facts that differed (`event_type`, and `next_status` when there is no `prev_status`) |
| The same serial last-8 on every row of a one-unit feed | A disambiguator **asserting** a distinction that did not exist |

The test that catches all four: **can this value be traced to something a person
or a machine actually recorded?** A `COALESCE` default cannot. A curated label
standing in for content someone typed cannot. Prefer honest absence.

---

## 1. What shipped (guarded — do not regress)

### Layout
- **Asymmetric tracks** `xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]` — the columns
  are not peers (bounded fact set vs unbounded stream). Measured 1440: dead canvas
  ~421k px² → ~178k. Guard: `tests/e2e/carton-column-balance.spec.ts`.
- **FINDINGS above HISTORY** — history is unbounded, so "last in the column" meant
  "below the fold" on exactly the cartons that had something wrong.

### Activity rows (`/carton/[id]`)
- `cartonEventSignature` (pure, in `carton-inspector-model.ts`) — **a unit's first
  status IS a transition** (`→ RECEIVED`), and the kind is suppressed only when
  something else already said it.
- `StaffAvatar` + name **lead** the meta row, resolved by **staff id** (never a name).
- Station renders as a **glyph** via `resolveStationGlyph` (new, in `timeline-glyphs.ts`)
  + an `sr-only` word. `RECEIVING → unbox` because `StationReceiving` IS `PackageOpen`.

### Timeline
- **`team-note` split from `thread-message`** — a note is written (paper), a message
  is said (bubble). The `NOTE`-before-`MESSAGE` heuristic order is load-bearing.
- **NOTE-family events title from their text.** Deliberately not other types: a
  `RECEIVED` carries machine text that would replace the curated verdict.
- **`notes` plumbed** through `journey.ts` (entity) and `journey-helpers.ts` (browse).
- **Identity chips only when they disambiguate** — single-unit feeds drop the serial
  chip (`mergeStationUnitJourneys`), and the carton ACTIVITY list follows the same rule.
- **The second line is earned by the chips** — chipless rows collapse to one line.
  Measured: History panel 354px → 278px; rows 64/116/116 → 40/90/90.
  Guard: `EventTimeline.rail.guard.test.ts` → "earns the second line with chips".

### Write path
- `settleReturnPairing` in `returned-serial-link.ts` records **`WAIVED`** when a
  return serial matches no order — the state `isTriagePaired` (`triage-focus.ts`)
  has treated as paired since C6.
- `preserveMatchedPairing` on `upsertReceivingTriage` — a background "nothing to
  pair to" writer must never un-match a carton already `MATCHED` to a PO.
- `cartonExceptions` / `cartonFlags`: **a RETURN never asks for a PO**. This is what
  fixes rows already on disk — the write cannot reach them retroactively.

---

## 2. Deliberately NOT done, with reasons

Do not "finish" these without re-reading the reason.

- **Auto-receiving the line on an unfound-return scan.** `quantity_received 0` /
  `received_done_at NULL` means the operator scanned the serial and has not pressed
  Receive. "Not received" is *true*. The unit being `RECEIVED` while the line is not
  is two different facts (unit lifecycle vs line receive-done), not a contradiction.
  Writing a receive there fabricates an operator action.
- **Widening `ALIGN_BY_TYPE.id`.** Untouched; the identifier-alignment ruling in
  `source-of-truth.md` → Grid column justification is still Stream F's job.
- **A Damaged photo bucket, a second lightbox, an `EvidenceStage`.** Settled in the
  photo-triage ruling; the guard blocks all three.

---

## 3. Open work

### 3.1 `save_without_pair` now counts returns — decide what the metric means (P1)

`src/app/api/receiving/triage/metrics/route.ts:51` counts
`COALESCE(rt.pairing_state,'UNFOUND') <> 'MATCHED'`. Since `settleReturnPairing`
started writing `WAIVED`, **every triage-completed return lands in that bucket**.

`WAIVED` is an *answer* to pairing, not a skipped one — so the metric is now
measuring something other than its name. Two readings, and they are materially
different, which is why this was left alone:

- *"saved for unbox without resolving a PO"* → returns belong in it; rename the field.
- *"skipped the pairing step"* → predicate becomes `= 'UNFOUND'`, or
  `NOT IN ('MATCHED','WAIVED')`.

**Ask the operator which number they act on before editing.** Whichever wins, pin it
with a test — there is none today.

### 3.2 Sweep the other COALESCE-invented states (P2)

`grep -rn "COALESCE(rt\.\|COALESCE(ru\." src/app/api src/lib`. Most are
`COALESCE(x, false)` inside a `WHERE`, which is safe (a filter, not a displayed
fact). The dangerous shape is **a COALESCE default that reaches the UI as a value**,
which is what `/api/receiving/[id]:96-97` did.

Rule to apply: if the column is nullable *because the row may not exist*, the API
should distinguish **absent** from **recorded**. Either return `null` and let the
model decide, or return the street row's presence alongside it. Do not add more
`COALESCE(...,'SOMETHING')` to display paths.

### 3.3 Multi-line / multi-PO cartons are still unmeasured (P2)

Everything measured in this pass came from single-line cartons. From the original
prompt's §2.4, still open: does the left rail need help at 4+ lines? Does the
`purchase_orders.length > 1` list duplicate what CONTENTS already says? Should
CONTENTS group by PO?

Also unverified: the **two-line journey row** on a genuinely multi-unit carton. The
rule is guarded at the source level and unit-tested in `merge-station-unit-journeys.test.ts`,
but no one has looked at a real multi-serial carton in a browser. Find one on
dogfood (`SELECT receiving_id FROM ... GROUP BY HAVING COUNT(DISTINCT serial) > 1`)
and check that the chips still line up down the column.

### 3.4 The journey-thumb ruling is still unwritten (P2)

Straight from the original prompt §2.3, untouched: `/carton/[id]` now has three
photo surfaces (the `Photos · N` triage band, the unit-journey thumb strips, the
shared `PhotoViewerPortal`). The thumbs are *probably* right — evidence attached to
a journey event, not a second browser — but that is undocumented and the two
surfaces can disagree about what they show.

**Deliverable: one paragraph in `carton-read.md`.** Either "journey thumbs are event
context and stay" or "journey thumbs deep-link into the triage band's matching
bucket". Do not build a third browse UI, and do not fork the viewer.

### 3.5 `trace-aggregator.ts` drops `notes` too (P3)

Same projection defect as `journey.ts`, but nothing renders `TraceEvent` today — dead
weight rather than a visible bug. Add the field when a consumer appears, or delete
the shape.

### 3.6 The "No matched PO" hint still reads wrong for the cartons that keep it (P3)

`ctaHint: 'Record or match contents in Unbox'` is fine for a PO carton with no match.
It was misleading for returns — those no longer raise the finding at all — but check
the wording still fits once §3.3 surfaces multi-PO cartons.

---

## 4. Settled — do not reopen

| Decision | Where |
|---|---|
| Asymmetric tracks; `2fr/3fr` and data-threshold stacking both measured and rejected | `carton-read.md` |
| Activity lives in col 2 | `carton-read.md` |
| Findings above History, under Activity | `carton-read.md` |
| A first status is a transition (`→ RECEIVED`) | `cartonEventSignature` + tests |
| A note is paper, a message is a bubble | `timeline-glyphs.ts` + tests |
| The second line is earned by the chips | `EventTimeline.rail.guard.test.ts` |
| A RETURN is paired — it has no PO to find | `triage-focus.ts` C6, mirrored in the model |
| `WAIVED`, never `MATCHED`, for a return with no order | `settleReturnPairing` |
| Read surface cannot upload / delete / reassign / write | `carton-inspector.guard.test.ts` |

---

## 5. Verification

```bash
npx playwright test tests/e2e/carton-column-balance.spec.ts --project=qa-desktop
```

```bash
npm run verify
```

Suites touching this work (104 assertions at hand-off, all green):
`carton-inspector-model.test.ts` · `carton-inspector.guard.test.ts` ·
`inventory-events.test.ts` · `timeline-glyphs.test.ts` · `journey.test.ts` ·
`journey-helpers.test.ts` · `returned-serial-link.test.ts` ·
`carton-street-write.test.ts` · `merge-station-unit-journeys.test.ts` ·
`EventTimeline.rail.guard.test.ts`.

**Measure geometry in Playwright, never the preview pane** — CSS grid equalizes cell
heights, so a screenshot cannot see a column imbalance. Measure the last child's
bottom relative to the column top, per column.

**E2E asserts against the QA org.** The QA fixtures are a poor witness for the
imbalance (ratio was already 0.90 there) — the shape only reproduces on a carton with
a real history, so before/after numbers come from dogfood while the permanent spec
asserts on QA. Any dogfood-only spec needs a header comment saying why.

---

## End of hand-off
