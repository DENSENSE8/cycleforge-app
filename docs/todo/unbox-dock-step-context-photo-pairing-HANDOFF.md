# Unbox bottom dock — per-step leading zone + photo pairing · HANDOFF

**Date:** 2026-08-02 · **Lane:** WS-DOGFOOD (`main`, uncommitted) ·
**Status:** **Stream B shipped** (2026-08-02) · **Stream A is a plan** — §0 is
resolved and the rules section is demoted; §2 below is now the plan-of-record,
not a description of code. See **§7 — What shipped**.
**Sibling handoff:** [`unbox-procedure-deck-FOLLOWUPS-HANDOFF.md`](./unbox-procedure-deck-FOLLOWUPS-HANDOFF.md)
— the deck's own tail. **Do not do that work here.**
**Binding rules:** [`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md)
§ *The dock's LEADING zone…* · [`source-of-truth.md`](../../.claude/rules/source-of-truth.md)
§ *Omnichannel composer dock* / *Note vs label grain* ·
[`backend-patterns.md`](../../.claude/rules/backend-patterns.md)

---

## 0. RESOLVED 2026-08-02 — the rules section is demoted to a plan

`.claude/rules/display/station-workbench.md` carried a ruled, present-tense
section titled **“The dock's LEADING zone is step-contextual; its TRAILING
terminal is not (2026-08-02)”**, with a two-row table, a `DockControl` per step,
and a derived scan echo. **None of it existed:** no `DockControl` in `src`, no
dock slot on `UnboxStepBodyContext`, no `activeKey` reader in the composer — and
the section credited `procedure-step-body.guard.test.ts` with an assertion it
does not make.

Per §4, Stream B shipped **without** Stream A, so the section was **replaced** in
the rules with the inverse statement — *the composer is the whole leading zone;
a step's own controls are LOCAL controls in that step's body, `CartonPhotoStepBody`
being the reference* — plus a pointer back to §2 here and an instruction to
restore the ruling only in the change that builds it. The guard credit went with
it.

§2 below is therefore the **plan**, kept verbatim because its reasoning (why the
cross-region ban does not apply to an adjacent column; one note target; the echo
is derived; a step control is not a dock kind) is exactly what a future
implementer needs. Read it as *“if we build this, this is the contract”* — not as
a description of the tree.

---

## 1. The dock as it actually is

```
LineEditPanel  dock={ … }
└── slicedActionDockWrapperClass({ docked: false })      ← absolute float over canvas
    └── pointer-events-auto · STATION_WORKBENCH_COLUMN
        ├── {terminalVm.disabledReason}                  ← optional amber line
        ├── <UnboxProcedurePager row={row} />            ← NEW 2026-08-02
        └── <WorkspaceNotesCard … trailingAction={<StationTerminalDock embedded/>} />
                └── OmnichannelComposerDock
                    ├── textarea → receiving_line.notes
                    ├── footer: [+] … [sync]
                    └── trailingAction: ▾ | 🖨 Receive
```

Facts that constrain everything below:

- **The trailing terminal is carton-terminal.** `STATION_TERMINAL_REGISTRY.unbox`
  is `hasSectionTabs: false` + `defaultKind: 'mode-default'`, so the primary is
  always Print · Receive.
- **One note target.** The composer writes `receiving_line.notes` and only that
  (`source-of-truth.md` → *Note vs label grain*). `label_note` is the printed
  face and is written by the label editor.
- **The dock floats**, so the scroll body's bottom padding is the only thing
  keeping content out from under it — `reserveScrollClearance="pager"` →
  `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE`. **A row added to the dock must be
  added to the clearance**, or the deck's peek slides under it (that shipped as a
  4px overlap and was caught only by measuring).

---

## 2. Stream A — the leading zone becomes step-contextual

### The split, and why it does not re-open the cross-region ban

| Zone | Scope | Contract |
|---|---|---|
| **Leading** | the **active step** | that step's own control + a derived scan echo + the note field. Swaps with `activeKey`. |
| **Trailing** | the **carton** | Print · Receive. **Never** re-labelled, step-scoped, hidden or animated. |

`station-workbench.md` bans a control in one region re-labelling a control in
another — that ban is about the **Displays column on the right edge** reaching
across the workbench to rewrite the bottom button. The active step is set in the
column **directly above** the dock: same region, adjacent, and it is the
operator's current work. What the ban protects is that *the commit* stays
unambiguous, and it does — Receive means the same thing on every step.

### Three invariants inside the split

1. **One note target.** The placeholder may name the step; the column it writes
   may not. A step-scoped note store is forbidden.
2. **The scan echo is DERIVED**, from `useUnboxProcedureSteps` — never a
   component-local tally, and it never claims a completion the derivation has
   not made. Honest absence is `—`.
3. **A step control is a LOCAL control, not a dock kind.** No step ids in
   `STATION_TERMINAL_REGISTRY`, and no imperative bridge from the deck into the
   dock. Both read the same hook, so they cannot disagree — the same guarantee
   that lets the deck and the checklist coexist.

### Where the control comes from

Add an optional `dock` render to the step registry, beside the existing body:

```ts
// line-edit/steps/types.ts
export interface UnboxStepDockContext extends UnboxStepBodyContext { /* … */ }
export type UnboxStepDock = (props: UnboxStepDockContext) => ReactNode;

// line-edit/steps/index.ts
export const UNBOX_STEP_DOCK_CONTROLS: Partial<Record<string, UnboxStepDock>> = { … };
```

`Partial` on purpose: **not every step earns a dock control**, and a registry
that demands one invites a placeholder button. `contents` and `classify` are
already whole-body surfaces; a dock control for them would be a second door onto
the same edit.

If you make it required, `procedure-step-body.guard.test.ts` must grow the
assertion the rule file already claims it has.

**Do not thread the controller in.** `UnboxStepBodyContext`'s docblock is
explicit: passing `useUnboxLineController` into every body re-creates one level
down exactly the coupling the accordion split dismantled. Add narrow fields or a
slot.

### Motion + focus

- The leading zone crossfades on `activeKey` with `motionRole.swap.scan` (the
  station-cadence preset, `duration: 0` exit). Not `swap.focus` — this is a scan
  bench.
- The trailing terminal **does not animate at all**. It is the one thing on the
  screen that must not move while the operator reaches for it.
- Every control here dispatches `receiving-focus-scan` after it acts, on the same
  60ms defer as the deck and the pager. A dock control that eats the wedge is the
  most expensive bug on this surface because the failure is silent.

---

## 3. Stream B — photo pairing (forward and backward)

### The gap, stated precisely

The three bench carton shots share one stage and are told apart by **aspect**:

```
shipping_label_photo → aspect 'shipping_label'   ┐
box_photo            → aspect 'box_exterior'     ├ all stage 'unbox_carton'
packing_material     → aspect 'packing_material' ┘
```

The gate is `cartonAspectShot(input, step.aspect)` — one photo of *that aspect*
on this carton. Gating on the stage count instead would let one photo satisfy all
three, which is why it is written that way.

**But `photo_aspect` is only ever written at INSERT.** The single writer is
`create-photo.ts`, stamped from the `photoAspect` form field
(`upload-client.ts`). Verified: there is no PATCH, no update, nothing.
`PATCH /api/photos/[id]/reassign` moves a photo's **entity link** between cartons
and lines; it does not touch aspect.

So today: **a carton photo shot from the wrong step — or from any surface that
sends no aspect at all — can never satisfy the step it obviously depicts.** The
operator's only recovery is to re-shoot the same box. That is the same shape of
defect as the `normalizeRow` gap fixed on 2026-08-02: every layer correct in
isolation, no error anywhere, the pointer parked forever.

`photo-aspects.ts` already says `NULL` means *unclassified evidence, never
missing evidence* — a receipt says "3 photos" for it. The product currently has
no way to classify it afterwards.

### What to build

**B1 — the write path.** `PATCH /api/photos/[id]/aspect`, house route skeleton
(`backend-patterns.md`): `withAuth` → validate → domain helper → 404/409/200 →
`recordAudit` → `after()` for cache/realtime.

- Permission: **`receiving.upload_photo`**, matching the reassign sibling. Do not
  mint a new one — an ADMIN-only gate 403'ing the floor operator this is built
  for is the `integrations.zendesk` failure.
- Body `{ aspect: PhotoAspect | null }`. Parse with `parsePhotoAspect`, which
  returns `null` on unknown **and has no default**. An unknown string is a 400,
  not a null.
- **Reject an aspect that is illegal for the photo's stage** —
  `isAspectLegalForStage(aspect, stage)`. This is the load-bearing check:
  `arrival_package` legally carries only `shipping_label` and `box_exterior`
  because it is the pre-opening door stage and **the only stage the `require_one`
  receive gate counts**. Letting a bench aspect land there would void that
  control. 400, never a silent widening of `ASPECTS_BY_STAGE`.
- **Paired audit actions** — `RECEIVING_PHOTO_ASPECT_SET` /
  `…_CLEARED`, like `RECEIVING_LABEL_PREVIEWED` / `…_REOPENED`, so a rollup
  cannot count a retraction as a classification. The column is overwritable, so
  `audit_logs` is the only place the original claim survives.
- Overwrite, do not COALESCE. Re-classifying is a new claim about the same photo.

**B2 — forward: from a step, pair an existing photo.** In the `shipping_label_photo`
/ `box_photo` / `packing_material` step (leading dock control or step body — see
§4), offer *"pair an existing photo"* beside the camera:

- List this carton's `unbox_carton` photos, **unclassified first**, then ones
  carrying a different aspect (re-classifying is legal and audited).
- Pick one → `PATCH` with this step's declared aspect → the step goes `done` on
  the next derivation, on **both** surfaces, because they share
  `useUnboxProcedureSteps`.
- The aspect comes from the **step declaration** (`aspectByKey`), never typed at
  the call site — same rule that keeps `CartonPhotoStepBody` serving three steps.

**B3 — backward: from a photo, name what it shows.** In the carton photo gallery,
let a photo be assigned or cleared. Same route, same audit. This is what makes a
phone capture that arrived with no aspect recoverable without re-shooting.

**Compose the existing precedent, do not fork it.**
`MovePhotosBetweenPoPanel` is already the bidirectional photo-move surface
(forward: select photos here → pick a target; back: pick a source → select its
photos), built on `ClaimPhotoPicker` and hosted by `ReceivingToolPushStack`. The
picker and the push host are the reusable parts. Aspect pairing is the *same
gesture over a different column*, so it should read like a sibling of that panel,
not like a new tool.

### Traps

- **Aspect is a CLAIM, so it is never defaulted.** `photo-aspects.ts` rule 1 and
  `backend-patterns.md` § *A safety classification is a REQUIRED parameter*. The
  codebase has already paid for this twice (`intakeSurface` → `'triage'`,
  `scanKind` → `'work'`). A pairing UI that pre-selects "probably the box" is the
  same bug with a friendlier face.
- **`photo_aspect` is not `photo_type`.** Do not add
  `receiving_shipping_label`-style types; that fans out the `WRITE_MATRIX`, the
  `require_one` policy gate and `photo_image_types` by six and silently changes
  what every existing filter and gallery counts. The two axes stay orthogonal.
- **Extending the vocabulary means both halves in one change** — the
  `PHOTO_ASPECTS` union *and* the `photos_photo_aspect_chk` CHECK.
  `photo-aspect-vocabulary.guard.test.ts` fails otherwise, and it is right to.
- **Invalidate what the deck reads.** `useReceivingPhotoStageCounts` feeds
  `cartonAspect`, and the deck gates on it. After a successful pair, refresh
  through `refreshReceivingPhotos` and publish the carton's realtime photo event
  — the same channel the phone capture uses, so a pair made on the desktop shows
  on the phone and vice versa.
- **Never let pairing satisfy the receive gate it must not.** Re-check
  `require_one` behaviour explicitly with a test that pairs an `arrival_package`
  photo and asserts the gate is unchanged.

---

## 4. The one open design question

**Does the pairing entry live in the dock's leading zone, or in the step body?**

Both are defensible and the streams are separable — B1/B2/B3 can ship with the
entry in the **step body** (where `CartonPhotoStepBody` already renders
`ReceivingPhotoButton`) and no dock work at all.

- **Body** — it sits with the camera it is an alternative to, needs no new
  registry, and does not touch the clearance constant. Cheapest, and it keeps
  Stream A genuinely optional.
- **Leading dock zone** — the operator's hand is already there, and it is the
  argument for Stream A existing at all. Costs the registry, the crossfade, and
  a clearance re-measure.

**Recommendation: ship B1–B3 into the step body first.** It closes a real
data-integrity hole (a photo that can never satisfy its step) without waiting on
a chrome refactor, and it gives Stream A a concrete second control to justify the
registry — instead of a registry built for one hypothetical caller.

If you take that route, §0's decision resolves to *demote the rules section to a
plan* until Stream A actually lands.

---

## 5. Verification — non-negotiable

- Dev server is the user's on **`:3050`** — attach, never start.
- E2E on the **QA org** (`--project=qa-desktop`). Fixture via
  `/api/receiving-entry` + `/api/receiving/add-unmatched-line`, open with
  `/unbox?openReceivingId=…&lineId=…`. **Do not `waitForLoadState('networkidle')`**
  on `/unbox` — the realtime channel means it never settles.
- Prove the round trip **through the UI, not just the route**: upload a carton
  photo with no aspect → the step is `pending` → pair it → the step is `done` on
  the deck **and** on the right-edge checklist → clear it → `pending` again.
  The 2026-08-02 `normalizeRow` bug is the reason "the route returned 200" is not
  evidence.
- Assert the illegal-aspect rejection (`arrival_package` + `packing_material` →
  400) and that `require_one` is unaffected.
- If a dock row is added: re-measure the clearance. The deck's peek must not
  overlap it — `data-procedure-zone="queued"` bottom vs `[data-procedure-pager]`
  top, geometrically, not by screenshot.
- Confirm focus returns to `data-station-scan-input` after every new control.

---

## 6. What shipped (2026-08-02) — Stream B, in the step body

Took §4's recommendation: **B1–B3 into the step body, Stream A stays a plan.**

| # | Landed as |
|---|---|
| §0 | rules section replaced with its inverse + a pointer here (see §0 above) |
| B1 | `src/lib/photos/set-photo-aspect.ts` (+ 12-case DB-free test) · `PATCH /api/photos/[id]/aspect` · `AUDIT_ACTION.PHOTO_ASPECT_SET` / `…_CLEARED` · manifest + a `route-permission-manifest.test.ts` regression pinning `receiving.upload_photo` |
| B2 | `CartonPhotoPairPanel` → **“This one”**, one click, using the step's declared aspect |
| B3 | same panel's `⋯` menu — name ANY aspect legal for the stage, or **Clear** |
| — | `photo-aspects.ts` module doc now names its **two** writers (INSERT + this) |
| — | `data-procedure-checklist` on the DS checklist root, so a probe can name which of the two procedure views it means (`data-procedure-deck` already existed) |

Decisions worth not re-litigating:

- **The panel lists `unbox_carton` only.** An `arrival_package` photo legally
  carries just the two pre-opening aspects, and moving a photo *between* stages
  is reassignment — a different verb with its own route. Offering the pair here
  would teach that stages are interchangeable.
- **`aspect` is a required body field; `null` IS the clear.** A missing key is a
  400, and an unknown string is a 400 rather than falling through
  `parsePhotoAspect`'s `null` — otherwise a typo silently retracts a correct
  claim.
- **Idempotency compares the RAW stored string**, not the parsed form. A row
  carrying a value this build does not recognise must still be clearable;
  comparing parsed would call that write idempotent and leave the garbage in
  place forever. Pinned by a test.
- **A no-op writes nothing and audits nothing** — the route only audits when
  `idempotent` is false, so a wrong answer there fills the trail with
  classifications nobody made.
- **The list opens on demand** (`enabled: open`). The camera is the default path;
  a list nobody opened is a request nobody needed.

### Verification status — honest

- `npx tsx --test src/lib/photos/set-photo-aspect.test.ts` — **12/12 green**
  (needs `--require ./scripts/register-server-only-shim.cjs`, same as its
  `reassign` sibling; `npm run verify` supplies it).
- `tests/e2e/unbox-photo-aspect-pairing.spec.ts` **test 2 green** on
  `--project=qa-desktop`: illegal-aspect 400, missing-key 400, unknown-string
  400, legal set 200, and `require_one` arrival evidence unaffected afterwards.
- **Test 1 (the UI round trip) did not run.** The dev server's build is broken by
  unrelated in-flight work — `ColumnResizeHandle.tsx` is deleted in the working
  tree while `OrdersQueueColumnHeader.tsx:52` still imports it, and that graph
  reaches `app/layout.tsx`, so every route 500s. Re-run once the tree builds:
  ```
  npx playwright test tests/e2e/unbox-photo-aspect-pairing.spec.ts --project=qa-desktop
  ```
- **Clearance was NOT re-measured** — correctly: nothing was added to the dock,
  so `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` is untouched. That check comes
  back the day Stream A does.

### Left for Stream A

The dock's leading zone. It now has a concrete second control to justify the
registry (`CartonPhotoPairPanel` beside the camera) instead of one hypothetical
caller — which was §4's whole argument for sequencing it this way.

---

## 7. Do not re-open

- **One note target** (`receiving_line.notes`); the trailing terminal never
  re-labels.
- **Nothing is ticked by hand.** Pairing is not a tick — it classifies a photo
  that *exists*. It never claims evidence the carton cannot answer for, which is
  exactly why it is allowed where a checklist tick is not.
- **`skipped` is never drawn as `done`.**
- **Nothing on this surface takes focus**; controls hand focus back via
  `receiving-focus-scan`.
- **No per-step duration, anywhere.**
