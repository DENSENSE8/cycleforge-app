# EXECUTION PROMPT — Unbox guided procedure · BACKEND lane

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`unbox-guided-procedure-BACKEND-PLAN.md`](./unbox-guided-procedure-BACKEND-PLAN.md)
> **Shared decisions:** [`unbox-guided-procedure-INDEX.md`](./unbox-guided-procedure-INDEX.md)
> This lane ships **alone**. No frontend file is touched. Do not wait for the UI lane.

---

# Cycle Forge — Unbox guided procedure, backend

You are Claude Code in the Cycle Forge monorepo, on `main` (the dogfood/integration lane).

The Unbox bench is being restructured into a guided, step-by-step procedure that ends in a
closed-carton receipt. **Your half is the data model and the read models — none of the UI.** Read
`docs/todo/unbox-guided-procedure-INDEX.md` first: it holds the step vocabulary, the aspect matrix,
and nine numbered decisions (D1–D9) that this prompt does not repeat.

Six phases, in order. Each is independently correct and independently shippable.

## BE-0 — vocabulary (pure, no DB)

1. Extend `unboxProcedure.steps` in `src/lib/stations/procedure.ts` with the INDEX vocabulary table:
   rename `po_photos` → `arrival_check` (and give it `GET /api/receiving-photos`, not POST — it is a
   VERIFY step), add `shipping_label_photo` · `box_photo` · `contents`, narrow `packing_material` by
   aspect, drop `ungated` from `condition`. **One array. Do not create a second ordered list** —
   that collision is what this file's own docblock exists to prevent.
2. New `photoAspect` / `photoAspectSet` fields on `ProcedureStep`.
3. New pure SoT `src/lib/photos/photo-aspects.ts` — the 10-value union, `ASPECTS_BY_STAGE`,
   `isAspectLegalForStage`, `photoAspectLabel`, `parsePhotoAspect`. **`parsePhotoAspect` returns
   `null` on an unknown value and has no default** (`.claude/rules/backend-patterns.md` — a
   classification that decides what a write may claim is never defaulted; this repo has paid for that
   twice, `intakeSurface` and `scanKind`).
4. Extend the gates in `src/components/receiving/workspace/derive-capture-step-states.ts` — aspect
   counts, `requiredItemAspects`, `conditionGradedAt`, `contentsConfirmedAt`. Keep the existing
   "unknown step renders not-done, never throws" behaviour.
5. Settings Registry key `receiving.requiredItemPhotoAspects`, default `['included','serial']`.

## BE-1 — migration A: `photos.photo_aspect`

Nullable TEXT + named CHECK + org-led partial index, **no backfill** (guessing an aspect from
`photo_type` manufactures an evidence claim no operator made). Model it in
`src/lib/drizzle/schema.ts` in the same change. Use the `db-migration-author` skill for the file and
`/db-migrate` to apply — never `db:push`.

## BE-2 — the write + read waist

`POST /api/receiving-photos` accepts `photoAspect`; validate it **against the stage the entity
resolves to**, not the caller's claimed stage. Unknown string → 400. `GET` gains `?photoAspect=` /
`?photoAspects=`, narrowing **within** the existing `photoIntent` (an incoherent-but-well-formed
combination returns `[]`, not 400). New `src/lib/receiving/photo-aspect-counts.ts` with `Deps`
injection. **Do not add aspect counts to the receiving queue SQL** — carton-open reads only.

## BE-3 — migration B: the two missing facts

`receiving_line_testing.condition_graded_at/by` and `receiving_unbox.contents_confirmed_at/by`.
**No backfill** — a stamp asserts a person did something at a time. Stamp them from the condition
route and a new `POST /api/receiving/[id]/contents-confirm`; both support a reopen that sets the
column back to NULL, because that is what makes the receipt's "open again to edit" honest.

## BE-3b — skip waivers

The operator must be able to wave past a step that already looks fine. **A skip is a waiver, not a
tick** (INDEX D10), and this codebase already has exactly one waiver shape — compose it.

1. `src/lib/receiving/step-skip-reasons.ts`, modelled on the existing
   `src/lib/receiving/serial-absent-reasons.ts` (code defaults + org override from `reason_codes`),
   flow context `unbox_step_skip`. Seed it idempotently per org on
   `(organization_id, flow_context, code)`.
2. **⚠ Before writing the flow-context DDL, read `2026-07-29i`'s header.** That CHECK has a history
   of migrations dropping values a previous one added, which is why `2026-08-01a` ships no DDL at
   all. Read the live union, then re-`ADD` it with **every existing value plus `unbox_step_skip`**.
   Dropping `serial_absent_reason` here breaks the serial waiver on every carton in the product.
