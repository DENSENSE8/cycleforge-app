# Unbox guided procedure — INDEX (shared decisions + sequencing)

**Date:** 2026-08-01 · `main` @ `2b92b29f8` · **Lane:** WS-DOGFOOD (`main`)
**Status:** shipped for Unbox (BE-0…BE-5, FE-0…FE-8, plus the 2026-08-02 focus-deck and
card/dock amendments). **Skip / waiver (D10) is designed here and NOT built** — nothing
writes `skipped`.

> **Successor:** [`scan-station-procedure/INDEX.md`](./scan-station-procedure/INDEX.md).
> This file's *Out of scope* — other stations adopting the procedure, and Studio rendering
> it — is that plan's whole subject. **Decisions D1–D12a below remain binding**; the
> successor cites them rather than restating them, and only the INDEX may amend one.
**Treat as ONE change.** Backend and frontend are two execution lanes over one vocabulary. The
vocabulary lives here; neither plan re-declares it.

| Doc | Owns |
|---|---|
| **this file** | the shared decisions (D1–D9), the sequencing, and the rule amendments |
| [`unbox-guided-procedure-BACKEND-PLAN.md`](./unbox-guided-procedure-BACKEND-PLAN.md) | vocabulary declaration, migrations, write waist, receipt read model, OCR endpoint |
| [`unbox-guided-procedure-BACKEND-EXECUTION-PROMPT.md`](./unbox-guided-procedure-BACKEND-EXECUTION-PROMPT.md) | paste-in prompt for the backend lane |
| [`unbox-guided-procedure-FRONTEND-PLAN.md`](./unbox-guided-procedure-FRONTEND-PLAN.md) | `ProcedureStack` DS primitive, step-body registry, PO accordion simplification, contextual composer, receipt display, mobile pairing |
| [`unbox-guided-procedure-FRONTEND-EXECUTION-PROMPT.md`](./unbox-guided-procedure-FRONTEND-EXECUTION-PROMPT.md) | paste-in prompt for the frontend lane |
| [`unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md`](./unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md) | the stack geometry / motion / radius / receipt / time research — **answered; verdict is D12** |

---

## The requested flow, in the operator's words

Scan a tracking number → the carton opens. Above the notes composer, one row says **what to do
next**. Finishing it collapses that row upward and the next one takes its place:

1. Photograph the **shipping label**
2. Photograph the **box**
3. Photograph the **packing material** in the box
4. **Contents** — the items in this box, title + SKU
5. **Condition** — chip slider (desktop **and** mobile) or scan a condition code
6. **Item photos** — per item: what's included · the serial · front · back · sides · bottom
7. **Serial** — scan per item; OCR reads it off the item photos, phone and desktop paired

Any step can show **what comes next** and be waved past when the current one already looks fine —
"packing material's fine, move on" — without pretending the work happened.

Then everything is received and the whole surface becomes a **closed-carton receipt**: what was
done, when, by whom. The bottom bar becomes *reopen to edit*.

Frame chrome: a top row with the **time anchored left** and a **placeholder anchored right**, above
the step rows. The PO accordion is **row-focused at its existing locked width** and is simplified to
one job.

---

## This reverses a twice-rejected placement — deliberately, and it costs three rule amendments

