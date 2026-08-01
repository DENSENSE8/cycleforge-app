# EXECUTION PROMPT — Lane G · MotionConfig reduced-motion floor

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-G-motionconfig-PLAN.md`](./unbox-G-motionconfig-PLAN.md) — the plan wins on conflict.
> **Costing:** [`motion-reduce-strategy-COSTING.md`](./motion-reduce-strategy-COSTING.md)
> **Parallel lane:** G. Independent of A/B/C/D/E/F — no shared files.

---

# Cycle Forge — Lane G: one mount replaces twenty migrations

You are Claude Code in the Cycle Forge monorepo. Very small change, **heavy verification**. The verification is the work.

## Mission

Mount `<MotionConfig reducedMotion="user">` so framer-motion honors `prefers-reduced-motion` app-wide, fix a height-discarding bug in the existing bridge, and correct the rules doc that now describes a superseded mechanism.

## Read first

1. `docs/todo/unbox-G-motionconfig-PLAN.md` — SoT for this run.
2. `docs/todo/motion-reduce-strategy-COSTING.md` — why this beats hand-migrating 23 files.
3. `src/design-system/foundations/motion-framer-hooks.ts` (37 lines) — the bridge you are fixing, not deleting.
4. `.claude/rules/display/motion-crossfade.md` — the doc you will correct.

---

## STEP 1 — prove the mechanism. Do this before writing the mount.

The entire plan rests on framer's documented behavior. Verify it empirically:

1. Mount `MotionConfig` (Step 2), then set `prefers-reduced-motion: reduce` in the browser.
2. Open **`CommandBar`** — a known-unbridged consumer that spreads presets raw.
3. Confirm it **stops translating and only fades**.

**If it does not behave as documented, STOP and report.** The costing collapses and hand migration (Lane F) becomes the answer again. Do not proceed to Steps 3–4 on an unverified assumption.

## STEP 2 — the mount

Mount inside **`src/components/Providers.tsx`** — it is already `'use client'` (`:1`). Wrap its children.

**Do NOT mount in `src/app/layout.tsx`.** It is a server component and framer-motion's ESM entry (`dist/es/index.mjs`) carries **no `"use client"` directive**.

```tsx
import { MotionConfig } from 'framer-motion';
// …
<MotionConfig reducedMotion="user">
  {/* existing provider children */}
</MotionConfig>
```

**Known and accepted:** `<OfflineBanner />` renders at `layout.tsx:100`, outside `<Providers>`, so it is outside this tree. It is already bridged and pinned at `station-motion-bridge.guard.test.ts:22`. **Note it; do not restructure the layout to chase it.**

## STEP 3 — fix the bridge's height bug

`useMotionPresence` (`motion-framer-hooks.ts:28-36`) returns a flat opacity-only shape, **discarding `height`**. Applied to `framerPresence.collapseHeight` or `sidebarSection` (both `{height:0} → {height:'auto'}`), the element fades while holding full height instead of collapsing.

`collapseHeight` is the **one sanctioned height animation** in the house rules. Fix the hook to **preserve `height` keys when present** and collapse only transforms (`x` / `y` / `scale` / `rotate`).

The bridge survives as an escape hatch — do not delete it.

## STEP 4 — correct the rules, in its own commit

In `.claude/rules/display/motion-crossfade.md`, two things are now wrong:

- the **"GAP — residual raw reduced-motion consumers"** section, and
- *"new animated code must call the hook bridge — never consume `framerPresence.*` / `framerTransition.*` raw on a user-facing surface."*

Replace with: **MotionConfig is the floor**; the bridge is for surfaces needing *stronger-than-default* reduction (suppressing an animation entirely rather than crossfading it).

A rule describing a superseded mechanism sends the next agent to redo finished work. **Separate commit, with rationale.**

---

## Do NOT

- **Sweep the 289 Tailwind `animate-*` files.** CSS animations, untouched by MotionConfig, mostly loaders where a spinner is a status indicator, not vestibular motion.
- Gate GSAP (`card-fan-carousel.tsx:4`) — separate, small, not this lane.
- Touch `AnimatedStat` — already compliant (`:51`, `:57-68`).
- Delete `useMotionPresence` / `useMotionTransition` or `station-motion-bridge.guard.test.ts`. Both survive with a narrower job.
- Change any duration or easing. **This lane re-times nothing.**
- Raise any ratchet baseline.
- Start, restart, or kill the dev server. It runs on **`:3050`** — attach.

## Verification — both states, real browser, `:3050`

| Case | Reduced ON | Reduced OFF |
|---|---|---|
| `CommandBar` (unbridged) | opacity only, no translate | unchanged |
| `CardShell` / `StationPacking` (bridged) | still reduced — **expect a crossfade now, not an instant cut**; that is the more correct behavior, but confirm it looks right | unchanged |
| A `collapseHeight` consumer | height still collapses, no slide | unchanged |
| Sidebar nav column push toggle | width animation disabled — **confirm intended** | unchanged |
| `MobileFeed` push-up | consistent (`layout` already `false` under reduce) | unchanged |

Plus `npm run verify` green, no baseline raised, and **no hydration warning** in the console.

## Report back

1. **Step 1 result — did `CommandBar` stop translating?** If not, stop and say so; everything else is moot.
2. Any surface where the new crossfade-instead-of-instant-cut looks wrong.
3. Whether disabling the sidebar push toggle under reduced motion is intended.
4. What you changed in `motion-crossfade.md`.
5. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed — other sessions share this tree.
