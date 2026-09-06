# Cycle Forge brand icon — "The Hammer & the Light"

> **Status:** v3, 2026-09-06. Implements Phase 7 of
> `docs/cycle-forge-branding-spec.md`. Supersedes v1 "The Forged Cycle"
> (anvil-in-loop) and v2 "The Strike" (spark) after small-size QA.

## Concept

The mark is a **hammer mid-strike with a machine status light** — the bench
tool plus the QC indicator in one glyph:

- **The hammer** — tilted 45° like a clock hand at 1:30: actively working,
  forging renewed product (dents, solder, capacitors, cosmetic rework).
- **The light** — a panel LED centered on the hammer head, like a test bench
  power/PASS lamp. **Green = on / passed / fully loaded** (the system's
  success token `#16a34a` — the QC bench meaning: green light, it passed).
  **Amber = working** (`#fbbf24`), shown only in loading states.
- **The ring** (full mark only) — the renewal cycle the strike forges.

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
| Forge Blue | `#2563eb` | tile + hammer keyline (the product's scan blue, spent here as brand) |
| Head Orange | `#ea580c` / `#f97316` | hammer head + striking face |
| Pass Green | `#16a34a` | status light, done state (system success token) |
| Work Amber | `#fbbf24` | status light, loading state |
| Mark White | `#ffffff` | ring, LED bezel |

Flat fills, no gradients. Blue/orange is a complementary (colorblind-safe)
pair; the LED is the single semantic accent.

## Themes — the locked pair

Two themes ship side by side, each as a **glow hero + flat favicon pair**:

| Theme | Tile | Mark | Role |
|---|---|---|---|
| **Bright** (default) | `#2563eb` | orange hammer, white ring | tabs / PWA / in-product — the product's scan blue spent as brand |
| **Dark** (Figma direction) | `#0f172a` | cyan `#22d3ee` hammer + ring | marketing / letterhead alternates |

- **`public/brand/hero-bright.svg` / `hero-dark.svg`** — hero (marketing,
  letterhead, large-format only): the full mark plus a soft glow (blurred
  duplicate, `feGaussianBlur` 18, opacity 0.55) and a subtle radial vignette.
- **The glow layer never ships in the favicon/PWA exports.** They stay flat
  fills — gradients and glow die at 16px. The hero is a separate file the
  small sizes simply omit.
- 16px QA (2026-09-06): both themes hold a bold hammer silhouette; dark
  (cyan on near-black) actually reads slightly stronger at 16px than bright.
  Bright stays the live app default because it is the product voice (scan
  blue) and has months of shipped provenance; dark is one generator flag
  away (`--theme dark`) if the owner flips.
- Generate any theme: `python3 scripts/brand/generate-icon-assets.py
  --theme bright|dark --out <dir>` — recut commands in the docstring.

## Files

| File | Size | Purpose |
|---|---|---|
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
