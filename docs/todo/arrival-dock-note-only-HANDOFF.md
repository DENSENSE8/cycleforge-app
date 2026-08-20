# Arrival dock — one note field, staging to the centre

**Status:** SHIPPED (code). Rules updated + `pnpm verify` clean for this change
(2026-08-19 session). **STILL not visually verified** — see below.

**Why the browser pass keeps not happening:** `:3050` is up, but the `next dev`
serving it runs with cwd `/home/michaelgarisek/cycleforge-app` — a SEPARATE
clone of this repo (HEAD `846d7e77b`, still carrying `ArrivalDockScanEntry.tsx`).
This checkout is `/home/michaelgarisek/Projects/cycleforge-app`. Anything opened
at `:3050` — by hand or by Playwright, whose `PW_BASE_URL` defaults there — is
reading the OTHER tree, so it renders the pre-change dock (scan cell + staging
in Band 1). Confirmed by driving `/triage` on the QA org: the dock still
contained the deleted `Scan a location barcode to place this carton` input,
which no longer exists in this repo's source. **An agent may not start a dev
server** (`workflow-safety.md`) — the operator has to point `:3050` at this
checkout before step 1 of the paste-prompt below is even possible.

The staging control's centre geometry was fixed 2026-08-19 from the STATIC
evidence instead (it carried dock chrome — no section seam, no eyebrow, a fixed
`h-11` band with full-bleed abutting segments — into a plane whose named twin,
`UnboxPlacementSection`, uses seam + eyebrow + `py-2`). That fix is reasoned
from the twin, **not** eyeballed; it still wants the browser pass.
**Scope:** Arrival / Triage bottom dock only. Unbox untouched.
**Date:** 2026-08-20

Paste the prompt at the bottom into a fresh session. Everything above it is the
context that prompt assumes.

---

## What changed

The Arrival floor was `[scan cell][shelf select][lane select]` + a Staging label.
It is now **one carton-note entry**, mirroring the Unbox dock.

| File | Change |
|---|---|
| `src/components/receiving/triage/ArrivalCartonNotesEntry.tsx` | **NEW** — composes `OmnichannelComposerDock` (`chrome="bare"`), writes `receiving.support_notes` |
| `src/components/receiving/triage/TriagePanel.tsx` | dock `leading` → the note entry; `stepContext` "Staging" → "Note"; `ArrivalStagingDockControl` remounted in the **centre** plane under `POUnboxingSection` |
| `src/components/receiving/triage/ArrivalStagingDockControl.tsx` | `scanCell` prop removed (nothing passes it); docblock rewritten for its new home |
| `src/components/receiving/triage/ArrivalDockScanEntry.tsx` | **DELETED** |
| `src/lib/governance/domain-job-baseline.json` | dropped the deleted file's entry |
| `src/components/receiving/workspace/line-edit/UnboxNotesLocationControl.tsx` | `@justification` no longer points at a file that does not exist |

Nothing on the Arrival bench now claims focus or a scan sink — no `autoFocus`,
no `.focus()`, no `useRegisterScanSink`, no `receiving-focus-scan`. The wedge
stays pointed at the sidebar ingest bar.

---

## Locked decisions

| # | Decision | Ruling |
|---|---|---|
| 1 | Notes column | **`receiving.support_notes`** (carton grain), NOT `receiving_line.notes`. A door note describes the box; on a multi-line PO the line column would mean silently picking one of N lines, and it would collide with the note the Unbox operator later writes on that same buffer. Grain split is house law (`source-of-truth.md` → Note vs label grain). |
| 2 | Write path | Existing `PATCH /api/receiving/[id]` (`route.ts:495`) — the same route `useTriageStaging` already uses. **No new API was invented.** |
| 3 | Composer | `OmnichannelComposerDock` (house SoT), not a fork of Unbox's `LineNotesCard` — that one is bound to the line column and carries label-note ghost autocomplete. Sibling on the shared primitive, per `pattern-evolution.md`. |
| 4 | Staging | **Relocated to the centre, not deleted** — see the blocker below. |
| 5 | Scan cell | Deleted outright. The operator asked for the floor to be one field. |

---

## The blocker that shaped this — read before "finishing" the removal

The request was *remove staging from the dock entirely*. Staging could not be
**deleted**, only moved, because the server gate refuses the station's terminal
action without it:

```ts
// src/lib/receiving/complete-triage.ts:113
const ready = !!rt && rt.staging_location_id != null && rt.priority_lane != null;
// :137 → 'Assign a shelf and a priority lane before saving for unbox.'
```

With no control anywhere, **every Save-for-unbox would 4xx** and Arrival would
have no way to complete a carton. The centre is also the right long-term home:
it is the Arrival twin of Unbox's centre `UnboxPlacementSection`, and staging is
this station's ops flow.

**Still open:** if staging should genuinely leave Arrival, that is a change to
`completeTriage`'s readiness gate — a product/data decision with audit reach
(`emitEntitySignalSafe` carries the lane/shelf in its meta). Do not relax that
gate as a side effect of a UI change.

---

## Watch this column

