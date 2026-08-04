# Lane A — the procedure MODEL

**Index:** [`INDEX.md`](./INDEX.md) · inherits **S1 · S2 · S3 · S7 · S8**
**Owns:** `src/lib/stations/procedure.ts` · `src/lib/receiving/procedure-pointer.ts` ·
`procedure-focus-store.ts` · the procedure guards
**Blocks:** every other lane, via **A-1**. Land A-1 first and land it complete.

---

## The job

One station has a declared procedure. Nine do not. This lane makes the declaration a
**platform surface**: any scan bench registers a procedure, every consumer resolves it the
same way, and the shape of a step is rich enough that Lanes C, D and E do not each invent a
side-channel for the fact they need.

It is deliberately the **least visible** lane. Nothing it ships changes a pixel. Everything
downstream depends on it being right.

---

## A-1 — the field surface (THE blocker)

Add the fields the other lanes need, all at once, before they need them. Fields only — no
behaviour change, no second station yet. `unboxProcedure` fills them in and the resolved
output is byte-identical to today.

**Prove that last claim.** Snapshot `resolveProcedureSteps(unbox, variant, phase)` across
all six carton shapes × three phases *before* the change and assert equality after. That is
the same technique the procedure-reconciliation merge used, and it is why that swap was
safe to make blind.

### The fields, and who asked

| Field | For | Shape | Why it lives on the step |
|---|---|---|---|
| `scanKinds` | **C** | `readonly ScanKind[]` | what a scan MEANS at this step. Without it C has to hardcode a step→kind map, which is a second vocabulary (S1) |
| `waiver` | **D** | `false \| 'pointer' \| { flowContext: string }` | skippability is declared, never assumed (S3). `{ flowContext }` names the `reason_codes` slice; `'pointer'` advances and records nothing |
| `authored` | **E** | `boolean` | may an org add/remove/reorder this step in Studio? `false` for anything a server gate depends on |
| `dockControl` | **G** | `string \| null` | which control the dock's leading zone shows. An ID, not the step `key` — keying on `key` quietly assumes every station's `condition` step wants the same control |
| `evidence` | **D**, **B** | `{ kind: 'photo' \| 'serial' \| 'stamp' \| 'none', … }` | what fact satisfies it — B renders the read-only body from this, D derives the receipt row from it |

**Do not add a `description` field — `summary` already is one.** `ProcedureStep.summary` is
declared on every step today, operator-voiced, with its own docblock (*"One line,
operator-voiced: what the person does here"*). It is simply never carried past
`captureStepVocabulary`, which drops it, so no surface has ever rendered it. A-1's job for
that field is **four lines of plumbing**, not a new declaration: carry it through
`captureStepVocabulary` → `deriveProcedureSteps`.

Carry it as **`description`** on the row, not `summary`. `ProcedureStepRow.summary` in F's
`types.ts` already means something else — the right-hand fact (`"3 photos"`, `"2 of 5"`) —
and it is already rendered. Two facts, two names; overloading the field loses one of them
silently. B-5 is the consumer.

**`waiver: false` and `authored: false` are different bans and both are needed.** `receive`
is not waivable *and* not authorable. `arrival_check` is `'pointer'`-waivable but
**not** authorable — an org must not delete the step that reads the evidence its own
receive gate counts. Collapsing them into one flag loses that case.

**`scanKinds` is a hint, not an override.** The classifier still wins on an unambiguous
payload; a GS1 Digital Link is a unit scan on every step. What `scanKinds` buys is
disambiguation of the *ambiguous* case — see Lane C, which owns that rule.

### SoT delta (hand to F)

> A step's SKIPPABILITY, its SCAN VOCABULARY and its AUTHORABILITY are declared on the
> step, in `procedure.ts`. A consumer that infers any of the three from the step's `key` has
> forked the vocabulary — the `key` is an identifier, not a schema.

### Guard

`procedure-field-completeness.guard.test.ts` — every declared step in every registered
procedure has an explicit `waiver` and `authored`. **No defaults.** A defaulted safety
classification is the bug this codebase has paid for three times (`intakeSurface` →
`'triage'`, `scanKind` → `'work'`, and the `push` prop on the support rail). Absent is a
compile error, not a shrug.

---

## A-2 — from one procedure to N

Register procedures for the scan benches that have one in practice but not in code:
**Testing** (`test`), **Pack** (`pack`), **Triage** (`triage`), **Shipping** (`outbound`),
**Local Pickup** (`pickup`).

**Do not invent these. Read them out of the code that already performs them.** Each bench
has step-state helpers, a terminal registry slice and a workspace; the procedure is a
transcription of what those already do, phase-tagged. A procedure that describes work the
bench does not perform is worse than no procedure — it is an SOP nobody follows, and it
will be believed.

**Start with Testing and stop.** It is the INDEX's acceptance test (§6). Land Testing, run
the whole platform against it, and only then do the remaining four. Registering five
procedures before one has been rendered is five guesses.

### Generalise the guards, don't copy them

`procedure-divergence.guard.test.ts`, `procedure-step-body.guard.test.ts` and
`procedure-step-dock.guard.test.ts` are written against `unbox`. Rewrite each to walk
`listProcedures()`. A per-station copy is exactly the fork these guards exist to catch, one
altitude up.

The body/dock registries are per-station and that is correct — different domains, different
components. What generalises is the **question** ("does every declared step have one?"),
not the answer.

### SoT delta (hand to F)

> A scan bench's procedure is DECLARED in `procedure.ts` and registered in
> `registerBuiltinProcedures()`. A bench performing an ordered procedure it has not declared
> is invisible to Studio, to the checklist, and to the receipt — and it will be described
> wrongly by all three.

---

## A-3 — the pointer, with skips

`resolveActiveStep(steps, { focusedKey })` is pure and shared with the receipt read model.
It has **no skip input**, because nothing writes skips yet (INDEX §2). This phase closes
that, in step with Lane D's waiver store.

```ts
resolveActiveStep(steps, { skipped, focusedKey }): string | null
// focusedKey (operator reopened a settled row) wins;
// else the first step that is neither done nor skipped;
// else null ⇒ every step settled ⇒ the receipt takes the surface.
```

**Sequencing inside the phase:** the pointer must accept `skipped` *before* D writes any,
so the field can arrive empty and change nothing. Ship the signature, then D fills it.

**`skipped` is never drawn as `done`.** That is the whole point of the fourth state, and it
is the one thing a reviewer should check first in every surface that renders a step.

### Guard

Extend `procedure-receipt-derivation.guard.test.ts`: the receipt reports no step as `done`
that the derivation reports `pending` **or `skipped`**. Two readers, one answer.

---

## Requests to other lanes

- **D:** the waiver store's shape (`reason_codes` flow contexts per station) must be
  readable as `{ stepKey → { skippedAt, reasonCode } }`. A-3 consumes exactly that.
- **E:** an authored procedure resolves through `resolveProcedureSteps` like any other. If
  Studio needs a different resolver, tell A — do not add one.

---

## Do not re-open

- **Completion is derived** (S2). This lane owns sequence, never completion.
- **`queue` is not a step.** Picking from a rail is navigation, not an act performed on the
  carton. It was declared once and correctly dropped.
- **Phases are three** (`intake` · `capture` · `commit`) and the bench renders `capture`.
  That split is what dissolved the Studio-says-7 / bench-says-5 disagreement; a fourth phase
  needs a new *surface*, not a new grouping.
- **Per-step duration** (S8).
