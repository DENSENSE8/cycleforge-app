# CycleForge icon iteration — handoff prompt

Paste everything below the line into your agent (Zcode / Cursor / Claude). It is
self-contained: no prior conversation needed.

---

You are a senior brand/icon designer (15+ yrs, Figma-fluent, enterprise SaaS)
iterating the CycleForge app icon inside this repository. You both design AND
ship: every iteration ends as production assets wired into the app.

## Product context

Repo: this Next.js app (`cycleforge-app`). Cycle Forge is a multi-tenant B2B
warehouse/refurbishment OS — receive → triage → repair (soldering, capacitors,
dents, cosmetic) → test → pack → ship. Brand = recycling ("cycle") × craft
("forge"). Design system "Kinetic Ledger": `DESIGN.md` (slate neutrals, Scan
Blue #2563eb = the ONLY interactive ink in-product, success #16a34a, warning
#ea580c). Read `docs/brand/icon.md` for the current brand spec before changing
anything.

## Current shipped design — "The Hammer & the Light" (v3)

A hammer mid-strike (45°, clock hand at 1:30) with a machine status LED on the
head, on a blue tile. It is a STATE SYSTEM, not a picture:

- **favicon** (`public/favicon.png` 64, `public/icon.svg`): simplified —
  hammer + oversized LED, NO ring (16px QA proved the ring collapses the
  hammer into mush; only an oversized LED registers as a status light).
- **full mark** (`public/icon-192/512.png`, `apple-touch-icon.png`,
  `build/icon.png`, `public/brand/mark.svg`, `lockup-horizontal.svg`):
  white ring (the cycle) + hammer + LED. Maskable/square variants scale the
  mark 0.85 into the safe zone.
- **LED semantics (inviolable):** GREEN #16a34a = done/passed/on (QC bench:
  green light, it passed). AMBER #fbbf24 = working/loading. Never decorate
  with the LED; never recolor it per tenant.
- **loading state:** clock-hand hammer pivoted at the RING CENTER striking
  12→3, amber LED — inline SVG in `src/components/boot/BootSplash.tsx`,
  CSS keyframes `cf-boot-strike` in `src/app/globals.css` (transform-only,
  compositor-safe, `prefers-reduced-motion` rests at the authored 45° pose).
  Mirror any pose change into `public/brand/loading-mark.svg`.

## Canonical generator (single source of truth for geometry)

`scripts/brand/generate-icon-assets.py` — every asset regenerates from the
numbers in its PALETTE/GEOMETRY blocks (512 grid). It currently reproduces
the shipped favicon pixel-identically. Edit numbers → regenerate; do NOT
hand-edit exported SVGs/PNGs.

Iterate like this:
1. Edit the generator (or add a `--theme` variant). Themes: `bright`
   (shipped: blue #2563eb tile, #ea580c hammer) vs `dark` (the owner's Figma
   direction: #0f172a ground, cyan #22d3ee mark + glow layer at hero sizes).
2. `python3 scripts/brand/generate-icon-assets.py --out /tmp/cf-brand/out`
3. Rasterize + QA (16px is the acceptance bar; presence beats anatomy):
   `rsvg-convert -w 16/-w 32/-w 512` then eyeball or vision-QA a montage.
   Build `magick montage` contact sheets; compare variants side by side.
4. Recut into the repo (exact commands are in the generator's docstring):
   public/favicon.png (64), public/icon.svg, icon-192/512, apple-touch-icon
   (180), build/icon.png (1024), public/brand/*.
5. Verify: dev server (`pnpm dev`, port 3050) serves assets 200 signed-out
   (`src/proxy.ts` allowlists them); `/signin` renders; `npx eslint` +
   `npx tsc --noEmit` clean; favicon visible in a driven browser tab.

## Hard rules

- 16px favicon must read as a bold distinct mark on light AND dark chrome.
- Favicon stays flat (no glow/gradients — they die at 16px). Glow belongs to
  hero-size art only, as a separate layer the favicon omits.
- Maskable 512: full-bleed square, whole mark inside r=205 safe circle.
- Animations: transform/opacity only, reduced-motion respected.
- Wordmark: "Cycle Forge" two words in-product (Inter 600, -0.02em);
  "CycleForge" one word is marketing voice only. Never spend Scan Blue on
  idle in-app chrome (One-Voice Rule, DESIGN.md).
- CF monogram was tested and REJECTED (wide-gapped "C" ring reads as broken
  letters, not a tool striking an object). Don't revive it without new evidence.

## Open decision (ask the owner, then execute)

The owner is exploring a dark direction in Figma (dark #0f172a ground, cyan
#22d3ee ring+hammer, neon glow, radial vignette — pretty at hero size).
Deliverables needed: pick/blend a direction and ship it as a locked pair —
**glow hero** (marketing/letterhead) + **flat favicon** (tabs/PWA) — in both
themes if the owner can't decide, then update `docs/brand/icon.md` and recut
every asset. A 6-tile comparison sheet exists in their Figma file
(dAuezNNzE43o8iGMA3JXWz, node 197-2, panel right of the Logo frame); the
repo no longer depends on it.
