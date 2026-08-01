# Procedure reconciliation — one declaration, two surfaces

**Status:** drafted 2026-07-31, **merged 2026-08-01**. The bench now resolves its
vocabulary from the declaration; `captureStepVocabulary` is a thin adapter over
`resolveProcedureSteps` rather than a second source of truth.

**For the lane that owns `src/components/receiving/workspace/`:** this touched
`derive-capture-step-states.ts`. It was a provably behaviour-preserving swap —
the earlier guard asserted both sides produced identical sequences across six
carton shapes *before* the change, and that module's own 18 tests pass unchanged
after it. The one open question below is still yours.

---

## The problem

Two surfaces render a station's steps, and they were authored independently:

| Vocabulary | Steps | Renders where |
|---|---|---|
| `derive-receiving-step-states` | photos · serial · print | the 3-dot progress bar |
| `derive-unfound-step-states` | unfound variant | unfound stepper |
| `derive-capture-step-states` → `captureStepVocabulary` | PO photos · packing material · item photos · condition · serial | **the right-rail bench checklist** |
| `stations/procedure.ts` | scan · queue · photos · serial · condition · print · receive | **the Studio Procedure lens** |

The last two both claimed *in their own docblocks* to be "the operator-facing unbox procedure", and they disagreed. An operator taught one procedure at the bench while the owner reads a different one in Studio is worse than either being wrong alone — both look authoritative.

## The resolution: they were never in conflict, they were nested

The bench vocabulary is a contiguous **phase** inside the full station procedure. Naming the phase dissolves the disagreement:

- **`intake`** — how work reaches the bench (`scan`). Studio shows it; the checklist does not, because it has already happened by the time the operator reads the checklist.
- **`capture`** — the per-carton / per-unit acts. **This is exactly what the bench checklist renders.**
- **`commit`** — terminal acts (`print`, `receive`). The terminal dock's job, not the checklist's.

## What each side was right about

| Decision | Winner | Why |
|---|---|---|
| Photo granularity — 3 steps, not 1 | **bench** | The three map 1:1 onto real `photo-intent` stages, and `po_photos` is a **verify** step, not a capture: a bench photo stamped `arrival_package` would satisfy the receive gate with a post-opening image and void the control. Studio's single "photos" step hid that. |
| `print` + `receive` are steps | **Studio** | They are gated operator acts (`label_printed_at`, the receive commit). The bench vocabulary omits them because they aren't *capture* — correct for the checklist, wrong for the procedure. |
| `queue` is a step | **neither — dropped** | Picking from a rail is navigation, not an act performed on the carton. Studio was wrong to declare it. |
| Variants (unfound / local pickup / return) | **bench** | Studio's declaration was flat. Real cartons vary, and the bench already modelled it. The declaration is now variant-aware. |
| `condition` is ungated | **both, independently** | Two files reached it separately: `condition_grade` is NOT NULL with a default, so gating stalls every carton on a decision already answered. |

## The merged Unbox procedure

| # | key | phase | applies |
|---|---|---|---|
| 1 | `scan` | intake | always |
| 2 | `classify` | capture | `isUnfound` only |
| 3 | `po_photos` | capture | always · stage `arrival_package` · **verify, never capture** |
| 4 | `packing_material` | capture | dropped when `isLocalPickup` · stage `unbox_carton` |
| 5 | `item_photos` | capture | always · stage `unbox_item` · per-unit |
| 6 | `condition` | capture | always · **ungated** · per-unit |
| 7 | `serial` | capture | always · per-unit · **moves before `condition` when `isReturn`** |
| 8 | `print` | commit | always |
| 9 | `receive` | commit | always |

## The API

```ts
resolveProcedureSteps(procedure, variant, phase?) → ProcedureStep[]
```

Studio calls it with no phase (whole procedure). The bench calls it with `phase: 'capture'`. **One declaration, two slices, no second vocabulary.**

Variant rules are declarative and compose: `onlyWhen` / `omitWhen` / `moveBefore` — filter first, then reorder, so a reorder composes with an omission instead of fighting it (an unfound return works).

## What is enforced today

`src/lib/stations/procedure-divergence.guard.test.ts` — 5 tests, in `npm run verify`:

1. Bench and declaration produce the **same key sequence** for all six carton shapes (including `unfound return` and `pickup return`).
2. Every step the bench renders is declared `phase: 'capture'`.
3. `intake` / `commit` steps never leak into the checklist.
4. `ungated` / `perUnit` agree on both sides — they change what the operator sees.
5. Photo **stages** agree — the receive gate counts stages, so this is a control, not a label.

Proven to fail correctly: dropping `omitWhen: 'isLocalPickup'` fails with the local-pickup sequence diff; pointing `moveBefore` at the wrong flag fails with the unfound diff.

## What the merge did

1. `captureStepVocabulary` kept its name and signature (so no call site moved) but its body is now `resolveProcedureSteps(getProcedure('unbox'), input, 'capture')` mapped to the bench's `CaptureStepDef`.
2. `CAPTURE_STEPS` and `STEP_CLASSIFY` — the local ordered vocabulary — are **deleted**. The variant rules (drop `packing_material` on pickup, serial-before-condition on a return, prepend `classify` on unfound) now live once, declaratively, on the declaration.
3. `CaptureStepDef.key` widened from the closed `CaptureStepKey` union to `string`: this module no longer gets to close the set. `CaptureStepKey`, narrowed by `isCaptureStepKey`, became the separate question of which keys it can **gate**.
4. The gate switch got a safe fallback — an unknown key renders **not done** rather than throwing, because a bench that crashes mid-carton is far worse than one showing an extra unchecked row. CI catches it first (below).

## What the guard enforces now

The sequence comparison is tautological once both sides read one declaration, so it was replaced by the two invariants that keep it that way:

1. **The bench declares no second ordered vocabulary** — a module-level step array is exactly how the four-way split happened. *(Proven: re-adding `const CAPTURE_STEPS = [...]` fails.)*
2. **Every declared `capture` step has a gate** — a declared step with no gate renders permanently unchecked and blocks the operator, so it fails in CI instead of at the bench. *(Proven: removing `packing_material` from `GATED_KEYS` fails.)*

Plus: intake/commit steps never leak onto the bench, and every carton shape still resolves a usable sequence (`pickup return` exercises an omission and a reorder at once).

**Still open — your call:** should the declaration also own the *gate* (photo counts, serial-vs-expected)? My read is no: a gate needs the live row and the declaration is deliberately fetch-free, which is why the split above is where it is. But you own that.
