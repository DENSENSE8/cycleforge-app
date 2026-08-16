# Hand-off — carton read + timeline honesty (`/carton/[id]`, unit journeys)

**For:** Claude Code / Cursor Agent
**From:** the 2026-08-02 carton-read pass (column balance → activity rows → unfound-return write path)
**Status:** **CLOSED — and the LAYOUT half is SUPERSEDED. Read §0.1 before anything else.**
All §3 work is done; the timeline / write-path / model rulings still stand. The
**column-track ruling was reversed on 2026-08-03**, which retires three rows of
§4 and makes the §3.3 pixel measurement historical.
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050` (never start/restart it). User owns commits.

**Read first:** `.claude/rules/display/carton-read.md` · `.claude/rules/display/reference-timeline.md` ·
`.claude/rules/source-of-truth.md` · [`carton-read-display-polish-CLAUDE-CODE-PROMPT.md`](./carton-read-display-polish-CLAUDE-CODE-PROMPT.md)
(the prompt this continues; its §2.1 / §2.2 are now done, its §2.3 / §2.4 are not).

---

## 0.1 SUPERSEDED — the tracks inverted on 2026-08-03

**This doc argued for a narrow LEFT rail beside a wide unbounded stream. The
product now ships the opposite, and the reversal is correct.** Live SoT:
`.claude/rules/display/carton-read.md` → *The tracks are `2fr | 1fr`*.

| | This doc (2026-08-02) | Ships now (2026-08-03) |
|---|---|---|
| Tracks | `[minmax(0,22rem)_minmax(0,1fr)]` — rail \| stream | **`[minmax(0,2fr)_minmax(0,1fr)]`** — contents \| timeline |
| Wide column | col 2 (timeline) | **col 1 (contents)** |
| Activity | fully expanded in col 2 | **a disclosure** — `events[0]` collapsed, chevron expands, Maximize opens a Dialog |
| Guard asserts | timeline > 1.4× contents | **contents ≈ 2× timeline** |

**Why it flipped, and why that is not a contradiction of the old measurement.**
The 2026-08-02 case rested on one fact: col 2 is *unbounded* and col 1 is not, so
the stream must own the width. Collapsing Activity into a disclosure **removed
that unboundedness** — the right column is now a bounded progress / findings /
history readout, while long line titles in CONTENTS still need room to wrap
honestly. Change the premise and the conclusion has to move. The old ruling was
not wrong on its own premise; the premise stopped holding.

**So do not "restore" the rail**, and do not treat the numbers in §1 or §3.3 as
live targets — they measured a layout that no longer exists. The reasoning method
in §0 (can this value be traced to something recorded?) is the part that carries
forward; the track widths are not.

The reversal landed inside `8ecc85f8c chore: land workspace polish on main for
production` with no handoff of its own, which is why `carton-read.md` is the only
record of it. That is also why this section exists: a "settled — do not reopen"
table that has quietly been reopened is worse than no table.

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
- ~~**Asymmetric tracks** `xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]`~~ —
  **SUPERSEDED 2026-08-03 by `2fr | 1fr` (contents wide). See §0.1.** Kept for the
  record only: the columns are not peers (bounded fact set vs unbounded stream);
  measured at 1440 the dead canvas went ~421k px² → ~178k. The guard
  (`tests/e2e/carton-column-balance.spec.ts`) now asserts the *inverse* ratio.
- **FINDINGS above HISTORY** — still live. History is unbounded, so "last in the
  column" meant "below the fold" on exactly the cartons that had something wrong.

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

> **Worked 2026-08-02.** §3.1 · §3.2 · §3.4 · §3.5 · §3.6 are **closed** (each
> marked below with what landed). One item was spun out:
> [`triage-complete-never-true-HANDOFF.md`](./triage-complete-never-true-HANDOFF.md).
>
> **§3.3 second pass, same day:** the primary witness (6159) is measured at 1440
> and both doubted questions are answered — the asymmetry holds at 4+ lines
> (ratio 0.56, stream 1.8× taller) and journey chips align at one x. Two
> non-blocking witnesses remain unmeasured because the operator's dev server on
> `:3050` went down mid-probe.

### 3.1 ~~`save_without_pair` now counts returns~~ — CLOSED (predicate fixed; the metric is dead for a different reason)

**The premise did not hold, and the real finding is bigger.** `WAIVED` was never
going to pollute the bucket, because **nothing lands in it at all**:
`receiving_triage.triage_complete` is true on **0 of 2474 dogfood rows**, so the
denominator is zero, the route returns `save_without_pair_rate: null`, and
`TriageKpiStrip` (which returns null on a null rate) **has never rendered**.
Root cause measured: `staging_location_id` is null on all 2474 rows, so
`completeTriage`'s readiness gate never opens. Spun out whole, with the
evidence, to [`triage-complete-never-true-HANDOFF.md`](./triage-complete-never-true-HANDOFF.md).

The predicate was fixed anyway, so it is correct for the day the denominator
stops being zero — *"skipped the pairing step"* won, per the operator:

- `PAIRING_ANSWERED_STATES = ['MATCHED','WAIVED']` now lives in `triage-focus.ts`
  beside `isTriagePaired`, which has treated both as done since C6, and the
  metrics route **derives its SQL from that tuple** rather than hand-typing
  `<> 'MATCHED'`. One vocabulary, two readers — a second copy is exactly how
  "waived" would have been filed as "skipped" in a KPI while the bench called it
  done.
- The route keeps its `COALESCE(rt.pairing_state,'UNFOUND')`, and that is not the
  banned shape: it is a filter over rows that already have a triage row
  (`triage_complete = true` requires one), so the null it fills means "completed
  triage, recorded no pairing answer" — which is what the metric counts.
- Pinned: `triage-focus.test.ts` → *pairing answered vocabulary* (3 cases,
  incl. that the set is exactly the two answers, so the SQL complement stays
  exhaustive).

### 3.1b (original text, for the record)

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

### 3.2 ~~Sweep the other COALESCE-invented states~~ — CLOSED

Swept. Exactly one invented **value** reached the UI, at three sites, all the
same one: `COALESCE(rt.pairing_state, 'UNFOUND')` in `/api/receiving/[id]` and
twice in `lines/build-sql.ts`. All three now select `rt.pairing_state` raw.

- **The model decides what absence means, from a recorded fact.**
  `isCartonUnmatched` (carton-inspector-model.ts) raises "No matched PO" on a
  recorded `pairing_state = 'UNFOUND'` **or** `source = 'unmatched'` — the
  latter stamped on the carton by the intake scan when the tracking number
  matched no PO. `cartonFlags` and `cartonExceptions` now share one predicate
  (`cartonLacksMatchedPo`) so the chip and the header's settled-ness cannot
  disagree.
- **Measured before changing anything: zero disagreement across all 2790
  dogfood cartons.** The new predicate raises the finding on exactly the same
  **1192** cartons the COALESCE did — every carton the default used to catch is
  a `source = 'unmatched'` row. What changes is the **751** cartons with no
  triage row: they stop reporting a PO search that never happened, and the
  record footer stops printing "Pairing state: UNFOUND" as a fact.
- **`build-sql.ts` was a deliberate behavior change**, so the frozen
  `legacy-route-sql.fixture.ts` carries the identical edit and says so in its
  header (its own contract). Parity guard still byte-exact: 74/74.
- Pinned: 4 new cases in `carton-inspector-model.test.ts` — absent-vs-recorded
  both directions, a flag/exception agreement sweep over
  `pairing_state × source × is_return`, and `cartonRecordMeta` omitting the row.

**The rest of the grep is genuinely safe**, and the distinction is worth
keeping: `COALESCE(rt.triage_complete, false)` and
`COALESCE(ru.intake_path = 'unbox_only', false)` fill the absence of a
**completion stamp**, and "no stamp" *is* false — unlike `UNFOUND`, which is an
answer. The `COALESCE(x, false)` predicates in `feed-membership-projection.ts`
are filters.

**One left, out of scope and unverified:** `/api/local-pickups:150` selects
`COALESCE(rt.door_received_at, r.created_at) AS received_at` — a row-creation
time displayed under a received-at label. That is the dangerous shape on a
different surface, and on a walk-in "received == created" may well be true.
Someone who owns Local Pickup should confirm before it is touched.

### 3.3 Multi-line / multi-PO cartons — MEASURED in data AND in pixels on the primary witness (P3)

Both layout questions are answered, from the whole tenant rather than one carton.
Rulings written into `carton-read.md`:

- **The rail does NOT need help at 4+ lines — the opposite.** 4+ line cartons are
  **17 of 2792 (0.6%)**, and on exactly those the stream out-grows the rail
  *hardest*: **5.1 lines vs 39.8 events**, ~8:1. Line count and event count are
  positively correlated (a carton with more in it gets worked more), so the
  asymmetric-track premise strengthens at the size that was expected to break it.
  Pulling the same way: **1297 cartons (46%) have zero lines.**
- **The one inverting shape is not worth a layout.** 4 cartons (0.14%) have 4+
  lines and an empty stream. Carton **2402** is the extreme — 12 lines, 8 POs,
  0 events, 0 photos, 0 serials. Nothing has ever happened to it.
- **The `purchase_orders` list does not duplicate CONTENTS.** A contents row
  renders title · ProgressBadge · SKU · condition · serials and **no PO number**,
  so the rollup is the only place the breakdown appears. And it is nearly
  hypothetical: **9 of 2792 cartons (0.3%)** carry more than one PO. Grouping
  CONTENTS by PO would add a header tier to 99.7% of cartons to serve 9 —
  rejected. The real gap is that the two cannot be *joined*; if that needs
  closing, put a PO chip on the row, do not re-shape the column.

**Measured 2026-08-02 (second pass) — the primary witness is done; both
questions that were actually in doubt are answered.** Shapes re-confirmed
against the DB first (`lines` / distinct `receiving_line_zoho.zoho_purchaseorder_id`),
so the witnesses below are still the witnesses.

> **HISTORICAL — measured the pre-2026-08-03 layout (`22rem | 1fr`, Activity
> expanded).** The numbers are real and were correctly taken; the layout they
> describe was replaced the next day (§0.1). Do not re-run this probe expecting
> these figures, and do not cite the 1.8× as a live property. **What survives is
> the chip-alignment finding** — that one is structural, not track-dependent.

**Carton 6159 at 1440×900, dogfood:**

| | Measured |
|---|---|
| Tracks | **352 / 1020** px |
| Extents | **733 / 1310** px — ratio **0.56** |
| Dead canvas | left **203k** px² · right **0** |
| Journey chips | **5**, at **one** distinct left x (561px) |

- **The asymmetry holds at 4+ lines, in pixels, not just row counts.** The rail
  does grow with lines (256px at one line → 733px at seven) and still loses by
  **1.8×** — on a carton *favourable* to it, since 14 events is well under the
  39.8 average for this size. Written into `carton-read.md`.
- **Absolute dead area went UP (178k → 203k) while the ratio improved.** Not a
  regression: taller columns have more room to leave empty. **Compare by ratio,
  not by area.** This is the trap in the original before/after framing and it is
  now called out in the rule.
- **Chip alignment is real and now has a reason attached** — the chip span is the
  first child of `metaBits` on every two-line row, so anything inserted ahead of
  it breaks the column the second line exists to make. Recorded in
  `EventTimeline.tsx`'s second-line docblock, beside the claim it verifies.

**2402 and 5678 were never measured, and now never need to be.** They were queued
against the old tracks; the layout they would have tested no longer ships, and
2402's verdict ("an un-worked carton is not a second shape the surface should
learn") never depended on pixels. **Closed, not deferred** — do not re-queue them.
*(For the record: the dev server went down mid-probe after 6159, cleanly, no
`.next/dev/lock`. An agent must not restart it; ask the operator.)*

| Carton | Shape (re-confirmed) | Tests | Status |
|---|---|---|---|
| **6159** | 7 lines · 1 PO · 5 serials · 14 events | rail vs stream at 4+ lines | **DONE** |
| **5678** | 1 line · 1 PO · 6 serials | journey chip alignment, multi-serial | pending server |
| **2402** | 12 lines · 8 POs · 0 events | the inverting edge + the PO rollup | pending server |

**The probe is a throwaway, deliberately.** It ran from `tests/e2e/` and was
removed again — a dogfood-only spec that hard-fails without the operator's dev
server does not belong in a suite. `carton-column-balance.spec.ts` stays the
permanent guard and stays on QA.

### 3.4 ~~The journey-thumb ruling~~ — CLOSED: thumbs are event context, and they stay

Written into `carton-read.md`. The verdict and why: the band answers *which
photos prove this carton* (match confidence × subject, carton-scoped); the
strips answer *what was photographed at this point in THIS unit's life*
(per-stage, unit-scoped, folded in at the stage timestamp). A thumb is an
attribute of the journey row it sits on the way a `SerialChip` is — remove it and
the row stops saying a photo was taken at that step, which the band cannot say
because it has no per-unit timeline. **Not a second browser; do not unify.**

Deep-linking into the band's bucket was the alternative and is rejected in the
doc: it makes a thumb a navigation control on a reading surface, scrolls the
operator off the journey they are reading, and hands the band's filter state to
the strip.

The third surface — the viewer — is **shared, not forked**, and the doc names
the two things that keep it honest: `CartonUnitJourneyHistory` passes
`galleryPhotos`/`galleryMatchIds` so a thumb opens the whole carton set instead
of the capped per-unit preview (deleting that override silently narrows the
lightbox and the strip still looks right), and both surfaces read **one**
`useReceivingPhotos` query — this component used to hold its own
`['receiving-photos', id]`, so the page fetched twice and the copies could
disagree after a delete.

### 3.5 ~~`trace-aggregator.ts` drops `notes`~~ — CLOSED, and it dropped four, not one

`TraceEvent` was missing `notes`, `actor_staff_id`, `bin_barcode` and `bin_name`
— every field `inventoryEventsToTimeline` had learned to read — while its own
docblock claimed it was "shaped so the client can feed it straight through"
that adapter. All four added.

**The guard is the point.** Plain assignability would not have caught this and
did not: each adapter field is optional (`notes?`, `actor_staff_id?`, …) so
existing callers keep compiling, which is the same property that let the
projection drop all four in silence. So the assertion is on the **keys**, and it
lives in `trace-aggregator.ts` itself, not beside the adapter's tests — because
`**/*.test.ts` is excluded from tsconfig and tsx strips types without checking
them, so a type-level assertion in a test file is evaluated by nothing.
Verified by deleting the field and its mapper line: tsc fails with
`["TraceEvent drops fields inventoryEventsToTimeline reads:", "notes"]`.

### 3.6 ~~The "No matched PO" hint~~ — CLOSED: wording verified, no change

The hint's audience, measured: **1194 cartons** keep the finding, and
`MAX(distinct POs) = 0` across all of them — so §3.3's multi-PO cartons never
keep it (`cartonHasLinkedPo` suppresses every one), and the worry that prompted
this item cannot arise. The split inside those 1194 is what makes both halves of
`'Record or match contents in Unbox'` live: **1007 (84%) have no lines at all**
(→ *record*), **187 have lines but no PO** (→ *match*).

---

## 4. Settled — do not reopen

**Three rows below were REOPENED and reversed on 2026-08-03 — they are struck
through, not deleted, because the reasoning is still worth reading (§0.1).**
Everything not struck through still stands.

| Decision | Where |
|---|---|
| ~~Asymmetric tracks (rail \| stream); `2fr/3fr` rejected~~ → **REVERSED: ships `2fr \| 1fr`, contents wide** | `carton-read.md` · §0.1 |
| Data-threshold stacking rejected — a layout that changes shape on a data threshold teaches two surfaces | `carton-read.md` (survived the reversal) |
| Activity lives in col 2 — **but as a DISCLOSURE since 2026-08-03**, not an expanded stream | `carton-read.md` |
| Findings above History, under Activity | `carton-read.md` |
| A first status is a transition (`→ RECEIVED`) | `cartonEventSignature` + tests |
| A note is paper, a message is a bubble | `timeline-glyphs.ts` + tests |
| The second line is earned by the chips | `EventTimeline.rail.guard.test.ts` |
| A RETURN is paired — it has no PO to find | `triage-focus.ts` C6, mirrored in the model |
| `WAIVED`, never `MATCHED`, for a return with no order | `settleReturnPairing` |
| Read surface cannot upload / delete / reassign / write | `carton-inspector.guard.test.ts` |
| `pairing_state` is never COALESCEd on a display path; the model reads recorded `source='unmatched'` | `carton-inspector-model.ts` + tests |
| `WAIVED` is an ANSWER — the metric counts the complement of `PAIRING_ANSWERED_STATES` | `triage-focus.ts` + tests |
| Journey thumbs are event context; the viewer is shared, the sources differ on purpose | `carton-read.md` |
| ~~The asymmetric tracks hold at 4+ lines (8:1 in rows, 1.8× in pixels on 6159)~~ → **the measurement stands as a fact about the OLD layout; its conclusion does not carry** | §0.1 · §3.3 |
| Column balance is compared by RATIO, never by dead-canvas area — area scales with column height (**still true, and still the trap**) | this doc §3.3 |
| The journey chip span leads `metaBits` on every two-line row; that is what makes the last-8 column | `EventTimeline.tsx` docblock |

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

## 6. State at close (2026-08-03)

**Nothing here is open. Pick this doc up only to read the reasoning, or if a
carton-read layout question resurfaces.**

| | State |
|---|---|
| §1 shipped work | Live, except the tracks (§0.1) |
| §2 deliberately-not-done | Unchanged — re-read the reasons before "finishing" any of it |
| §3.1 · 3.2 · 3.4 · 3.5 · 3.6 | Closed |
| §3.3 | Closed — primary witness measured; the layout it measured was then superseded |
| §4 | Three rows struck through (§0.1); the rest stand |
| Working tree | This task's files are **committed and clean**; the checkout carries ~308 unrelated in-flight files from other lanes |
| Dev server | Back up on `:3050` |

**`npm run verify` is red on `Dead-code (knip)` only, and it is NOT this task's.**
At close the finding was `src/lib/receiving/arrival-new-location.ts → SlotAddress`
— an untouched file from another lane. Earlier in the pass it was six different
findings in `master-nav` / `requester-profile` / `composer-draft`, also another
lane's. **Confirm the finding names your own files before you act on it, and never
refresh the baseline to clear someone else's red** (`verify.md`). Every other gate
is green.

**Spun out and still open:**
[`triage-complete-never-true-HANDOFF.md`](./triage-complete-never-true-HANDOFF.md)
— `receiving_triage.triage_complete` is true on 0 of 2474 dogfood rows because
`staging_location_id` is null on all of them, so `save_without_pair_rate` returns
null and `TriageKpiStrip` has never rendered. That is the live thread, not this doc.

**If you are here to change the carton read layout:** the SoT is
`.claude/rules/display/carton-read.md`, the guard is
`tests/e2e/carton-column-balance.spec.ts` (QA org), and the thing to establish
first is whether col 2 is still bounded — that single premise is what flipped the
tracks once already.

---

## End of hand-off
