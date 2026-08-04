# Lane D — the backend that keeps the record honest

**Index:** [`INDEX.md`](./INDEX.md) · inherits **S2 · S3 · S7 · S8**
**Owns:** `src/app/api/receiving/**` · `src/app/api/photos/**` · migrations ·
`src/lib/receiving/derive-*` · the receipt read model
**Blocks:** E-1 (via D-2). Otherwise starts immediately.

---

## The job

A procedure's value is the record it leaves. This lane owns the facts: the columns a step is
gated on, the waiver store that makes a skip honest, the receipt that reads it all back, and
the realtime that makes a bench display true within a scan.

Every phase here is **additive and independently shippable** — the UI does not have to
change for the backend to be correct. That is the property that let the last backend lane
land ahead of its frontend, and it should be preserved.

---

## The failure mode this lane exists to prevent

Read this before writing a migration. It has happened three times.

**A gate column must survive the WIRE, not just the schema.** `normalizeRow` in
`/api/receiving-lines` is a strict allowlist with no passthrough. A column added to the
builders but not to the normalizer reaches the client as `undefined` — **indistinguishable
from "not acknowledged"**. All three acknowledgement stamps shipped exactly that way:
routes wrote them, builders selected them, gates read them, and the steps could never go
done. Nothing threw. The pointer just parked forever.

`receiving-lines-procedure-gates.guard.test.ts` exists because of this. **Any new gate
column is not done until that guard covers it.** Every layer looked correct in isolation,
which is why this is a test and not a comment.

---

## D-1 — the waiver store (S3)

The single largest gap in the shipped platform. `skipped` is a declared state that nothing
writes.

**It composes the ONE waiver shape this codebase has** — `serial_absent` +
`serial_absent_reason`, a boolean waiver plus a Class-D `reason_codes` code
(`flow_context`, org-customizable, code defaults in a `src/lib/receiving/*-reasons.ts`
module). Skips use a new flow context per station and the same module shape.

**The `serial` step does NOT get a new waiver.** Skipping serial routes to the existing
`serial_absent` store. Two waiver stores for one fact is the note-vs-label grain mistake in
a new shape, and that one cost a migration to undo.

**A skip never opens a server gate.** `require_one`, `transition()` and the receive
validation stay unaware of skips. If the org requires an arrival photo, skipping the step
leaves receive blocked — **and the surface must say so at the point of skipping**, not
surprise the operator at the end of the carton. A skip that silently opened a gate would be
the same class of bug as a bench photo stamping `arrival_package`.

**Reversible.** A skipped step stays re-enterable: reopening clears the waiver and returns
the pointer to it. Paired audit actions (`…_WAIVED` / `…_REOPENED`), never one action with
a null `after` — a rollup must not count a retraction as a waiver.

### Guard

`procedure-skip-contract.guard.test.ts` — every declared step has an explicit `waiver`
(A-1); no `waiver: false` step has a writer; `serial` waives through `serial_absent` and
**not** the new store.

---

## D-2 — the receipt, generalised

`resolveUnboxProcedureReceipt` exists and is Unbox's. Make it the station-generic read
model — **a read model, never a table.**

It returns the ordered steps with `{ key, label, state, at, byStaffId, detail }`, derived
from the facts: `photos.created_at` / `taken_by_staff_id`, `serial_units`, the
acknowledgement stamps, the waiver store, and the terminal commit.

**`client_captured_at` is the device shutter clock and is not server-attested.** A drifted
tablet yields a wrong-but-plausible time. The receipt shows `created_at` as *the* time and
offers the shutter clock only as a secondary detail — but it must show both, because a
queued mobile upload drains hours after the box was opened and a concealed-damage dispute
turns on which of the two you are looking at.

**One answer, two readers.** `procedure-receipt-derivation.guard.test.ts` already pins that
the receipt reports no step as done that the derivation reports pending. Extend it to
`skipped` (A-3) and generalise it across registered procedures.

### The instant contract, as it actually shipped (2026-08-02)

Two consumers now want a step's completion time — the bench deck and the receipt — and the
split between them is the part to preserve when generalising:

