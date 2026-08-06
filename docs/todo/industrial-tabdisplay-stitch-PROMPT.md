# Google Stitch — Industrial TabDisplay / Cycle Forge DS brief

**Date:** 2026-08-05  
**Use:** Paste the block below into Google Stitch. Attach the soft-pill Browse/Move/Send and Chat/Claim screenshots as **anti-references**.  
**Code companion:** Displays nested verb switchers ship on `TabDisplay` (`src/design-system/components/TabDisplay.tsx`); soft `TabSwitch` `solid` remains legacy for workbench bands until Stitch returns.

---

## Paste into Stitch

```text
PROJECT: Cycle Forge Design System — Industrial Ops UI (2026)
ROLE: You are designing a B2B warehouse / fulfillment operations SaaS design system.
PRODUCT: Cycle Forge — multi-tenant reseller-ops software used on large desktop monitors
         and scan stations. NOT a consumer mobile app. NOT a marketing site.

NORTH STAR AESTHETIC
- Think SpaceX mission control + xAI / Grok UI: closed, precise, engineer-industrial.
- ZERO corner radius everywhere (sharp 90° corners). No pills, no capsules, no soft blobs.
- Edge-to-edge / full-bleed: controls and panels meet container edges; no floating
  island cards with generous outer margins; depth = surface steps + hairlines, not
  drop shadows and gutters.
- High-contrast, utilitarian, dense but legible. Title-case labels (not shouty ALL CAPS
  tracking). Monospace only for IDs / serials / counts — not body UI.
- Color: cool neutrals (near-black ink on light gray canvas OR dark graphite on near-black).
  One restrained accent (electric blue or signal amber) for ACTIVE state only.
  Forbidden: purple gradients, cream+terracotta, soft glassmorphism, neon glow, emoji.

ANTI-REFERENCE (DO NOT DESIGN THIS)
- Soft white capsule rails with fully rounded ends.
- Dark navy sliding pill nested inside a light pill track.
- Floating shadowed chip switchers with generous padding.
- Vertical or horizontal "sausage" mode switchers.
  (These are the CURRENT tabs — they must be replaced.)

COMPONENT 1 — TabDisplay (PRIMARY DELIVERABLE)
Job: single Source-of-Truth tab / mode switcher for ops UI.
Must cover these jobs with ONE visual language (variants, not forks):

A) Nested verb switcher (2–4 tabs) inside a right push column ~360px
   Example labels: Browse | Move | Send    and    Chat | Claim
   Optional leading 14–16px icons.

B) Lifecycle / workbench band (flush full-width strip, ~40px tall)
   Example: Queue | History | Packed — equal or content-weighted segments.

C) Quiet icon strip (Displays topic picker)
   Idle = icon only; active = icon + label; no pill rail box.

VISUAL RULES FOR TabDisplay
- Container: rectangular track, border 1px hairline, radius 0, flush to parent width
  OR content-hug for nested verbs — never a floating capsule.
- Active state: rectangular fill (inverse ink OR accent) with sharp corners;
  OR an underline / end-cap bar (2px) flush to the segment — pick ONE system and
  apply consistently. Prefer filled rectangular segment for high-contrast ops.
- Inactive: muted ink on transparent / sunken track; hover = subtle surface step.
- Selection indicator may slide, but the SHAPE must stay rectangular (no rounded pill).
- No drop shadow under the rail. No inset soft glow.
- Height: sm ≈ 32–36px nested; band ≈ 40px flush.
- Typography: 12–13px semibold title-case; counts as plain tabular numerals (no bubble badges).
- Keyboard: visible rectangular focus ring (2px), not rounded halo.

COMPONENT 2 — Supporting industrial primitives (same sheet)
Show the TabDisplay living inside a closed right-edge "Displays" column:
- Column: full-height, flush to screen edge, square corners, hairline left border.
- Header row: icon strip (quiet) + optional actions, square.
- Body: edge-to-edge content; when a mode has a footer CTA, pin it flush to column bottom.
- Surface ladder only: canvas → sunken → card (flat fills + hairlines). No rounded cards.

DELIVERABLES (Stitch frames)
1. TabDisplay — nested verbs: Browse / Move / Send (Send active)
2. TabDisplay — nested verbs: Chat / Claim (Claim active)
3. TabDisplay — workbench band: Queue / History / Packed (Queue active), full width
4. TabDisplay — quiet icon strip: 5 topics, Photos active (icon+label)
5. One full Displays column mock composing (4) + (1) + sample body
6. Dark theme twin of frame 5
7. Spec callouts: px heights, hairline weights, ink/accent tokens, radius=0 callout

CONSTRAINTS
- Desktop-first (1440×900 and 1920×1080 artboards).
- Do not invent a second tab component. One TabDisplay, three densities/variants.
- Do not use rounded-full, pill, capsule, chip-cloud, or floating soft shadow language.
- Export clean rectangles suitable for engineering handoff into React + Tailwind tokens.
```