The work-log records two rejections of a step surface in the work canvas (`UnboxCaptureStack`,
deleted `33a3eb609`, *"completely terrible"*; the ambient right-rail region, *"an absolutely terrible
display"*). The operator has now asked for it a third time with a different shape — row-focused,
locked-width, anchored to the composer, ending in a receipt. **That instruction is the decision.**

What it is *not* is free. Three house laws currently forbid this surface, and a plan that lands it
while leaving them standing produces a codebase whose rules describe a product that no longer
exists. Amend them **in the same change**:

| Rule | Today | Amendment |
|---|---|---|
| [`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) | "Unbox has NO tab strip in the workbench body… The step procedure is not in the centre either — it **IS** the `checklist` display" | The procedure **is** the centre. The `checklist` display is deleted (D9). |
| [`display/station.md`](../../.claude/rules/display/station.md) §5 | "One card. The new scan's card **replaces** the previous one." | Scoped exception: *within one carton session* the capture stack accumulates completed step rows. A new **carton** still replaces the whole stack. |
| [`source-of-truth.md`](../../.claude/rules/source-of-truth.md) | Displays strip order includes `Checklist` | Drop `checklist` from `buildUnboxSideTabs`; the strip is Classify · Listings · Units · Zoho + ⋯ |

`station.md` §2 (scan bar pinned top) and §3 (focus lock) are **untouched** — the stack sits between
the bar and the composer and never takes focus from the wedge. That invariant is a Playwright row.

---

## Shared decisions

### D1 — One vocabulary, one declaration: `src/lib/stations/procedure.ts`

The finer steps are added to the existing `unboxProcedure.steps` array. Nothing declares a second
ordered list. `resolveProcedureSteps(procedure, variant, 'capture')` already does phase filtering,
`onlyWhen` / `omitWhen` / `moveBefore`; the new steps use the same machinery.

`derive-capture-step-states.ts` keeps its half of the split — it owns only the **gates** (what counts
as done), and `procedure-divergence.guard.test.ts` keeps failing CI when a declared capture step has
no gate. That contract is correct and survives unchanged.

### D2 — Photo **aspect** is a second axis. Do not add photo types.

`photos.photo_type` encodes **entity legality** — it is the key of the `WRITE_MATRIX` in
`src/lib/photos/stages.ts`, the `require_one` policy gate, and `photo_image_types.key`. Adding
`receiving_shipping_label`, `receiving_box_front`, … would fan that matrix out by six and silently
change what every existing filter, gallery, and gate counts.

Aspect answers a different question — *what does this shot show* — and refines **within** a type:

```
photos.photo_aspect TEXT NULL   -- named CHECK; vocabulary SoT src/lib/photos/photo-aspects.ts
```

| Stage (`photo_type`) | Legal aspects |
|---|---|
| `arrival_package` (`receiving_package`) | `shipping_label` · `box_exterior` — **door/Triage only** |
| `unbox_carton` (`receiving_unbox_carton`) | `shipping_label` · `box_exterior` · `box_interior` · `packing_material` |
| `unbox_item` (`receiving_item`) | `included` · `serial` · `front` · `back` · `side` · `bottom` |

`NULL` is legal and is what every pre-existing row carries. A NULL aspect means *unclassified
evidence*, never *missing evidence* — the receipt says "3 photos" for it, not "step incomplete".

### D3 — A bench capture NEVER stamps `arrival_package`. Non-negotiable.

The operator's step 1 and 2 (shipping label, box) happen **at the bench, after the carton arrived**.
`arrival_package` is the pre-opening door shot and is the only stage `require_one`
(`photo-policy.ts`) counts, precisely so the receive gate cannot be satisfied after the box is open.
So bench label/box shots land **`unbox_carton` + aspect**, not `arrival_package`.

The existing `po_photos` step keeps its real job — *read what the door already shot* — and is renamed
`arrival_check` to stop it reading as a capture step. This is already pinned by
`item-photo-wiring.guard.test.ts` and `unbox-procedure-checklist.spec.ts`; both stay green.

### D4 — Step completion stays **derived**. Nothing is ticked by hand.

The org-editable `checklist_templates` list was deleted 2026-08-01 exactly because a box was ticked
when someone remembered to tick it. Do not re-introduce a `step_completed` row. A step is done when
its **fact** exists: a photo of that aspect, a serial, a grade, a classification.

Two steps genuinely have no fact today, so they get **real columns** — not tick rows:

| Step | Missing fact | New column |
|---|---|---|
| `condition` | `condition_grade` is NOT NULL with a default, so "graded" is indistinguishable from "never touched" | `receiving_line_testing.condition_graded_at` / `condition_graded_by` |
| `contents` | nothing records that a human looked at the item list | `receiving_unbox.contents_confirmed_at` / `contents_confirmed_by` |

Both do double duty: they are the gate **and** the receipt's timestamp.

### D5 — Condition becomes gated, and that is a behaviour change worth naming

Today `condition` is `ungated: true` — the pointer skips it because the grade always exists.
The requested flow makes condition an explicit act, so it becomes gated on
`condition_graded_at IS NOT NULL`. The default grade still pre-selects the chip, so satisfying it is
**one tap or one scan**, never a decision from scratch. The old reasoning ("gating would stall every
carton on a decision already answered") is respected by the pre-selection, not by skipping.

### D6 — The receipt is a READ MODEL, never a table

`resolveUnboxProcedureReceipt(receivingId)` returns the ordered steps with
`{ key, label, state, at, byStaffId, detail }`, derived from `photos.created_at` /
`client_captured_at` / `taken_by_staff_id`, `serial_units`, the two new columns, and
`receiving_unbox` / `receiving.received_at`. Served by `GET /api/receiving/[id]/procedure-receipt`.

`client_captured_at` is the device shutter clock and is **not server-attested** (a drifted tablet
yields a wrong-but-plausible time). The receipt shows `created_at` as the time and offers the shutter
clock only as a secondary detail — the same honesty the column's own docblock demands.

### D7 — Serial OCR composes the existing vision funnel. No new engine, no server-side OCR.

`useLiveLabelScan` already runs: on-device gate (`lib/vision/frame-quality.ts`) → LAN box
(`/api/vision-config` → `NEXT_PUBLIC_VISION_BASE_URL`) → consensus lock over N of M reads. The frame
never reaches Vercel. `useLiveSerialScan` is a **sibling that shares that loop** with a different
remote path and a different consensus predicate (serial shape, not model string).

`POST /api/receiving/identify-serial` normalizes + dedupe-checks a read string against the carton.
It receives **text, never an image** — same contract as `/api/receiving/identify-label`.

**OCR proposes; the operator commits.** A read pre-fills the serial field; it never writes a serial.

### D8 — The composer stays ONE dock, resolved per step

`StationComposerDock` remains the single shell (`slicedActionDockWrapperClass({ docked: false })`,
CTA in `trailingAction`). What changes per step is its **placeholder, footer actions, and primary
action**, resolved through `STATION_TERMINAL_REGISTRY`. This reverses the current
`hasSectionTabs: false` / carton-terminal decision for Unbox — deliberately, because the dock's
primary is now the *step's* commit, not the carton's, and the step is directly above it rather than
in a different region. Cross-region action-at-a-distance was the reason that decision was made; it
no longer applies.

The carton-terminal Print · Receive does not disappear — it becomes the **final step's** commit.

### D9 — ~~Still exactly ONE checklist~~ → **SUPERSEDED 2026-08-02: two views, one derivation**

> **Original:** `buildUnboxSideTabs`' `checklist` tab and `UnboxProcedureChecklist` are **deleted**.
> Two procedure surfaces in one station is the collision the last change closed; do not re-open it by
> keeping a mirror "for reference".

**Reversed at the operator's direction.** The checklist is back as the **first and default** display
in the right-edge Displays push column, and it must update **in real time** — at a scan station it is
what tells the operator the scan landed, including a shot taken on the phone.

The original rule was aimed at a real hazard and named the wrong thing. **The danger was never two
VIEWS; it was two DERIVATIONS** — a mirror that computes its own answer and drifts. Both surfaces now
read one hook, `useUnboxProcedureSteps`, so there is exactly one answer to "is this step done" and
they cannot disagree by construction:

| Where | Surface | Answers |
|---|---|---|
| Centre | `ProcedureCards` | *what do I do right now* |
| Right edge | `ProcedureChecklist` (default display) | *where am I in the whole job* |

Clicking a checklist row moves the centre's card — the map navigates the work. The focused step
therefore lives in a shared store (`src/lib/receiving/procedure-focus-store.ts`), carton-keyed and
ephemeral, never in either surface's `useState` and never in the URL.

**What stays deleted:** the org-editable `checklist_templates` list and its `/api/checklists` CRUD.
A hand-ticked list is the thing that must not come back — a box got ticked because someone remembered
to tick it, not because the photo existed. Completion stays derived.

### D10 — Skip is a **waiver**, not a tick, and it never bypasses a server gate

The operator must be able to look at a step, decide it is fine, and move on. Four rules make that
safe:

**1. `skipped` is a fourth state, distinct from `done`.**
`ProcedureStepState` becomes `'done' | 'active' | 'pending' | 'skipped'`. A skip records that a
person decided to move past this step — it never claims the work happened. The receipt shows it as
skipped, with who, when, and why. This is D4 held, not bent: nothing is falsely ticked.

**2. It composes the ONE waiver shape this codebase already has.**
`receiving_line_testing.serial_absent` + `serial_absent_reason` is the existing pattern — a boolean
waiver plus a Class-D `reason_codes` code (`flow_context = 'serial_absent_reason'`, org-customizable,
code defaults in `src/lib/receiving/serial-absent-reasons.ts`). Skips use a new flow context
`unbox_step_skip` and the same module shape.

**The `serial` step does NOT get a new waiver.** Skipping serial routes to the existing
`serial_absent` store. Two waiver stores for one fact is the note-vs-label grain mistake in a new
shape.

**3. Skippability is declared per step, never assumed.** New `skip` field on `ProcedureStep`:

| `skip` | Means | Steps |
|---|---|---|
| `'waiver'` | advances and **records** a reason code | `shipping_label_photo` · `box_photo` · `packing_material` · `contents` · `condition` · `item_photos` |
| `'pointer'` | advances, records nothing — there is nothing to waive | `arrival_check` (read-only verify) |
| `false` | cannot be skipped | `classify` (you cannot work a carton you cannot name) · `receive` (that is the state machine) |
| `'waiver'` → existing store | routes to `serial_absent` / `serial_absent_reason` | `serial` |

**4. A skip is a POINTER act. It never satisfies or bypasses a server-side gate.**
`photo-policy.ts`'s `require_one`, `transition()`, and the receive validation are unchanged and
unaware of skips. If the org requires an arrival photo to receive, skipping the step leaves receive
blocked — and the stack must **say so at the point of skipping**, not surprise the operator at the
end of the carton. A skip that silently opened a gate would be the same class of bug as a bench
photo stamping `arrival_package` (D3).

A skipped step stays re-enterable: clicking its row in the stack, or **Reopen to edit** on the
receipt, clears the waiver and returns the pointer to it.

### D11 — The pointer is resolved once, by a pure function

With skips, "active" is no longer "the first pending step". It becomes:

```ts
resolveActiveStep(steps, { skipped, focusedKey }): string | null
// focusedKey (operator clicked a done/skipped row) wins;
// else the first step that is neither done nor skipped;
// else null ⇒ every step settled ⇒ the receipt takes the surface.
```

Pure, in `src/lib/receiving/procedure-pointer.ts`, imported by **both** the stack and the receipt.
Same discipline as the receipt guard: two readers, one answer. A pointer computed independently in
the UI is how the stack and the receipt start telling the operator different things about the same
box.

### D12a — **AMENDED 2026-08-02: the centre is a HORIZONTAL CARD RAIL**

The flat vertical ledger below was replaced at the operator's direction with a horizontal card rail —
one card per step on one axis, triaged left-to-right, Apple-Watch style. Anatomy: **big icon left ·
label · quantity right**, on a **white card** with a coloured medallion and leading accent rail
(`steps/step-face.tsx`, functional hues: evidence sky · identity violet · judgement amber ·
traceability emerald).

**What survives from D12 unchanged, and why the amendment is not a contradiction:**

- **No depth pile.** The refused pattern was rows layered *behind* one another. The ban was on
  **occlusion** — it hides the pending steps whose absence killed attempt #1, and covers the
  completion times the receipt exists to show. A horizontal rail occludes nothing: every step is a
  first-class sibling on one axis. Do not reintroduce a z-stacked pile.
- **No scroll-linked animation** (`animation-timeline`, `useScroll`). Travel is CSS scroll-snap, which
  is native scrolling, not an animation — and reduced motion is therefore the browser's problem,
  handled correctly.
- **No layout animation.** Card width changes are a plain reflow in one un-animated frame; only the
  active card's *contents* crossfade (`stationCartonSwap`).
- **No per-step duration, anywhere.** Underivable (`step_started_at` does not exist) and
  evidence-corrupting (a timed operator has an incentive to waive steps).
- **Neither surface takes focus.** The wedge owns it.

The white card is load-bearing, not taste: depth comes from `elevationClass('raised')` against the
canvas ground plane. A fully saturated card puts white-on-colour text at the bench's worst viewing
angle, which is what a warehouse monitor renders worst.

### D12 — ~~The stack is a FLAT LEDGER~~ (superseded by D12a; the refusals below still stand)

Ruled 2026-08-01 against
[`unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md`](./unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md).
The operator asked for six things. **Three are built, three are refused** — and the refusals are
recorded here with their reasons so the next agent does not "restore" them as missing work.

| # | Ask | Verdict |
|---|---|---|
| 1 | Rows layered one behind another, Apple-Watch-like | **Refused** — flat ledger rows instead |
| 2 | Show what's next without hiding the shape of the work | **Built** — every pending step stays a visible row |
| 3 | An exact corner radius | **Built** — card 16px, done row 6px, from `cornerClass` |
| 4 | A scrolling animation | **Refused** |
| 5 | A mobile-app-like confirmation display | **Built**, with amendments (FE-4) |
| 6 | Per-step time breakdown + total time | **Total built; per-step refused** |

**The depth pile is borrowed ornament, and it re-runs failure #1.** watchOS layers rows because a
1.9-inch viewport cannot show two things; a 720px column shows all nine steps with room to spare, so
the pile solves a constraint we do not have. It costs what compression always costs — **occlusion** —
and the thing it would occlude is the right-aligned timestamp on each completed row, which is exactly
what the receipt (D6) exists to expose. Piling *upcoming* steps is verbatim the diagnosis that killed
the first attempt: hiding pending steps so you cannot see the shape of the work before you are in it.
No high-stakes procedural system does this; aviation ECLs and the WHO surgical checklist show the
whole remaining block, and warehouse terminals (ShipStation, Zebra WorkCloud, Amazon FC) swap content
in place. **Completed, active, skipped, and pending steps all render as rows in vocabulary order.**

**The motion ban holds — no exception is carved.** Step advance fires at scan cadence, so it is the
"reflows on its own" case the law names, 9–24 times per carton. At a bench, motion is latency. The
hard cut that reduced motion already produces is not a degradation here; it is the better behaviour,
and it is what everyone should get. Crossfade the active card's *contents*; snap its height and every
row position.

**Per-step duration is not derivable, and displaying it would corrupt the evidence trail.** There is
no `step_started_at`; the only computable number is the gap between consecutive completions, which
includes interruptions, other cartons, and an undefined start for step 1. Presenting that as "time on
this step" is a lie of the same class D4 exists to prevent. Worse, a timed operator has a direct
incentive to **waive** steps to improve the number — and a skip is a real waiver (D10), so the timer
would corrupt the very record the procedure exists to produce. Live per-step timing shown to the
worker has no precedent in professional operations software; it exists in consumer self-quantification
(Strava) and gig apps under different labor classifications, and in fast-food kitchen displays, where
it is a recognised stress anti-pattern. Per-carton cycle time belongs on a manager capacity surface,
not the bench.

Carton-open → received is honest and needs no new column. **It renders once, on the receipt** (FE-4),
as a final number. It does **not** go in the live stack header: the research reply proposed
`headerEnd` for it, but that slot only exists while the carton is open, when the number is not yet
final — so filling it means either a ticking clock (refused above) or a slot that is blank all session
anyway. `headerEnd` ships empty.

**Deferred, not refused: the optical anchor.** Holding the active card at a fixed Y while rows move
under it (FLIP) is the one idea that addresses a real cost — eye re-acquisition after the operator
looks back from the product. It is also a layout animation, so it cannot land under the ruling above
without evidence. The evidence does not exist publicly. Ship the flat ledger first; re-open this only
with a bench measurement.

**What would re-open the depth pile — the one falsifying observation.** This whole ruling rests on a
premise: that the operator *glances at the list to see what is coming*. If a bench observation shows
operators never look ahead and only react to the current prompt, then showing every pending step buys
nothing, the flat ledger is spending vertical space on an unread list, and a compressed or
single-card form (candidate E) becomes correct. **That is the measurement to run** — watch three
cartons and count forward glances. Nothing else in this section should be re-litigated without it.

**Caution on the research reply.** It cited a `CockpitReceiptEntry.origin` type at `hooks.ts:227` to
carry the done-vs-waived distinction. **No such type exists in this repo** — it was fabricated, and
its proposed `'session'` mapping for waivers contradicts D10, where a skip is durably recorded. A
skipped row renders from `state: 'skipped'` + its reason code. Do not go looking for that type.

---

## The new capture vocabulary (the exact declaration)

Order is the resolved `capture` phase for a matched PO carton. Variants compose as today.

| # | `key` | label | phase | stage · aspect | gate | `skip` | variant |
|---|---|---|---|---|---|---|---|
| 1 | `classify` | Classify | capture | — | `isIntakeClassified(row)` | `false` | `onlyWhen: isUnfound` |
| 2 | `arrival_check` | Arrival photos | capture | reads `arrival_package` | `arrivalPhotoCount > 0` | `'pointer'` | verify-only, never captures |
| 3 | `shipping_label_photo` | Shipping label | capture | `unbox_carton` · `shipping_label` | ≥1 photo of aspect | `'waiver'` | `omitWhen: isLocalPickup` |
| 4 | `box_photo` | The box | capture | `unbox_carton` · `box_exterior` | ≥1 photo of aspect | `'waiver'` | `omitWhen: isLocalPickup` |
| 5 | `packing_material` | Packing material | capture | `unbox_carton` · `packing_material` | ≥1 photo of aspect | `'waiver'` | `omitWhen: isLocalPickup` |
| 6 | `contents` | Contents | capture | — | `contents_confirmed_at IS NOT NULL` | `'waiver'` | — |
| 7 | `condition` | Condition | capture | — | `condition_graded_at IS NOT NULL` | `'waiver'` | `perUnit`, **no longer `ungated`** |
| 8 | `item_photos` | Item photos | capture | `unbox_item` · 6 aspects | every **required** aspect has ≥1 photo | `'waiver'` | `perUnit` |
| 9 | `serial` | Serial | capture | — | unchanged (`deriveReceivingStepFlags`) | `'waiver'` → **existing** `serial_absent` | `perUnit`, `moveBefore: isReturn → condition` |

`commit` phase (`print`, `receive`) is unchanged.

**Which item aspects are required is org policy, not a constant.** Ship
`included` · `serial` as required and `front` · `back` · `side` · `bottom` as optional, behind a
Settings Registry key (`receiving.requiredItemPhotoAspects`) — a two-person reseller and a
warranty-heavy tenant do not want the same six-shot minimum, and hardcoding six makes the step
un-completable for the first one.

---

## Sequencing

The backend lane lands first and is independently shippable — every phase is additive and no
frontend change is required for it to be correct.

```
BE-0 vocabulary + aspect SoT (pure)      ─┐
BE-1 migration: photos.photo_aspect       │  ships alone; UI unchanged
BE-2 write/read waist: aspect             │
BE-3 migration: condition/contents stamps │
BE-4 receipt read model + route           │
BE-5 identify-serial route               ─┘
        │
        ▼
FE-0 ProcedureStack DS primitive         ─┐
FE-1 step-body registry + guard           │
FE-2 mount in centre; delete checklist    │  the visible change
FE-3 contextual composer                  │
FE-4 receipt + reopen bar                 │
FE-5 condition chips (desktop + mobile)   │
FE-6 item aspect checklist + mobile studio│
FE-7 serial OCR pairing                   │
FE-8 Playwright                          ─┘
```

**FE-2 is the point of no return** — it deletes the checklist display and amends three rules. Do not
start it until BE-4 is merged and green, or the stack renders steps whose completion it cannot read.

---

## Guards this change must add

| Guard | Pins |
|---|---|
| `photo-aspect-vocabulary.guard.test.ts` | every declared aspect is legal for its stage; the DB CHECK and the TS union agree |
| `procedure-step-body.guard.test.ts` | every declared `capture` step has a registered body component (sibling of `procedure-divergence.guard.test.ts`) |
| extend `item-photo-wiring.guard.test.ts` | no bench mount stamps `arrival_package` **with any aspect** |
| `procedure-receipt-derivation.guard.test.ts` | the receipt reports no step as done that `deriveProcedureSteps` reports pending — one answer, two readers |
| `procedure-skip-contract.guard.test.ts` | every declared step has an explicit `skip`; no `skip: false` step has a waiver writer; `serial` waives through `serial_absent` and **not** the new table |

## Out of scope

- Other stations (Testing, Packing, Shipping) adopting `ProcedureStack` — after Unbox proves out.
- Studio's Procedure lens rendering the new steps — it reads the same declaration, so it follows for
  free; verify, do not rebuild.
- Labels / per-item notes (lane C, shipped) and the identity header (lane A).
