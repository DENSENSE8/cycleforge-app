# HANDOFF — pick screens edge-to-edge (industrial notepad)

Owner, 2026-09-26, looking at `/m/pick` and `/m/pick/unassigned`:

> "the industrial notepad needs to be improved for the design system as well. For example,
> the no bin button and the photo button and the location button text should be notepadding
> edge to edge, fully as much information as you can show possible. And same thing for the
> take and pass to picker, you can't even see the pass to picker. it's displaying off the
> screen because it's not edge to edge."

Law it breaks — BRIEF §4 industrial: **page padding 0, edge-to-edge; rows separated by 1 px
rules; radius 0; photo fills its square; hit 48 (touch).**

## Measured on :3050 (before), buttons' x-range in CSS px, zoom 1

| Width | Board `Take` | Board `Pass to…` | Directed `Pair bin` | Directed `Skip` / `Pass to…` | Directed photo |
|---|---|---|---|---|---|
| 320 | 96→196 | 204→304 | 215→304 | 33→156 / 164→287 | 20→303 |
| 360 | 96→216 | 224→344 | 255→344 | 33→176 / 184→327 | 20→343 |
| 390 | 96→231 | 239→374 | 285→374 | 33→191 / 199→357 | 20→373 |

Nothing overflows at zoom 1; the fixed insets (96 px left of Take, 33 px in the order card,
20 px round the photo) are what push `Pass to…` off-screen once the per-staff app zoom
(BRIEF §4 "app zoom per staff") scales the page. Remove the insets, not the zoom.

## Where it comes from

- `src/components/mobile/picker/PickBoardScreen.tsx` — the Take / Pass buttons sit INSIDE the
  text column (right of the 64 px thumb, inside `px-mode-page`), `grid-cols-2 gap-2`, bordered.
- `src/components/mobile/picker/directed/DirectedPickScreen.tsx` — the whole scroll body is
  `px-mode-page`; location row = big text + a small bordered `Pair bin`; the product is a
  bordered, inset card (`border … h-56` thumb).
- `src/components/mobile/picker/directed/DirectedPickOrderCard.tsx` — inset bordered card,
  a padded 2×2 grid of bordered buttons (Documents · Listing · Skip · Pass to…).

## Proposed build (one face per step)

1. **Primitive** — give `src/design-system/components/DetailDock.tsx` an `inline` placement:
   same flush cells, 1 px rules, radius 0, double-tap lock and haptic, but rendered in-flow
   (not sticky, no safe-area pad) and allowing 4 verbs as a flush 2×2. One face for every
   touch verb band — no second convention. Labels never truncate (full text, wrap if needed).
2. **Board row** — content (thumb + facts) keeps its band padding; Take / `Pass to picker`
   become an inline dock spanning the full row width under it (`border-t`), rush spine kept.
3. **Directed location band** — full width: location face big, plus barcode and room on
   one line (show every fact we have); `Pair bin` a flush full-height cell on the right with
   a 1 px rule. `No bin` reads in the same band.
4. **Directed photo** — full-bleed, no border/inset; rush = the left spine, not a border box.
5. **Order card** — no outer border/inset; facts padded 8; the four verbs one inline dock 2×2.

Verify each step at 320 / 360 / 390 px on `:3050` (Playwright, iPhone UA, throwaway cookie
session — `/m/pick` claims the next pick on load; release anything you open), plus once at the
owner's app zoom. Every verb's right edge ≤ viewport, label `scrollWidth ≤ clientWidth`.

## Paste-ready prompt

```text
CycleForge prod lane, dogfood speed mode. Read AGENTS.md, docs/design-system/BRIEF.md (§4
industrial dials, §12 owner law) and docs/design-system/HANDOFF-pick-edge-to-edge.md.

Face: the phone pick screens (/m/pick, /m/pick/unassigned) edge-to-edge per the owner's
words in that handoff. Build steps 1→5 in order, one face per commit: DetailDock `inline`
placement first (lowest layer), then board row, location band, photo, order card.
Measure before/after at 320/360/390 px on :3050 and at the owner's app zoom; screenshot;
commit your own files by name; push (--no-verify fine; say what is red). Do not touch the
pick API (src/app/api/v1/picking, src/lib/picking/picking-v1-contract.ts) — another
session owns it.
```
