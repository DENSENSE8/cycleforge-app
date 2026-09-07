# Cycle Forge brand decision — "Strike the Flow" (Grok-Forge direction)

> **Status:** DECIDED 2026-09-06 by owner interview. Supersedes the bright
> "Hammer & the Light" palette. This doc is the exact implementation spec.

## Interview decisions (source of truth)

| Question | Decision |
|---|---|
| Core feeling | **Grok-brutalist** — near-black, mono voice, hairlines, zero cute |
| Accent | **Forge orange** — the heat of the forge, Replit/xAI lineage |
| Symbol | **Hammer + node hybrid** — hammer strikes a flow node |
| Scope | **Icon/brand only** — app stays light Kinetic Ledger (Linear/GitHub precedent: dark icon, light app) |
| LED | **Green + amber** — pass/working semantics kept |
| Type voice | **Mono-forward** — IBM Plex Mono 600 (already the system's ID font) |

## Exact palette

| Token | Hex | Role |
|---|---|---|
| Ground | `#0A0A0B` | icon tile — near-black neutral (Grok) |
| Forge Orange | `#FF4D00` | the hammer — the one hot thing in the mark |
| Forge Orange Light | `#FF7A33` | hover/secondary brand orange |
| Pass Green | `#22C55E` | LED, done/passed (brightened for dark ground) |
| Work Amber | `#FBBF24` | LED, loading/working |
| Mark White | `#FFFFFF` | flow nodes + edges |

Contrast on ground: orange 6.1:1, green 7.4:1, amber 9.9:1, white 19.9:1 — all AA+.

**In-app tokens do NOT change.** The app keeps `#2563eb` scan blue, slate
ledger, light canvas (scope decision). Brand orange never appears as idle
chrome fill — it is the mark's heat, as scan blue is the product's live ink.

## Symbol anatomy (512 grid)

The hammer strikes a **flow node**; the node's core is the status LED.
Story: *the strike powers the flow — the node lights green when it passes.*

- **Hammer** — 45° mid-strike (clock hand at 1:30), head 200.6×118.6 rx 30,
  handle 57×269 rx 28.5, single-tone Forge Orange (no face band — brutalist
  flat), ground-color keyline 16 for downsampling separation.
  Head center (316.9, 195.1).
- **Node** — donut, center (223, 289) sitting on the strike diagonal with
  ~6px daylight to the hammer face; r 68, stroke 24, Mark White.
  **LED core** r 30 at node center (no bezel — the donut's dark hole is the
  bezel). Green = done (static assets), amber = working (loading assets).
- **Edges** — two flow stubs, stroke 24 Mark White, round caps:
  incoming from the left (60→147, y 289); outgoing down-right diagonal
  (271,337)→(330,396). The flow passes THROUGH the forge.
- **Favicon variant** — same anatomy, no ring, node enlarged (r 76, LED 34)
  so the status light registers at 16px.
- **Full variant** — adds the white cycle ring (r 150, stroke 44) around the
  composition for PWA/desktop badge scale.
- **Tile** — squircle rx 118, Ground. Square full-bleed (art ×0.85) for
  maskable/iOS/electron.

## Type

Wordmark: **"Cycle Forge"** in IBM Plex Mono 600, tight tracking (−0.01em),
sentence case. Eyebrow form: `CYCLE FORGE` uppercase, +0.08em tracked.
In-app typography unchanged (Inter body, Plex Mono IDs — already shipped).

## Motion (loading state)

Hammer is a clock hand pivoted at center: raises at 12, strikes at 3 where
**the node sits with its amber LED**; rebound, settle, lift (existing
`cf-boot-strike` keyframes — 1.5s, transform-only, reduced-motion rests at
45°). On completion the tab favicon shows the same node **green**.

## Do / Don't

- **Do** keep exactly two hues per state: orange + white (+ one LED hue).
- **Do** keep the LED semantic. Green ≠ decoration.
- **Don't** add gradients, glow, or a third shape family. Brutalist = flat.
- **Don't** use brand orange as app chrome fill (app scope is unchanged).
- **Don't** animate the tab favicon by JS frame-swapping.

## Files

Implemented in `public/brand/icon.master.svg` (variant groups) →
`pnpm icon:sync` derives all assets. See `docs/brand/icon.md`.

## Revision 1 — monochrome cutover (2026-09-06, same day)

Owner review: the static favicon's always-green LED violated this spec's own
"green is semantic" rule — a tab has no state, so its color meant nothing.

**Revised palette discipline:**

- Static marks (favicon / PWA / desktop / lockup / mono): **white on
  `#0A0A0B` only.** Solid node disc at favicon size (donut+core and edge
  stubs collapse at 16px — removed from the favicon variant).
- Loading (BootSplash): white hammer; **amber `#FBBF24` node core is the
  only color** — color = state.
- Forge Orange `#FF4D00`: retired from product chrome; marketing hero +
  future dark-chrome accent only.
- Pass Green: brand-free; remains the in-app system success color where
  pass/fail state exists.

Unchanged: symbol anatomy, scope (app stays light), mono type, motion.

## Revision 2 — the material tier, "blueprint → part" (2026-09-06)

Owner direction: industrial / carbon-fiber / aluminum / aerospace — "working
on hard things, getting your hands dirty."

**Two-tier mark, one geometry:**

| Tier | Surfaces | Treatment |
|---|---|---|
| **Schematic** (≤192px) | favicon, PWA, desktop, letterhead | flat white on `#0A0A0B` — the CAD drawing |
| **Part** (≥240px) | `public/brand/hero-carbon.svg`, marketing, app-store hero | carbon-twill tile, machined-aluminum hammer (gradient + specular), brushed-steel ring/node, forge-orange bore glow + specular dot |

The story: the brand IS a manufacturing pipeline — drawn as a schematic,
shipped as a manufactured part. All materials stay achromatic except the
single forge-orange bore (heat = hands dirty). A literal rocket was
considered and rejected: aerospace reads from materials + precision, not
kitsch.

QA 2026-09-06: weave legible at 512, macro-materials hold at 240; below
~200px confirmed mud — the tier boundary IS the physics.

## Revision 3 — "The Iron" (2026-09-06): hammer → soldering iron

Owner critique: a raised hammer reads *break/demolish*; the brand verb is
*fix/restore*. Candidates tested (schematic system, QA'd at 512/32/16):

| Candidate | Semantics | 16px | Verdict |
|---|---|---|---|
| **Soldering iron** | precision repair, electronics, heat | strong once shaft thickened | **WINNER** |
| Wrench | universal fixer | strong | generic/settings-adjacent |
| Anvil + hammer | forge station | strongest masses | archaic for SaaS, two-object |
| Crossed tools | toolkit crest | noise | eliminated at 16px |

**Why the iron:** it is the tenant tech's literal daily tool (board repair,
capacitors, reflow) — maximum user identification; it carries the fixer verb
without any break ambiguity; and it owns the heat story (the tip delivers
the forge; the node bore stays molten). No SaaS competitor owns it.

Geometry (512 grid, all variants) — **heavy industrial proportions** (Rev 3b,
same day: "less pointer, more plant"): back cap 24×26 + fluted barrel 84×128
rx18 (two grip flutes) + hex chuck (108 wide) + shaft 28×56 + broad spade tip
(flaring 42-wide flat face), built vertical, rotated 45° — the spade's flat
face meets the node. Mass at the business end; QA: reads as heavy-duty
industrial iron, not a pen/stylus. Favicon node = solid disc r80 (16px floor);
full = donut r68 + core r30. Loading: clock-hand iron sweeps the solder
pass 12→3, joint heats amber at the 3-o'clock node. Material hero: aluminum
iron on carbon twill, forge-orange bore.