3. New typed-fact table `receiving_step_waivers` — real cascading FKs to both parents (no trigger
   family needed), org-led unique index on
   `(organization_id, receiving_id, COALESCE(receiving_line_id,0), step_key)`,
   `enforce_tenant_isolation` in the same migration, modelled in Drizzle in the same change.
   `step_key` gets **no** DB CHECK — the vocabulary is PR-reviewed code in `procedure.ts` and the
   guard is the enforcement.
4. `POST` / `DELETE /api/receiving/[id]/steps/[key]/skip`. Validate the step is declared **and**
   `skip: 'waiver'`; validate the reason against the org vocabulary; upsert.
   **`step_key = 'serial'` returns 400 naming the existing `serial_absent` endpoint** — do not
   redirect internally, that is how two waiver stores quietly appear.
5. **A skip writes nothing else.** No stamp, no photo, no status, never `transition()`.

## BE-4 — the receipt read model

`src/lib/receiving/procedure-receipt.ts` → `resolveUnboxProcedureReceipt`, and
`GET /api/receiving/[id]/procedure-receipt`. **It derives every step's state and time from facts
that already exist** (see the per-step table in the plan). It never reads a stored step state, and
you never add one. States are `done | active | pending | skipped`, and **done beats skipped** (a step
waived and then actually done reports done; the waiver row survives for the audit trail).

Also ship:
- `src/lib/receiving/procedure-pointer.ts` → `resolveActiveStep(steps, { focusedKey })`. Pure, no
  I/O. **Both** the receipt and the UI import it; a pointer computed twice is how the stack and the
  receipt start disagreeing about the same box (INDEX D11).
- `blockedBy: string[]` on the response — the real server gates that would refuse
  `mark-received-po` today. **Waivers never appear here and never clear it.** This is what lets the
  UI warn "skipping this leaves receive blocked" at the moment of skipping.

Register the permission in `permission-registry.ts` **and** `route-permission-manifest.test.ts` in
the same change.

## BE-5 — `POST /api/receiving/identify-serial`

Mirror `/api/receiving/identify-label`: it receives **text the LAN vision box already produced,
never an image**. Normalize through `classifyInput`, return candidates with duplicate flags, write
nothing. `{ permission: 'receiving.view' }`.

## Guards you must add

- `src/lib/photos/photo-aspect-vocabulary.guard.test.ts` — the TS union and the DB CHECK list are
  identical, and every aspect is legal for at least one stage.
- `src/lib/receiving/procedure-receipt-derivation.guard.test.ts` — the receipt and
  `deriveProcedureSteps` never disagree about whether a step is done. Two readers, one answer.
- `src/lib/stations/procedure-skip-contract.guard.test.ts` — every declared step carries an explicit
  `skip`; no `skip: false` step is reachable from the skip writer; `serial` waives through
  `serial_absent` and never through `receiving_step_waivers`.

## Do NOT

- Add `photo_type` values for the new shots. Aspect is a second axis; `photo_type` is the entity
  legality key behind `WRITE_MATRIX`, the `require_one` gate, and `photo_image_types` (INDEX D2).
- Let any **bench** capture stamp `arrival_package` — it is the only stage `require_one` counts, and
  a post-opening photo satisfying the receive gate is the exact control this protects (D3).
- Store step completion. It stays derived (D4). **A waiver is not completion** — it records that a
  person chose to move on, and the receipt must be able to tell the two apart.
- Let a skip satisfy or bypass any server gate. `photo-policy.ts`, `transition()` and the receive
  validation stay unaware of waivers (D10 rule 4).
- Create a second serial waiver. `serial` routes to `serial_absent` (D10 rule 2).
- Backfill either new stamp column, the aspect column, or any waiver.
- Touch `src/components/**` or `src/app/m/**`. That is the frontend lane.
- Start, restart, or kill the dev server. It runs on **`:3050`** — attach.
- Raise a ratchet baseline, or `test.skip` around missing data — seed the QA fixtures.

## Done when

`npm run verify` green with no baseline raised; both migrations applied; the two new guards pass;
`unbox-procedure-checklist.spec.ts` still green on `--project=qa-desktop` (it already pins the
arrival-vs-bench distinction and must not regress).

## Report back

1. The final step vocabulary as it now reads out of `resolveProcedureSteps(unbox, {}, 'capture')`,
   including each step's `skip` mode.
2. The migration filenames, and confirmation that none backfills.
3. **The `reason_codes_flow_context_chk` union before and after your migration**, so it is on the
   record that nothing was dropped.
4. Which steps the receipt can time **attestedly** and which fall back to a weaker source.
5. Anything above you believe is wrong.

Commit only when asked. Stage only files you changed.
