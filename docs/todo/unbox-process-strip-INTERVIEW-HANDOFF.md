# Interview handoff — the Unbox tab strip as a PROCESS, not a priority list

**Status:** INTERVIEW IN PROGRESS. No decision recorded. No code written.
**Copy everything below into a fresh session to resume the interview.**
Repo: `cycleforge-app` · attach to `:3050`, never start a server.

---

## What the operator asked for, verbatim

> "I need there to be a process like display for the display tables in the unboxed mode, so when
> you're looking at the data list for unbox the buttons on the top must be displayed in terms of the
> order of process, order of operations. So first you would have incoming, then arrival in queue
> display, then what, then history"

Note the trailing **"then what"** — the operator is *asking* where the middle of their own pipeline
went. That is the most interesting thing in the sentence and the interview should not paper over it.

---

## Ground truth (verified 2026-08-08 — do not re-derive, do not trust memory)

**Today's strip** (`UNBOX_WORKSPACE_TABS`, `src/utils/unbox-workspace-state.ts`):

```
Urgent · Recent · Queue · All  │  History        (+ Inbound, when pinned)
                                 ↑ dividerBefore: id === 'history'
```

**The ordering rule is stated in that file's docblock, and it is NOT process order:**

> *"System strip order. Urgent leads (priority work); Recent is the operator's own set; Queue is the
> station backlog; All is typed cross-inbound triage; History (archive) stays last with a divider."*

That is **urgency + ownership**. The request replaces the band's organising principle. Treat it as a
ruling, not a reorder.

### What each tab actually is

| Tab | Wire value | What it really is | A process stage? |
|---|---|---|---|
| `urgent` | `?unboxview=urgent` + `priority_only=1` | a FILTER on the scanned feed | ✗ lens |
| `recent` | `?unboxview=viewed` | **this operator's own opens** (`receiving_line_views`) | ✗ personal MRU |
| `queue` | `?unboxview=queue` → `view=scanned` | the station backlog — door-scanned, not yet unboxed | ✓ |
| `all` | `?unboxview=all` | cross-inbound typed triage (`TechAllTriageTable`) | ✗ lens |
| `history` | param omitted (**the default**) | the archive | ✓ (terminal) |
| `incoming` | `?unboxview=incoming` | **already exists** — catalog-pinned extra, label **"Inbound"**, added 2026-08-07 | ✓ (upstream) |

### Adjacent facts that constrain the answer

- **Arrival is a different station.** `/triage`, its own bench, its own vocabulary
  (`triview: triage | found | unfound | done`). The spine keeps scan stations separate deliberately.
- **History is the DEFAULT tab** (its param is omitted). A process strip that starts at Inbound and
  defaults to the last stage is incoherent — the default has to be re-decided.
- **Tabs render counts** (`tabCount(id)`), and the grains differ: Inbound counts **PO lines**, Queue
  counts **scanned cartons**, History counts **lines**.
- The carton pipeline SoT is `ReceivingCartonPipeline` — **Scanned → Unboxed → Received**.
- Sibling strips (Testing, Pack, Shipping, Triage) share this band shape. Whatever is decided here
  is a precedent for all of them.

---

## The three findings that make this non-trivial

**1. Three of the five tabs are not stages.** `Urgent`, `Recent`, `All` are lenses over a feed. A
process ordering has nowhere to put them, so "reorder the strip" silently becomes "delete or demote
three tabs" — including `Recent`, which for some staff is the most-used tab on the surface.

**2. "Arrival" names a station, not a lane.** Pulling it in crosses a station boundary. There is a
precedent for a *read-only upstream lane* (`Inbound` is exactly that), but none for hosting another
station's scan bench.

**3. Ordered as a pipeline, the counts become a funnel — and they will not reconcile.** Operators
will read left-to-right as the same cartons moving. Different grains mean the numbers cannot sum. A
band whose numbers visibly don't add up teaches operators to stop trusting every number on it.

---

## The interview

Ask these **one at a time, in the operator's own terms**. Do not offer a multiple-choice picker —
the first attempt did and it was correctly rejected. The point is to hear how they describe their
own floor, because the vocabulary mismatch IS the finding.

### A · The pipeline itself

1. Walk one carton from "we bought it" to "we're done with it", in your words. Name each place it
   sits and what has to happen for it to leave.
2. In that walk, **what is between Queue and History?** You asked "then what" — what does an operator
   call that moment on the floor?
3. Is that middle thing a place a carton *sits*, or a thing a person *does*? (A place earns a tab; an
   action does not.)

### B · What the strip is for

4. When you open Unbox at the start of a shift, which tab should be showing? Why that one?
5. Are you reading this strip to **navigate** (take me to my work) or to **monitor** (how much is at
   each stage)? If both, which one loses when they conflict?
6. Does anyone but the unboxer read this strip? A supervisor reads a pipeline; an operator reads a
   to-do.

### C · The three non-stages

7. `Recent` is your own recently-opened cartons. In a process-ordered strip, where does "the thing I
   was just working on" live — a tab, a divider'd second group, or gone?
8. Same for `Urgent`. Is urgent a *stage* on your floor, or a flag that can appear at any stage?
9. If `Urgent` and `Recent` moved one click away (into Refine), would you notice? Would anyone else?

### D · Scope and boundaries

10. When you say "arrival", do you mean **going to the Arrival station to work**, or **seeing what's
    at Arrival so you know what's coming**? Those are different features.
11. If Arrival appears in Unbox, should you be able to *act* on it there, or only look?
12. Should Testing appear too? If not — why does the strip stop at your station's edge in one
    direction but not the other?

### E · Counts and honesty

13. When you see a number on a tab, what do you expect it to count?
14. If Inbound says 100 and Queue says 12, is that a problem you'd want explained, or obvious?
15. Would you rather have a number that is slightly wrong, or no number?

### F · Blast radius

16. Should Testing / Pack / Arrival get the same treatment, or is Unbox special?
17. Is anyone's muscle memory going to break? Who, and is that acceptable?

---

## What must come out of this before code

- [ ] The **stage list**, in the operator's own words, with the middle stage named
- [ ] A decision on `Urgent` / `Recent` / `All`: second group · demoted to Refine · deleted
- [ ] **Read-only vs workable** for any upstream lane
- [ ] The new **default tab** (History cannot remain it)
- [ ] The **counts** ruling: keep + state grain · drop on stages · normalise
- [ ] Whether this is a **precedent** for the sibling strips or an Unbox-only exception

## Files this will touch

- `src/utils/unbox-workspace-state.ts` — `UNBOX_WORKSPACE_TABS`, labels, `TAB_TO_PARAM`,
  `PARAM_TO_TAB`, and the docblock stating the ordering rule (**update the rationale, not just the
  array** — a stale docblock is how the next reader gets it wrong)
- `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` — tab build, `dividerBefore`, counts
- `src/lib/receiving/receiving-modes.ts` — descriptors, if a new lane needs a feed
- `src/lib/routing/receiving-routes.ts` — `unboxview` vocabulary
- `docs/todo/…` + `.claude/rules/display/workbench-ops-queue.md` if the band's ordering law changes

## Never

- Reorder the array and leave the docblock claiming the old rationale.
- Put another station's **scan bench** in this strip without an explicit ruling.
- Let a stage tab show a count that invites a funnel reading it cannot satisfy.
- Delete `Recent` without knowing who uses it — check before, not after.
- Ship the reorder and the scope change as one commit; the reorder is reversible, the scope change
  is a boundary decision.
