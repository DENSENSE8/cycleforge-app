# Handoff: Unbox UNBOXED siderail — flush-right regression + stagger not firing

## Context

Continuing the "Improve UI — Unbox UNBOXED siderail" task in `cycleforge-app`
(dogfood tenant USAV). The rail is `ReceivingFeedRail feed="unboxRecent"` →
`RecentActivityRailBase` → `SidebarRecentRailBase` →
[`SidebarRailShell`](../../src/components/sidebar/SidebarRailShell.tsx) →
[`RailRow`](../../src/components/sidebar/rail-shell/RailRow.tsx). It sits under a
full-bleed scan band inside the 360px master sidebar. Do NOT fork the shell;
compose / grow the SoT. `npm run verify` must stay green before done.

## What was already changed (landed, verify green)

1. Added `SIDEBAR_RAIL_INSET_X = 'pl-1.5 pr-0'` in
   [`header-shell.ts`](../../src/components/layout/header-shell.ts) and a
   `railInset?: 'scanDock' | 'gutter'` prop on `SidebarRailShellProps`
   ([`sidebar-rail-shared.ts`](../../src/components/sidebar/rail-shell/sidebar-rail-shared.ts)).
2. [`SidebarRailShell`](../../src/components/sidebar/SidebarRailShell.tsx) uses
   `insetX` (line ~91) on eyebrow / `ul` / skeleton / empty.
   `SidebarRecentRailBase` defaults `railInset="scanDock"`.
3. [`RailRow`](../../src/components/sidebar/rail-shell/RailRow.tsx) line ~127: row
   button is now `pl-2 pr-0` (grouped `pl-3 pr-0`); `PkgGroupHeader` likewise `pr-0`.
4. Tuned `staggerRevealSidebarSlideItem` in
   [`StaggerReveal.tsx`](../../src/design-system/primitives/StaggerReveal.tsx) →
   `hidden: { opacity: 0.4, x: -12 }`, spring `damping 24 / stiffness 140`.
5. Pruned dead `unboxView` from `ReceivingRailBody` + `ReceivingSidebarPanel`;
   `UnboxView` type made module-private in `useReceivingMode.ts`. Removed orphaned
   FBA scan-theme dead exports (deleted `src/components/fba/fba-scan-theme.ts`).

## Problem 1 — flush-right went too far (visual regression)

The **selected-row blue ring** (`rounded-md ring-1 ring-inset ring-blue-400`,
RailRow ~line 131) and the **"41h" age text** now jam against the sidebar's right
edge, which tucks *under* the work-canvas rounded cutout (`appContentShellClass`
= `rounded-tl-2xl` in `header-shell.ts`). The rounded corner visually clips the
ring's right side and the ages have no breathing room.

Root cause: `pr-0` was correct for flat **band chrome** (eyebrow pencil / MRU
cells are `w-8` flush), but the row's **rounded interactive affordance**
(selection ring + hover fill + age) needs a small right inset so it doesn't slide
under the curved canvas edge.

Suggested fix direction (pick one, keep it in the SoT, don't page-local patch):

- Keep the list host flush (`pl-1.5 pr-0`) but give the **row button** a small
  right pad again (e.g. `pl-2 pr-1.5` / grouped `pl-3 pr-1.5`) so the ring + age
  clear the rounded edge, while the eyebrow / MRU stay flush. This is likely the
  intended "flush band, inset affordance" split.
- Verify against the `rounded-tl-2xl` overlap: the age column should end ~6px
  before the sidebar edge.

## Problem 2 — first-load stagger still not visible

`unboxRecent` sets `staggerRevealMotion: 'slide'`; `SidebarRecentRailBase`
defaults `staggerReveal={true}`. Wiring in
[`SidebarRailShell`](../../src/components/sidebar/SidebarRailShell.tsx) lines
64–90: `staggerActive = staggerReveal && staggerEligibleRef.current &&
rows.length > 0 && !showSkeleton`, one-shot via rAF flipping `staggerEligibleRef`
false.

Hypotheses to investigate (in order):

1. **Snapshot warm-paint skips the cascade.** `unboxRecent` passes
   `loadSnapshot` / `persistSnapshot` (rail-snapshot cache) and
   `contentPaintSurface='unbox:sidebar-rail'`. In `useSidebarRail.ts`,
   `showSkeleton` is forced false whenever `loadSnapshot` is set (line ~437
   `!loadSnapshot`), and snapshot rows seed synchronously — so on the very first
   commit `rows.length > 0` AND the rAF one-shot may flip
   `staggerEligibleRef=false` before Framer paints the `hidden→show` transition.
   Check whether `staggerActive` is ever true for a full frame. Consider gating
   the one-shot on "cascade actually started" rather than a bare rAF.
2. **Component stays mounted across navigation** (`key="rail-unbox-recent"`), so
   the one-shot already fired earlier and won't replay when returning to Unbox.
   Confirm mount / unmount behavior when switching modes.
3. **`prefers-reduced-motion`** — if on, `staggerItemVariants` collapses to
   opacity 0.001s (line 82–83) and container step to 0. Rule this out first (OS
   setting / `useReducedMotion`).
4. **Variant propagation**: `motion.ul` has `initial="hidden" animate="show"
   variants={container}` only when `staggerActive`; each `motion.li` passes only
   `{ variants }` during cascade (RailRow ~84). Confirm `AnimatePresence
   initial={staggerActive}` (SidebarRailShell ~142) isn't suppressing the initial
   mount animation.

Add a temporary devtools log of `staggerActive`, `staggerEligibleRef.current`,
`rows.length`, `showSkeleton`, `reduceMotion` on the unbox rail to see which guard
is false at first paint.

## Constraints / done criteria

- Compose + grow SoT; no forked rail primitive; no second motion system
  (steady-state CRUD stays `framerPresence.sidebarRailRow`).
- Keep it opacity / x within the sidebar-safe family (no `staggerRevealItem`
  x:-20 — clips dots in `overflow-x-clip`).
- `npm run verify` green (lint, typecheck, unit + DS guards, knip, route-auth,
  schema). Watch the knip gate — don't leave newly-orphaned exports.
- Visual check on the Unbox sidebar at 360px: selection ring + ages clear the
  rounded canvas edge; hard-refresh shows a visible one-time cascade; scan-in
  still left-slides; refetch does not restagger.

## Key files

- [`src/components/sidebar/SidebarRailShell.tsx`](../../src/components/sidebar/SidebarRailShell.tsx) (stagger arming + insetX)
- [`src/components/sidebar/rail-shell/RailRow.tsx`](../../src/components/sidebar/rail-shell/RailRow.tsx) (row padding + selection ring)
- [`src/components/sidebar/rail-shell/useSidebarRail.ts`](../../src/components/sidebar/rail-shell/useSidebarRail.ts) (`showSkeleton`, snapshot seed)
- [`src/design-system/primitives/StaggerReveal.tsx`](../../src/design-system/primitives/StaggerReveal.tsx) (`staggerRevealSidebarSlideItem`)
- [`src/components/layout/header-shell.ts`](../../src/components/layout/header-shell.ts) (`SIDEBAR_RAIL_INSET_X`, `appContentShellClass` rounded cutout)
- [`src/lib/receiving/rail/feeds.ts`](../../src/lib/receiving/rail/feeds.ts) (`unboxRecent` feed config)
