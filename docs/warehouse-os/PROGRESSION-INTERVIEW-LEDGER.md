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

## Rulings

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
