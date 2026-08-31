# Progression — ruling ledger

Running record of the **Progression interview**: how a unit of work MOVES —
what advances it, what blocks it, what may run backwards, what "done" means,
how a deviation is recorded, and how the state is drawn.

Rulings land here as they are made. Operator rulings are quoted verbatim and
dated. A ruling that contradicts a law in [`LAWS.md`](LAWS.md) is recorded as an
explicit **AMENDMENT** with its law id — never applied silently. When the five
pillars close, the surviving rulings are promoted into the `P` section of
`LAWS.md` with enforcement stated per **X2**.

Companion to [`DESIGN-INTERVIEW-LEDGER.md`](DESIGN-INTERVIEW-LEDGER.md) (the
visual layer, worktree-only). That one rules how it LOOKS; this one rules how it
MOVES.

---

## Measured baseline (2026-08-30, before any ruling)

| # | Finding | Evidence |
|---|---|---|
| **PB1** | **Progression is already modelled SEVEN times, in seven incompatible vocabularies.** No two share a casing convention, a terminal-state set, or a home. | `order-lifecycle.ts:25` `OrderLifecycleStage` (5, SCREAMING) · `order-lifecycle.ts:140` `OutboundStage` · `receiving/carton-readiness.ts:7` `CartonReadinessStage` (5, snake_case) · `receiving/workflow-stages.ts:54` `WORKFLOW_STAGES` (11: EXPECTED→ARRIVED→MATCHED→UNBOXED→AWAITING_TEST→IN_TEST→PASSED/FAILED/RTV/SCRAP/DONE) · `assignment_status_enum` (4, PG enum) · `fba/createFbaLog.ts:7` `FbaLogSourceStage` (5) · `photos/stages.ts:44` `PHOTO_EVIDENCE_STAGES` |
| **PB2** | **`assignment_status_enum` is a real Postgres `CREATE TYPE … AS ENUM`** — head-on collision with **K12** (*"Operator vocabulary is DATA. Never a Postgres enum, never a CHECK."*). Either K12 exempts machine lifecycle from operator vocabulary, or this enum is debt carrying a migration. | `migrations/0000_baseline_through_2026-03.sql:366` |
| **PB3** | **Every P law is unbuilt.** P1–P5 are all `PROSE — not built`. **A7** already asserts stage is the replay's spine and the procedure step a finer level *inside* it — so the two levels must nest, and nothing in code nests them. | `LAWS.md` § P, § A |
| **PB4** | **Progression already has SEVEN renderers and no single derivation.** | `ProgressDots.tsx` · `ProgressBar.tsx` · `ReceivingProgressStepper.tsx` · `ReceivingProgressTab.tsx` · `ProcedureChecklist.tsx` · `ProcedureDeck.tsx` · `StationProcedurePanel.tsx` |
| **PB5** | **The only place progression was ever fought to a spec predates the refactor.** `unbox-procedure-chat-progression-HANDOFF.md` (2026-08-02) ruled *"one derivation, three consumers"* and named a step-level pointer; it cites `.claude/rules/**` files deleted 2026-08-21, so the rule survives only as prose in `docs/todo/`. Step-level machinery that DID land: `procedure-pointer.ts` (`resolveActiveStep` / `resolveNextStepAfter` / `shouldReleaseFocusAfterEvidence`) + `procedure-focus-store.ts`. | `docs/todo/unbox-procedure-chat-progression-{HANDOFF,GROK-RULES}.md`, `src/lib/receiving/procedure-*.ts` |
| **PB6** | **Progression has no event verb of its own.** `ops_events` carries `event_type` as a free string (`'TRACKING_SCANNED'` in the test), and **P2** wants a tick to write one — but no vocabulary exists for *advanced / skipped / reversed / blocked*. | `ops-events.ts:36`, `ops-events.test.ts:116`, `LAWS.md` P2 |

---

## Pillar 1 — What progresses

