# Cycle Forge brand icon — "Strike the Flow"

> **Status:** v4 "Strike the Flow" (Grok-Forge direction), 2026-09-06.
> Exact spec: `docs/brand/decision-strike-the-flow.md` (owner interview decisions). Implements Phase 7 of
> `docs/cycle-forge-branding-spec.md`. Supersedes v1 "The Forged Cycle"
> (anvil-in-loop) and v2 "The Strike" (spark) after small-size QA.

## Concept

The mark is a **soldering iron kissing a flow node** ("The Iron", Rev 3) — Grok-brutalist
engineering: near-black ground, one forge-orange element, white flow graph,
and the status LED as the node's core. Story: *the strike powers the flow —
the node lights green when it passes.*

- **The iron** — 45° diagonal, tip meeting the node: precision repair, the fixer's tool (never a break).
- **The node** — white donut on the strike diagonal; its core is the LED.
- **The ring** (full mark only) — the cycle around the strike.
- **Edges** — two white flow stubs on the favicon/loading variants only;
  ring variants omit them (they collide with the ring at small sizes).

### States

| State | Light | Where |
|---|---|---|
| Done / on / passed | Green | tab favicon, PWA, desktop, lockup |
| Working / loading | Amber + hammer striking 12→3 | BootSplash, spinners |

The favicon and the loading animation are **one system**: load pages show
the amber swinging hammer; the settled tab shows the same hammer, light green.

## Geometry (512 grid)

- Ring: r 150, stroke 44, white. (Full mark only — dropped at favicon size
  because 16px QA showed it collapses the hammer into mush.)
- Hammer (favicon/full): head 200×118 rx 30, handle 57×269, rotated 45°
  about center; head lands at 1:30. Blue keyline (16px) separates hammer
  from ring. Face band `#f97316` on `#ea580c` head.
- LED: white bezel circle + color core; r 34 core on the favicon (oversized
  deliberately — the only state that registers at 16px), r 28 on the full mark.
- Loading pose: the hammer is a **clock hand pivoted at the ring center** —
  head sweeps 12→3 and strikes the ring itself; short handle, head radial.
  CSS `cf-boot-strike` keyframes (globals.css): raise-hold, accelerate in,
  impact rebound, settle, lift. transform-only, compositor-safe,
  reduced-motion rests at the authored 45° mid-strike.

## Palette

| Token | Hex | Use |
|---|---|---|
| Ground | `#0A0A0B` | tile — near-black neutral (Grok) |
| Mark White | `#ffffff` | hammer, ring, node, edges — the ONLY static brand hue |
| Work Amber | `#FBBF24` | loading node core — the one color, only while working |
| Forge Orange | `#FF4D00` | RETIRED from chrome — marketing hero / future dark accents |
| Pass Green | `#22C55E` | RETIRED from brand — lives in-app as system success |

**Monochrome rule (2026-09-06 revision):** static marks are white on
`#0A0A0B`, zero color. Color appears exactly once per surface and only when
it means something: the loading splash carries one amber dot (working);
green lives where pass/fail state exists (in-app chips/toasts, QC screens).
A tab favicon has no state — so it has no color.

Flat fills, no gradients, no glow. In-app tokens unchanged (app stays light Kinetic Ledger).

## Files

| File | Size | Purpose |
|---|---|---|
| `public/brand/icon.master.svg` | vector | **single source of truth** — variant groups `#cf-favicon / #cf-full / #cf-full-square / #cf-loading / #cf-mono` |
| `public/favicon.png` | 64 | tab favicon — simplified: hammer + big green LED, **no ring** |
| `public/icon.svg` | vector | SVG favicon, same simplified mark |
| `public/icon-192.png` / `icon-512.png` | 192/512 | PWA any/maskable — full mark with ring |
| `public/apple-touch-icon.png` | 180 | iOS (square full-bleed) |
| `build/icon.png` | 1024 | electron-builder buildResources |
| `public/brand/mark.svg` | vector | single-ink (navy) letterhead mark, white knockout |
| `public/brand/mark-dark.svg` | vector | dark-theme full mark (cyan on `#0f172a`) |
| `public/brand/icon-dark-square.svg` | vector | dark-theme square/maskable master |
| `public/brand/hero-bright.svg` | vector | hero, bright — mark + glow + vignette (marketing only) |
| `public/brand/hero-dark.svg` | vector | hero, dark — neon glow + vignette (marketing only) |
| `public/brand/hero-carbon.svg` | vector | **material hero** — carbon twill + aluminum + steel + forge-orange bore (`#cf-material`; marketing/app-store, ≥240px) |
| `public/brand/lockup-horizontal.svg` | vector | mark + "Cycle Forge" (Inter 600) |
| `public/brand/loading-mark.svg` | vector | loading pose source (mirrored inline in `BootSplash.tsx`) |

## Rules

- **Do** keep the favicon simplified (no ring) — it lives at 16–32px.
- **Do** keep the favicon/PWA exports flat — glow and vignette live only in
  `hero-*.svg` at hero sizes, as a layer the small exports omit.
- **Do** keep green exclusively semantic: light = green means done/passed/on.
  Never decorate with the green LED.
- **Don't** animate the tab favicon via JS frame-swapping without a
  reduced-motion guard; in-app loading uses the CSS strike loop only.
- **Don't** recolor the LED per tenant — the light is platform voice, like
  the favicon (branding spec decision log).
- Wordmark: "Cycle Forge" two words in-product (Inter 600, −0.02em);
  one-word "CycleForge" is marketing-voice only.
