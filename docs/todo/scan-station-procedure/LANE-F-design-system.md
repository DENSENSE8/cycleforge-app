# Lane F — the design-system SoT for scan stations

**Index:** [`INDEX.md`](./INDEX.md) · inherits **all of S1–S8**
**Owns:** `src/design-system/components/procedure/types.ts` (the row/state contract) ·
`.claude/rules/**` (merges) · the cross-lane guards
**Blocks:** nothing. Runs continuously, alongside every other lane.

---

## The job

This is the lane the standing instruction names: *constantly raise the source of truth for
the design system for scan stations.* It is not a documentation lane. It owns the
**mechanism** by which the other five leave the floor higher than they found it — the type
contract they all render against, the guards that outlive them, and the single merge point
for rule changes.

It is also the only lane allowed to edit `.claude/rules/**`, and that is the point (INDEX
§3): five agents editing the hottest file in the repo is the most likely way this plan
produces a conflict instead of a platform.

---

## F-1 — the step contract, one type

`ProcedureStepRow` / `ProcedureStepState` are what every procedure surface renders. They
live in F because a type edited by five lanes is a type nobody owns.

**The one invariant to defend above all others:** `skipped` is a fourth state and is
**never drawn as `done`**. Distinct glyph, distinct tone, in every surface — checklist,
deck, receipt, Studio preview. The checklist already gets this right (a chevron, never a
check, with the reason stated in the row: *"a waiver is a decision to move past, not
evidence of work, and this glyph is the only thing carrying that difference"*). Every new
surface inherits that.

Second invariant: **honest absence has a shape**. A summary is `undefined`, not `"0
photos"`; a missing fact renders `—`, never `"N/A"`. A step that cannot answer says so.

---

## F-2 — the guard ladder

Guards are the actual ratchet. Prose is a recipe with an evolution path; a test is
enforcement. F owns the ones that span lanes.

**Already shipped, and now generalised from `unbox` to `listProcedures()`** (with A-2):

| Guard | Pins |
|---|---|
| `procedure-divergence.guard.test.ts` | every declared step has a gate |
| `procedure-step-body.guard.test.ts` | every declared step has a body |
| `procedure-step-face.guard.test.ts` | every declared step has an icon + hue |
| `procedure-step-dock.guard.test.ts` | **no step body renders an action control** (S4) |
| `procedure-receipt-derivation.guard.test.ts` | receipt and derivation agree |
| `receiving-lines-procedure-gates.guard.test.ts` | every gate column survives the wire |
| `procedure-deck-order.guard.test.ts` | the deck is a **transform** — no filter/sort/slice on `steps`; no `space-y-*`; covered z strictly below the peek; one face height; rem geometry; `motion-safe:` on CSS motion |
| `unbox-procedure-checklist-coupling.guard.test.ts` | the deck's compressing geometry and the checklist's reachability **move together** — both halves asserted in one file |

**New, owned by F:**

| Guard | Pins | Lane it protects |
|---|---|---|
| `procedure-surface-parity.guard.test.ts` | every registered procedure has a body registry, a dock registry (or a declared exemption) and a face map — **the second-station checklist, as a test** | the INDEX §6 acceptance test |
| `station-focus-handback.guard.test.ts` | a mutating control on a station surface dispatches `receiving-focus-scan` | C-3 / S5 |
| `procedure-state-render.guard.test.ts` | no surface maps `skipped` to a done glyph | F-1 / S3 |

**A coupling guard asserts BOTH halves, and that is not redundancy.**
`unbox-procedure-checklist-coupling` is the shape to copy when a lane finds a precondition
living only in prose: it asserts the compressing geometry *exists* **and** that the surface
which pays for it is reachable. If the deck is ever legitimately flattened, the first half
goes red — and the correct response is to **delete that guard in the same change**, not to
relax it. Making a pair move together is the whole job; a guard that only checks one side
is satisfied by the exact change that breaks the pair.

**The guard that would have caught the most damage so far** is the parity one. Every defect
in this area has been a *missing registration* that no type caught: a step with no body
(blank card at a bench), a gate column absent from the normalizer (pointer parked forever),
an undeclared `GridSurfaceCapabilities` bag. A registry question is answerable statically;
ask it for every station, in every carton shape.

---

## F-3 — the rules, merged in one pass

Each lane writes finished prose into its own **§SoT delta**. F merges at phase boundaries.

**The merge discipline, in three lines:**

1. **Never merge a rule for unmerged code.** The 2026-08-02 incident: a ruled, present-tense
   section describing a `DockControl` that did not exist, complete with a guard credit the
   guard did not have. It was demoted within a day and only un-demoted by being built. *A
   rule describing code that is not in the tree is worse than no rule* — the next agent
   composes against it and either gets a compile error or believes the behaviour ships.
2. **A new hard law is one line plus a detail file** — never a new section in `AGENTS.md`,
   never a new `@import` in `CLAUDE.md`. The always-on cost is the meter.
3. **Pair every "don't" with a "do".** Bare prohibition lists cause conservative half-fixes.

### The rule files this plan will touch

| File | Expect |
|---|---|
| `display/station-workbench.md` | the dock/card split generalised past Unbox; the deck host contract (B-1) |
| `display/station.md` | the scan→step binding and the cue vocabulary (C-1, C-2) |
| `display/motion-crossfade.md` | B-2's travel ruling; the anchor stays deferred with its falsifier |
| `source-of-truth.md` | one row per new single-source mapping — the procedure registry, the waiver store, the step contract |
| `verify.md` | only if a new gate joins `npm run verify` |

---

## F-4 — the standing sweep

Run this at every phase boundary. It is what "constantly raise the SoT" means operationally.

1. **Did a lane leave a convention where a guard belongs?** Anything repeated in three
   files is a rule; anything a reviewer has to remember is a guard.
2. **Did a lane leave two shapes for one job?** Unify when the SoT is single-consumer and
   unifying is free. Two shapes for two genuinely different jobs is correct — do not
   collapse those.
3. **Did a rule outlive its code?** Grep the rule's named symbols. This is the cheapest
   check in the list and it has caught real drift twice.
4. **Did a baseline get raised?** Baselines only shrink. A raised baseline is a silent
   repeal.
5. **Is the always-on layer still slim?** `grep '^@' CLAUDE.md` is the meter.

---

## What "raised the floor" looked like, concretely

Kept as calibration — these are the moves this lane is trying to make routine, each drawn
from work already landed in this area:

- A **camera pill** repeated across four benches became one `ReceivingPhotoButton` with a
  required, never-defaulted `photoStage` — because a defaulted safety classification had
  already turned bench photos into arrival evidence once.
- Two **procedure vocabularies** that both claimed in their own docblocks to be the
  operator-facing one became one declaration and two phase slices.
- A **step body** that rendered its own action button became a registry entry the dock owns,
  plus a guard that fails on the import — because the regression is one import and it looks
  perfect in a screenshot.
- A **write-once column** (`photo_aspect`) got a second, audited writer, because a photo
  that could never satisfy the step it obviously depicted had no recovery but re-shooting
  the box.
- A **completion time** stopped being resolved twice. The rule *"a time rides only on a done
  step"* moved into the one derivation both readers already call, so the receipt stopped
  re-gating its own copy — and the three steps whose gate column **is** the instant read it
  off the gate, where a caller cannot supply a second answer to disagree with.
- A **precondition that lived in three rule files and no test** — the deck may compress only
  because the checklist stays reachable — became one guard that fails if either half moves
  without the other.

Each is the same move: find the thing that was true by convention, make it true by
construction, and leave a test that says so.

---

## Do not re-open

- **Baselines only shrink.**
- **Hooks and tests are real enforcement; prose rules are recipes** with an evolution path.
  When they disagree, the test is right.
- **Don't `@import` a file you also summarise** — summary plus full import means the model
  reads the same law twice, and that redundancy is the bloat.
- **Don't encode a net-new architecture in prose before it exists in code.** Build the
  better SoT, then document it.
