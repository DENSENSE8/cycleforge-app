# ACTIVE — Step 1: photo capture, standalone prototype

> **⚠ Superseded in part, 2026-08-02 — read
> [`HANDOFF-step1-photo-capture.md`](./HANDOFF-step1-photo-capture.md) first.**
>
> §2's four open questions are all **answered**, and Q4 went the other way: the work was done
> **in place on `/unbox`**, not as a standalone prototype. Bench redirects (dock-only buttons,
> collapsed notes behind an icon, items pin) and the finish pass (pager in Panel, notes toggle)
> are recorded in the HANDOFF. The sketch in §1 and the scroll-snap notes in §3 still apply.

**Status:** exploratory. **This doc changes as fast as the operator wants it to** — it is
not guard-hardened, it is not a lane, and it does not inherit the platform plan's process
(§4's four-part Definition of Done does not apply here yet). The rest of
[`scan-station-procedure/`](./INDEX.md) is paused until this settles.

**Scope, and only this:** the photo-capture portion of Unbox —
`arrival_check` (read the door's evidence) + `shipping_label_photo` + `box_photo` +
`packing_material`, and the items panel that sits above them. Not condition, not serial,
not receive, not any other station, not Studio. See Q1 below for whether `item_photos`
belongs in this slice too.

**Why standalone:** build this as a component that is **not wired into
`LineEditPanel` / `UnboxProcedureDeck` yet.** The shipped deck carries three guards
(`procedure-deck-order`, `procedure-step-dock`,
`unbox-procedure-checklist-coupling`) that assert its current shape as law. Building inside
it means every redirect either breaks a guard or has to update one — friction the operator
explicitly said they don't want yet. Prototype free-standing, get the shape right by
looking at it, *then* it earns those guards when it replaces the real thing.

---

## 1. The target layout, read back from the sketch

```
┌─ Carton Context Header ──────────────────────────────── pinned ─┐
├─ items                                                    ×N ───┤
│  [img]  Title                                                   │
│         Added details from steps                          $     │
│  ...one row per line item...                                    │
├───────────────────────────────────────────────────────────────┤
│                                                                   │
│         (the active step's own captured photos, live)           │
│                                                                   │
├─ previous step ─────────────────────────────── lower opacity ───┤
├─ CURRENT step ────────────────────────────── highest opacity ───┤
├─ < back                                      next step title > ─┤
├─ contextual per-step update, fed by the last scan ───────────────┤
└───────────────────────────────────────────────────────────────┘
```

| Region | Status | Notes |
|---|---|---|
| Carton Context Header | **exists** | `StationContextBar` + `CartonContextCard density="bar"`. Reuse verbatim — this is not part of the redirect |
| **Items panel** | **new** | See Q2 — this is the one region that is a real product decision, not a restyle |
| Photo evidence area | **exists, needs re-homing** | `CartonPhotoStepBody`'s read-only gallery already does exactly this; it just lives in the wrong container today |
| Step stack (prev + current) | **exists, reduced** | The shipped deck shows *every* settled step in flow above the active card, never just one. See Q3 |
| Pager | **exists** | `UnboxProcedurePager` — `< back` / `next step title >`. Reuse verbatim |
| Scan-feedback strip | **new** | Nothing today shows "here's what your last scan just did" as persistent chrome. Closest existing concept is the paused platform plan's Lane C "cue" — worth proving out narrowly here first |

---

## 2. Open questions — answer what you can, I'll build the rest under a stated assumption

**Q1 — which steps.** `arrival_check` + the 3 bench shots, or does `item_photos` belong in
this slice too? Item photos are per-line, per-aspect, and pull in the items panel more
directly (Q2) — if you want it in scope, say so and I'll fold it in rather than bolt it on
after.

**Q2 — what the items panel means.** Reading "Added details from steps" as: the line-item
list stops being a single step you complete once (`contents`, today buried in the deck's
history the moment it's confirmed) and becomes **permanent chrome that accumulates facts
live** — a photo attached, a grade set, a serial captured all show up as a line under that
item's title as they happen. That's not a styling change, it's turning `contents` from a
step into a summary surface. Confirm, or say what you actually meant by the row.

**Q3 — history depth.** The shipped deck's rule is explicit: *"a settled step's timestamp is
evidence… history is full title rows in flow, never a pile."* Your sketch shows exactly one
previous row, not the whole history. Two different builds:

- **(a) hard cap at 2** — older completed steps leave the stack entirely; reachable only via
  `< back` or the right-edge checklist.
- **(b) 2 rows fit on screen, more scrolls into view above** — the full history is still
  there, just not all visible at once (closer to the shipped rule, just windowed).

**Q4 — where this lives while we iterate.** A disposable route/story you can look at without
touching `/unbox` (recommended — zero risk to the shipped bench while it's in flux), or edit
`UnboxProcedureDeck` in place? I'll default to a standalone prototype unless you say
otherwise, since that's what "change direction freely" actually requires.

I'll build against my stated assumption on Q1–Q3 and only truly wait on Q4, since getting
the location wrong is the one thing here that's expensive to undo.

---

## 3. On the scroll-snap approach — what to keep, what to change

The instinct is right: **native CSS scroll-snap, not a JS animation library, for the
scrolling itself.** This repo had already independently reasoned its way to the same
conclusion for this exact surface — the paused platform plan's Lane B was evaluating scroll
behavior with the same reasoning: CSS snap is hardware-accelerated, respects device physics,
and (unlike a scroll-linked JS animation) degrades correctly under reduced motion because
it's just native scrolling.

Three things in the pasted snippet need to change to actually run in this codebase, and two
of them aren't style calls — they're existing enforcement that will fail a real check:

- **The scroll container must be the surface's HOST port, never a new nested
  `overflow-y: scroll` div.** This repo's rule: *"A component mounted into an existing
  scroll host is CONTENT, never a viewport — check who owns the scroll before you write
  `overflow-*`."* A nested port with no resolved height has already silently swallowed
  scroll-snap once, on this exact procedure column — it rendered its height floors as empty
  white voids and the snap never engaged. Whatever hosts this prototype owns the one scroll
  port; the step stack doesn't get its own `.scroll-container`.
- **`import { motion } from 'framer-motion'` won't pass this repo's guard.** Every motion
  import goes through one barrel, `@/design-system/motion` — so the underlying package is a
  one-file dependency decision instead of a 220-file migration — and
  `motion-major.guard.test.ts` fails a direct `framer-motion` import outside that folder.
  Same API, swap the import path: `import { motion } from '@/design-system/motion'`.
- **The staggered spring entrance is fine on first mount, not on every step advance.**
  `initial={{opacity:0,y:50}}` with `delay: index*0.1` replaying each time the stack
  re-renders is the "reflows on its own" pattern this repo bans at scan cadence — a step
  advances 9–24 times per carton, and re-running entrance physics that often reads as lag,
  not delight. For the prev/current swap: crossfade the *contents* on step change (opacity +
  a couple px of `y`, ~120ms, no stagger, no re-entrance). Stagger is fine once, when the
  whole stack first mounts.
- **Hex + inline stylesheet → semantic tokens.** `#f0f8ff` becomes `bg-surface-card` (or
  whatever tone the family resolves to); a hand-written `Stack.css` becomes Tailwind classes
  off the token set. Costs nothing now and saves a dark-mode pass later.

None of that changes the plan you pasted — it's the same architecture, translated through
this app's two doors (one scroll port, one motion barrel) instead of a fresh CSS file and a
direct package import.

---

## 4. Next step

Once Q4 is answered (or you say "just start"), I'll scaffold the standalone prototype:
`StationContextBar` + a new items panel + the existing `CartonPhotoStepBody` gallery,
re-homed + a two-row step stack on CSS scroll-snap, owned by that prototype's own host port
+ the pager, reused as-is. No wiring into `/unbox`, no touching the shipped deck, nothing
that requires a guard yet.