Staging is now **mouse-only**. That `<select>` alone is exactly the state that
measured **zero human writes to `staging_location_id` across 2474 cartons** —
the finding that caused the scan cell to be built in the first place (its
docblock, now in git history at `ArrivalDockScanEntry.tsx`).

If the column flatlines again, the answer is a **scan affordance somewhere**,
not a bigger dropdown. The reasoning is preserved in
`ArrivalStagingDockControl`'s docblock so the next person meets it in the code.

---

## Live law that is now STALE — fix in the same PR

Two rule files describe the shape this change replaced. They will mislead the
next agent, and a rules file cannot fail on its own:

- `.claude/rules/source-of-truth.md` → *Arrival port (2026-08-09)*: says
  "**Staging** is the flush dock Band 1 ACTION (`ArrivalStagingDockControl` via
  `UnboxDockHost`)" and "no Omnichannel notes — **notes live on Unbox**".
  Both are now false.
- `.claude/rules/display/station-port-from-unbox.md` → Arrival scorecard row:
  "Staging in Band 1", "notes stay Unbox-only". Both now false.

---

## Enforcement context (2026-08-20)

**All 20 `*.guard.test.ts` files were deleted this session** at the operator's
direction, after an audit found 15 of 17 recoverable ones were `readFileSync` +
regex over source text — the exact shape `AGENTS.md` § Guard authoring bans —
and 5 of 20 were quarantined RED. Consequences for anyone reading the rules:

- **Rule files reference guards that do not exist**, and did not exist before the
  deletion either — `column-reference.guard.test.ts`,
  `receive-note-preservation.guard.test.ts`,
  `station-displays-reachability.guard.test.ts` were all `HEAD=NO`. Treat every
  "Guard: `x.guard.test.ts`" line in `.claude/rules/**` as unverified.
- Three untracked guards were destroyed with no git copy
  (`spine-find-placement`, `rail-search-trailing`, `station-scan-handle`).
- The agreed replacement ladder is the one already in `AGENTS.md`: import
  boundary → `.dependency-cruiser.cjs`; syntax/prop ban → ESLint AST;
  geometry → TS props; **behaviour → a mounted DOM test**. Layers 1 and 3 are
  already wired and green in verify; layer 2 has zero consumers today.

**This change therefore has no automated guard.** If one is wanted, the honest
one is a mounted DOM test asserting the Arrival dock renders exactly one entry
field and no scan input — not a regex for `ArrivalDockScanEntry`.

---

## Verify like this

`:3050` was refusing connections, so the dock was never looked at. **The
relocated staging control is the thing to eyeball** — it was styled as a flush
dock band (`h-11`, abutting segments) and now sits in the centre plane, so its
geometry is the most likely visual defect.

```bash
pnpm verify
```

Checked at the time of writing: typecheck clean in every Arrival file, lint
0 errors, knip 0 new findings from this change.

**Pre-existing reds from another session in the same tree** (not this change):
`src/lib/support/suggest-reply.ts` type error (`Promise<string>` vs `string`),
plus 4 knip findings in the support-vision / hermes / product-updates work.

---

## Must-ship

1. Visual check of the centre staging control at 1440 (geometry, not behaviour).
2. Update the two stale rule sections listed above.
3. `pnpm verify` green **for this change's files**.

## Never-ship

1. Relaxing `completeTriage`'s shelf+lane gate as a side effect of UI work.
2. Writing the Arrival note to `receiving_line.notes` — wrong grain, and it
   collides with the Unbox composer.
3. A second scan sink or focus target on the Arrival bench — ingest stays the
   sidebar bar's job.
4. Re-adding a `readFileSync` + regex guard for any of this.

## Out of scope

- Unbox's dock, notes, or placement section.
- The `staging_location_id` zero-write problem itself (watch item, not a task).
- The other session's `suggest-reply` / hermes work.

---

## Paste for a new session

```
Read docs/todo/arrival-dock-note-only-HANDOFF.md and finish it.

The Arrival dock change is already SHIPPED in code but was never seen in a
browser (the dev server was down). Do these three, in order:

1. Attach to the operator's dev server on :3050 (NEVER start/restart it) and
   open /triage with a carton selected. Confirm: the bottom dock is ONE note
   field, no scan cell, nothing steals focus. Then check the shelf/lane control
   now mounted in the CENTRE plane under the items list — it was designed as a
   flush dock band (h-11, abutting segments), so verify it does not read as a
   stray dock strip floating in the centre. Fix its geometry if it does.

2. Update the two stale rule sections named in the handoff
   (.claude/rules/source-of-truth.md → Arrival port;
    .claude/rules/display/station-port-from-unbox.md → Arrival scorecard row):
   staging is centre, not Band 1; Arrival now HAS a carton note field writing
   receiving.support_notes.

3. `pnpm verify`. Typecheck + knip reds in src/lib/support/suggest-reply.ts and
   the hermes / product-updates files belong to ANOTHER session — report them,
   do not fix or inherit them.

Do NOT relax completeTriage's shelf+lane readiness gate. Do NOT move the note to
receiving_line.notes. Lane: stay on the checkout's branch; the user manages
commits.
```