### PG1 · Progression is ONE nested spine: stage above step
**Ruled 2026-08-30.** Selected: *"Both, one nested spine."* Stage and step are
not two systems — they are two altitudes of one derivation, with one event
vocabulary. Ratifies **A7** (*"stage is the replay's spine today; the procedure
step is a finer level inside it"*) as the shape of the model, not just of the
replay.

Consequences, all intended:
- The seven vocabularies of **PB1** are not seven systems to integrate; six of
  them are candidates for deletion or demotion to a *projection* of the spine.
- A step is meaningless outside its stage. A procedure authored at org level
  (**P3**) is authored **per stage**, not per station — stations are where a
  stage is worked, not what a stage is.
- The replay (**A5**, `table` tile) and the session tile (**P1**, "run") render
  the same derivation at two zoom levels. Not two components — one, given a
  depth.

> Downstream constraint: any new progress readout must name which altitude it
> draws. A bar that silently mixes stage completion with step completion is
> lying about the denominator.

### PG2 · `work_assignments` is the row that carries progression
**Ruled 2026-08-30.** Selected: *"work_assignment."* Progression state hangs off
the unit of work — consistent with **S11** (the assignment is the unit that
survives; the session merely wraps N of them), **K8** (the discriminator is the
smallest thing meaningful to finish) and **D11** (the session may never grow an
entity link).

> **Open consequence — PG2-Q, raised 2026-08-30, not yet ruled.** This deletes
> pre-assignment progression. `CartonReadinessStage` exists precisely to answer
> *"what state is this box in"* before anyone is assigned (`awaiting_scan`,
> `awaiting_unbox`), and `WORKFLOW_STAGES` starts at `EXPECTED` — a PO line that
> exists before any human touches it. Under PG2 as stated, a carton on the dock
> with no assignee has **no stage at all**. Either the pre-assignment states are
> a different concept that keeps its own name, or an assignment is auto-created
> on arrival and "unassigned" is an assignee value rather than an absence.

### PG3 · Evidence advances the pointer; the tick is the fallback
**Ruled 2026-08-30.** Selected: *"Evidence advances; tick is the fallback."* The
scan, photo, or weight a step demands **is** the tick. An explicit tick exists
only for steps with no capturable evidence. `procedure-pointer.ts` already holds
the primitive — `shouldReleaseFocusAfterEvidence`.

Consequences:
- Satisfies the interaction budget (≤3 to act) without spending a keystroke per
  step, and keeps **I1/I8** intact: the evidence arrives through the one
  composer, so no step ever mounts its own control to advance itself.
- **P4 is now insufficient.** `required: boolean` cannot express a required step
  that has no evidence type. A step needs an **evidence contract** — what
  satisfies it — and `required` becomes a property of that contract.
- **P2 gets stronger, not weaker**: the `ops_event` a tick writes is now a
  record of a captured fact, not of an operator's opinion that they did a thing.

> Downstream constraint: a step whose evidence contract is empty is an
> explicit-tick step and must be marked as such in the authoring surface. It may
> never be inferred silently.

---

### PG4 · The queue is not a stage — progression begins at FIRST TOUCH
**Ruled 2026-08-30.** Selected: *"EXPECTED/ARRIVED are a QUEUE, not a stage."*
Closes **PG2-Q**. Before a thing is touched it has **queue membership**, not
progression. A PO line that nobody has scanned is not "at stage EXPECTED" — it
is a row in an inbound queue.

Consequences:
- **Two of `WORKFLOW_STAGES`' eleven keys are deleted** as stages: `EXPECTED`
  and `ARRIVED` become queue membership. The remaining nine are candidate
  stages.
- `CartonReadinessStage` demotes to a **queue facet** — a derivation over the
  queue table, which **Q3** already rules is a table column filter, not its own
  vocabulary.
- **Q1** is where pre-touch things live: a work queue is a table in a tile.
- The scan that starts progression is *also* the evidence for the first step
  (**PG3**). First touch is never a separate ceremony.

> Downstream constraint: no progress readout may count un-touched things in its
> denominator. "12 of 40 received" where 28 were never scanned is a queue depth
> wearing a progress bar's clothes.

### PG5 · Machine `status` and org `stage` are different fields with different owners
**Ruled 2026-08-30.** Selected: *"Split the two."* **K12 is upheld as written,
not amended.** `work_assignments.status` stays a Postgres enum because
`OPEN · ASSIGNED · IN_PROGRESS · DONE · CANCELED` is machine plumbing that no
org renames; K12 governs **operator vocabulary**, and assignment lifecycle was
never that. The org's process vocabulary lands beside it as **data**.

- `status` answers *"is this work still open?"* — the queue's question.
- `stage_key` answers *"where in this org's process is it?"* — the floor's
  question, org-authored rows per **P3**/**K12**.
- **They may disagree, legitimately.** A `CANCELED` assignment sits at whatever
  stage it died at. `DONE` is not "reached the terminal stage"; it is "this unit
  of work is closed". Nothing may derive one from the other.
- Migration is expand-first per **D6**: nullable `stage_key` + the org stage
  table land before any reader.

### PG6 · Evidence claims its own step — progression is NON-LINEAR
**Ruled 2026-08-30.** Selected: *"Evidence claims its own step; pointer jumps."*
Evidence is addressed by **what it is**, not by where the pointer sits. Scanning
the serial step 5 wants, while the pointer is on step 2, satisfies step 5.
Steps 3 and 4 stay open and unticked — nothing is fabricated on their behalf.

Consequences, the first of which is structural:
- **The pointer becomes a suggestion, not a gate.** `resolveActiveStep` stops
  being an authority over what may be captured and becomes a hint about what to
  capture next. Its return value may no longer be used to reject input.
- **Percent-done is a COUNT, never a position** — satisfied required steps over
  total required. A pointer at step 5 of 8 does not mean 5/8.
- Open-behind steps must be visible without a click; a jumped-past step that is
  only discoverable by scrolling back is a trap. (Carried into Pillar 4.)
- Consistent with the identity system: the seeking cycle already resolves *what
  an identifier is* before anything commits, so the routing information needed
  to claim a step is available at keystroke time.

---

## Pillar 3 — Gates & deviation

### PG7 · A stage closes on an explicit COMMIT ACTUATOR, never on its own
**Ruled 2026-08-30.** Selected: *"Explicit commit actuator, always."* Satisfying
the last required step does not close a stage. A human commits it.

Classed by **K7** — *a commit step with a side effect is an ACTUATOR, not a
tool* — so the stage commit is an actuator surface, not a checkbox that happened
to be last. Under **PG6** the capture order is unpredictable, so an auto-close
would fire inventory-affecting side effects off whichever scan landed last, and
the operator could not know in advance which one that would be.

- Cost is **one deliberate keystroke per STAGE**, not per step. The interaction
  budget is spent where the consequence is.
- The commit is the moment `status` may move toward `DONE` (**PG5**) — and it is
  still not a derivation: a commit closes the stage, and whether the *assignment*
  is closed is a separate fact.

### PG8 · A required step may be skipped, and the skip is a recorded DEVIATION
**Ruled 2026-08-30.** Selected: *"Allowed, with a recorded deviation."* **P4**
holds — a required step is not the operator's to delete — but it is theirs to
**override on the record**. The stage commits; the trail carries who overrode it
and why.

> **AMENDMENT — A6, 2026-08-30.** A6 names *"skipped required step, grade
> override, post-commit count adjustment"* as the three cases where free text is
> warranted, then defers the entire law (operator, 2026-08-22). **A6 is
> un-deferred for the deviation cases ONLY.** The every-mutation "why" prompt
> that A6 correctly killed stays dead: intent still comes from the step id.
> Free text is reachable only on a deviation, where the answer is not
> derivable from structure and is known at exactly one moment.

- Refusing the skip outright was rejected on the ground that the floor routes
  around an unenforceable rule, which teaches operators the system lies.
- Governance artefacts land per **D13** — columns on the action, never a
  separate compliance table.

### PG9 · The spine is APPEND-ONLY — a reversal is a new forward event
**Ruled 2026-08-30.** Selected: *"Append-only."* Nothing is deleted or
un-written. A correction is a new `ops_event` that supersedes its predecessor,
and the replay shows the mistake **and** the correction.

Consistent with **A1** (one event spine), **S9** (monotonic `version`, +1 per
accepted mutation) and **D13**. Keeps **D11**'s *"what did this session touch"*
answerable from facts.

> **Raised, for Pillar 4 — PG9-Q.** Append-only is a rule about the DATA, not
> about the interface. An operator who scanned the wrong serial two seconds ago
> must still get something that feels like undo, or they will work around it.
> Whether that affordance exists, and how long its window is, is a rendering
> ruling and is not yet made.

---

## Pillar 4 — How progression is drawn

### PG10 · Progression is drawn on the SESSION TILE. The beam stays identity.
**Ruled 2026-08-30.** Selected: *"Session tile only."* **B2** (*the beam reports
identity, never verbs*) and **B16** (*the beam carries only what survives the
absence of a session tile*) win over **P1**'s "summarized by the beam's pipeline
strip".

> **AMENDMENT — P1, 2026-08-30.** P1's three altitudes become **authored** (a
> Procedures table) and **run** (the session tile's spine). The third —
> *summarized by the beam's pipeline strip* — is **struck before it is built**.
> Progression is a property of the work in front of you; **B18** already refuses
> a beam fallback for session facts, and **B7** has committed the one
> fixed-width header slot to `elapsed / target`.

- Frees the beam from carrying a denominator that changes meaning per altitude
  (**PG1**'s downstream constraint).
- A manager watching N operators reads progression in the replay (**A5**, a
  `table` tile), never in their own beam.

### PG11 · Undo is always offered, and it WRITES a correcting event
**Ruled 2026-08-30.** Selected: *"Undo is always offered; it writes a correcting
event."* Closes **PG9-Q**. No window, no dialog, no timer — one keystroke, at
any time.

The operator's model stays *undo*; the ledger's model stays **append-only**
(**PG9**). Nothing is un-written: the keystroke emits a new forward `ops_event`
that supersedes its predecessor, so the replay shows both.

- Rejected a timed window on the ground that it is a race the operator loses
  exactly when they are busiest.
- No **M5** timer is involved — there is no scheduled state change, only an
  event on a keystroke.
- The undo keystroke is a chord in the one registry (**I7**) and its collisions
  are refused, never shadowed (**T21**).

### PG12 · The progression mark — segmented squares + a `scaleX` fill
Operator ruling: *"unban it you have full control to make an amazing
application."*

**No amendment was made, because none is required.** Pushed back with new
evidence rather than recording a strike:

- **M1 was already amended 2026-08-25** — `transform` struck from the ban
  (*"composites off the main thread and moves no neighbour"*); **M2** now reads
  *"the animatable set is the compositor set: colour, opacity, `transform`,
  `filter`."* A continuously-filling bar animated as `transform: scaleX()` from
  a motion value (**M6**) is **already legal**, runs at display refresh on the
  compositor, and costs zero re-renders.
- What is actually illegal is `ProgressBar.tsx:41`: `animate={{ width }}` over
  **500 ms**. It reflows the document every frame. Unbanning layout would not
  make the bar better — it would bless the janky implementation of it.
- **Divergence found:** main's `docs/warehouse-os/LAWS.md` never received the
  2026-08-25 M-amendments. They exist only in the `warehouse-os-refactor-8f2dc3`
  worktree, so main's copy still bans `transform` outright and caps all motion
  at 80 ms. Two law files disagree about what is legal.

**Resolved 2026-08-30.** Operator selected: *"No strike needed — build it with
scaleX."* **M1 stands unamended.** The mark is:

- **Segmented squares, one per required step** (**F4**, **F5**) — a jumped-past
  open step reads as a gap, which is how **PG6**'s open-behind requirement is
  satisfied without a second component.
- **A continuous stage fill animated as `transform: scaleX()`** with
  `transform-origin: left`, driven by a motion value per **M6**, gated by
  `useReducedMotion`. Legal under the amended M1/M2, composited, zero
  re-renders.
- **Debt named:** `ProgressBar.tsx:41` animates `width` over 500 ms and must be
  ported to `scaleX`. It is a live M1 violation and the frame-dropping one.
- **Debt named:** main's `LAWS.md` must receive the 2026-08-25 M-amendments, or
  the two copies keep disagreeing about what is legal.

---

## Pillar 5 — Progression across people and time

### PG13 · Progression stays on the assignment; ANY operator may resume it
**Ruled 2026-08-30.** Selected: *"Progression stays on the assignment; anyone
may resume."* Parking is lossless (**S4**) and progression already lives on the
assignment (**PG2**), so the assignee clears while every capture stays intact.
The next operator picks the stage up mid-flight.

- **Ownership and authorship are different facts.** The assignment carries the
  current owner; each `ops_event` carries the actor who captured that step
  (**A1**). Two operators sharing a stage never blur into one in the trail.
- Rejected manager-gated reassignment on the ground that a carton blocked
  behind someone who went home gets a second assignment opened on the same box
  — the drift **D12** warns about, created by the control meant to prevent it.

### PG14 · Nothing ages on a clock — age is a QUEUE FACET
**Ruled 2026-08-30.** Selected: *"Nothing automatic."* The spine never changes
state because time passed. A three-day-old open stage is surfaced, not acted on.

- Age becomes a sortable column and a filter facet on the queue table
  (**Q1**, **Q3**) — visible on open, which meets the ≤1-interaction budget for
  a status overview.
- Consistent with **S8** (no absolute timeout ends a session) and **PG9** (the
  spine is append-only; a rollback on a timer would destroy captured evidence
  no human chose to discard).
- No event is written that no human caused, so *"what happened here"* stays
  answerable.

---

## Pillar 2 — The step contract (closed last, because PG3/PG6 defined it)

### PG15 · A step declares a TYPED CAPTURE UNION, and `none` is explicit
**Ruled 2026-08-30.** Selected: *"A typed capture union."* The evidence contract
**PG3** demanded is:

```
scan(EntityKind) | photo | measurement | signature | none
```

- **`scan` names its `EntityKind`** — the same domain union the identity system
  already derives picker labels, selector letters and disclosures from. A step
  that wants a serial says so, which is what lets **PG6** route evidence to the
  step that claims it rather than to the pointer.
- **`none` is an explicit value, never an absence.** It marks an explicit-tick
  step (**PG3**'s downstream constraint) so a tick-step can never be created by
  forgetting to fill a field.
- **`required` moves onto the contract**, superseding **P4**'s bare boolean —
  a step is `{ capture, required }`, and a required `none` step is legal and
  means "a human must assert this".
- Authorable as org data per **K12**; no enum, no CHECK.

### PG16 · Four progression verbs, one per ruled outcome
**Ruled 2026-08-30.** Selected: *"Four verbs."* `ops_events.event_type` gains:

| Verb | Written by |
|---|---|
| `STEP_SATISFIED` | evidence claims a step (**PG3**, **PG6**) |
| `STEP_DEVIATED` | a required step is overridden, carrying the reason (**PG8**) |
| `STAGE_COMMITTED` | the commit actuator fires (**PG7**) |
| `PROGRESSION_CORRECTED` | undo, or any correction (**PG9**, **PG11**) |

Closes **PB6**. Chosen over a single verb with the outcome in jsonb for the
reason **D13** already gives: *"which required steps were skipped"* must be a
`WHERE` on a column, not a payload probe that cannot tell absent from
never-written. `entity_type` is untouched — it stays the deploy-time-fixed
9-value business-object axis pinned byte-for-byte against the DB CHECK, which is
machine vocabulary and therefore outside **K12** exactly as **PG5** draws the
line.

### PG17 · Procedures are authored in a TABLE TILE, edited in place
**Ruled 2026-08-30.** Selected: *"A table tile."* Ratifies **P1**'s own word:
steps are rows, the capture contract is a typed column, `required` is a column.

- **F6** already makes tables grids with in-cell editing, and the `LedgerGrid`
  work is that surface — so authoring adds no new surface, which is P1's whole
  claim.
- **P3** stands: the org row is the default, a staff edit is a delta in the same
  three-state shape `keybindings` uses.
- Rejected the rail tool on **K3** (a tool that grows a second step has become a
  task session) and the settings tile on the ground that a procedure is a daily
  floor artefact, not admin config.

---

## Summary — 17 rulings

| # | Ruling |
|---|---|
| **PG1** | Progression is one nested spine: stage above step |
| **PG2** | `work_assignments` carries progression |
| **PG3** | Evidence advances the pointer; the tick is the fallback |
| **PG4** | The queue is not a stage — progression begins at first touch |
| **PG5** | Machine `status` and org `stage` are different fields, different owners |
| **PG6** | Evidence claims its own step — progression is non-linear |
| **PG7** | A stage closes on an explicit commit actuator |
| **PG8** | A required step may be skipped as a recorded deviation |
| **PG9** | The spine is append-only |
| **PG10** | Progression draws on the session tile; the beam stays identity |
| **PG11** | Undo is always offered, and writes a correcting event |
| **PG12** | Segmented squares + a `scaleX` fill. M1 stands unamended |
| **PG13** | Progression stays on the assignment; any operator may resume |
| **PG14** | Nothing ages on a clock — age is a queue facet |
| **PG15** | A step declares a typed capture union; `none` is explicit |
| **PG16** | Four progression verbs |
| **PG17** | Procedures are authored in a table tile |

### Amendments made

- **A6 · un-deferred for deviations only** (PG8). The every-mutation "why"
  prompt stays dead.
- **P1 · the beam pipeline strip struck** (PG10), before it was built. Two
  altitudes remain: authored, run.
- **P4 · superseded by PG15.** `required: boolean` becomes a field on the
  capture contract.

### Pushed back and held

- **M1 was NOT struck** (PG12). The operator ruled *"unban it"*; the ban turned
  out to be unnecessary — `transform` was already legal as of the 2026-08-25
  amendment, and the compliant `scaleX` fill is strictly better than the width
  tween an unban would have blessed. Operator confirmed no strike.

### Debt named by this interview

| | Item |
|---|---|
| **PD1** | `ProgressBar.tsx:41` animates `width` over 500 ms — a live M1 violation. Port to `transform: scaleX()` on a motion value (**M6**). |
| **PD2** | Main's `docs/warehouse-os/LAWS.md` never received the 2026-08-25 M-amendments; they exist only in the `warehouse-os-refactor-8f2dc3` worktree. Two law files disagree about what is legal. |
| **PD3** | Seven progression vocabularies (**PB1**). PG4 deleted two `WORKFLOW_STAGES` keys; the remaining nine and the other six vocabularies each need a verdict: org-authored stage, projection, or delete. |
| **PD4** | `assignment_status_enum` keeps its four values but **PG5** adds `OPEN`; confirm the enum matches what the code already writes. |

### Still open — not ruled

| | Question |
|---|---|
| **PO1** | May a staff delta (**P3**) override a step's **capture contract**, or only its order and `required`? A staffer who can downgrade a `scan` step to `none` has deleted the evidence trail for their own shift. |
| **PO2** | The undo chord itself — which chord, registered in the one registry (**I7**), collisions refused (**T21**). |
| **PO3** | Migration sequence for `stage_key`, the org stage/procedure tables, the capture contract and the four verbs. Expand → code → contract per **D6**. |
| **PO4** | Whether `PROGRESSION_CORRECTED` supersedes by pointing at the event it corrects, or by carrying the corrected value. Affects whether the replay can render a strikethrough. |