| Question | Owner |
|---|---|
| **WHICH** instant is a step's completion | the **caller**, via `DeriveCaptureStepStatesInput.evidenceAt` — the bench resolves it from the photo payload it already holds, the receipt from aggregate SQL |
| **WHETHER** that instant may be shown | `deriveProcedureSteps`, and nowhere else — `at` is emitted only on a `done` step |

`attach()` in the receipt takes the resolved instant as a parameter rather than re-gating
its own copy, so *"a time rides only on a done step"* is expressed once for both readers —
the same discipline that makes the STATE impossible to disagree about.

**The three acknowledgement steps are the exception, and it is structural.** For
`condition` / `contents` / `label` the gate column **is** the instant, so `stepCompletedAt`
reads it off the gate input and a caller-supplied `evidenceAt` entry for those keys is
deliberately **ignored**. Two callers passing the "same" instant twice is two chances to
pass different ones. A new gate column of that shape inherits the exemption — add it to the
switch, not to the caller.

**A new station's `evidenceAt` is a Lane D deliverable, not a bench guess.** The bench can
only resolve instants for facts it already fetches; `classify` and `serial` have none on the
client and render **honest absence**, while the receipt fills both because it can see the
audit row and the provenance. That asymmetry is correct — two surfaces answering with what
each actually knows — and it must not be closed by having the bench invent a nearest-instant.

### Guard

Already extended: `procedure-receipt-derivation.guard.test.ts` pins that an acknowledgement
step reports its **own** gate instant rather than a caller-supplied one, and that every
*other* done step with no resolved instant reports `null` — never a fabricated time.
Generalise both across `listProcedures()` with A-2.

---

## D-3 — realtime: the display must be true within a scan

`useUnboxProcedureSteps` subscribes to the carton's photo channel, so the checklist
reflects a scan — **including one taken on the phone** — the moment it lands. A station
display that lags the scan is worse than none: the operator trusts it and re-shoots.

Generalise the publish side. Every write that satisfies a step publishes on the station
channel: photo insert/delete **and update** (the `update` action was added 2026-08-02 for
aspect classification), serials, grades, acknowledgement stamps, waivers.

**Do not let a subscriber start branching on `action`.** Today all three subscribers
invalidate unconditionally, which is what made widening the union safe. A subscriber that
switches on it must handle every member, and an aspect change must never be counted as a
photo arriving.

**Publishing is `after()`, never blocking.** A realtime failure degrades to a stale display
that the next poll fixes; it must never fail the write.

---

## D-4 — the honest-absence audit

A sweep, not a feature. For every step gate across the registered procedures, answer: *can
this fact be absent for a reason other than "not done yet"?* Three known shapes:

- **Unclassified evidence.** A photo with `NULL photo_aspect` is *unclassified*, never
  *missing* — the receipt says "3 photos" for it. The `PATCH /api/photos/[id]/aspect` route
  (2026-08-02) is what makes it recoverable without re-shooting.
- **A failed fetch is not a zero.** A read surface that renders "no evidence" on an error
  sends the operator to re-shoot evidence that exists. Every procedure read must branch
  `isError` separately from empty.
- **Unsettled is not empty.** Counts are zero until the payload arrives; a consumer that
  treats un-hydrated zeros as evidence paints a confident wrong active step for one beat
  and then jumps. `settled` exists for this and every new consumer must gate on it.

---

## Requests to other lanes

- **A:** `waiver: { flowContext }` on the step (A-1), and `resolveActiveStep`'s `skipped`
  input landed **before** D-1 writes any, so the field arrives empty and changes nothing.
- **E:** an authored procedure must not be able to delete a step whose gate a server
  control depends on. D declares which those are; E enforces it (`authored: false`).

---

## Do not re-open

- **Nothing is ticked by hand** (S2). No `step_completed` row, ever. The org-editable
  checklist and its CRUD are deleted and stay deleted.
- **A step with no fact gets a real column**, not a tick row — and the normalizer is part
  of shipping it.
- **A receive may SET a note, never CLEAR one it was not given** (`COALESCE`). The mobile
  QA sheet erased desktop notes this way once.
- **A QA fail reason is a code, not prose** — it decides the `qa_status` the receive writes.
- **`photo_aspect` is not `photo_type`.** Two orthogonal axes; do not fan out the write
  matrix.
- **Per-step duration** (S8). There is no `step_started_at` and adding one is a
  labour-practice decision, not a schema decision.
