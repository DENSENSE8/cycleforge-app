'use client';

import { MotionConfig } from '@/design-system/motion';

/**
 * App-wide `prefers-reduced-motion` floor for every framer `motion.*` component.
 *
 * `reducedMotion="user"` makes framer itself honor the OS setting, so reduction
 * is the DEFAULT for present and future components instead of something each
 * call site has to remember to opt into via the hook bridge.
 *
 * What framer actually does when the preference is on (verified against
 * framer-motion 12.42.2 `dist/framer-motion.dev.js`, not the docs):
 *
 *   - Any animating key in `positionalKeys` — `width`, `height`, `top`, `left`,
 *     `right`, `bottom`, and every transform prop (`x`/`y`/`scale`/`rotate`/…) —
 *     is given `{ type: false }`, so it SNAPS to its target instead of tweening.
 *   - Layout animations (`layout` / `layoutId`) likewise get `type: false`.
 *   - Everything else — critically `opacity` — animates at its normal duration.
 *
 * That is the house intent from:
 * reduced motion means "replace slides with crossfades", not "no motion". The
 * slide is removed; the crossfade survives.
 *
 * NOTE the snap semantics: a height collapse (`framerPresence.collapseHeight`)
 * still collapses, it just does so instantly — `height` is a positional key.
 * Framer does not tween it under reduce, and no config makes it.
 *
 * `useMotionPresence` / `useMotionTransition` remain available for surfaces that
 * need STRONGER-than-default reduction (suppressing an animation outright rather
 * than crossfading it) — they are no longer the compliance mechanism.
 *
 * ── What each motion ROLE reduces to (`@/design-system/motion` → `motionRole`)
 *
 *   swap.scan      → crossfade; the zero-duration EXIT survives, so a carton
 *                    still swaps with no empty-canvas gap at scan cadence.
 *   swap.focus     → crossfade; the y translate snaps to 0.
 *   push.rail      → crossfade; the column's `width` is a positional key, so the
 *                    push lands instantly instead of tweening. The panel still
 *                    makes room — it just stops travelling.
 *   gesture.press  → SUPPRESSED, not reduced. `useMotionPressRole` returns
 *                    `undefined`: a `scale: 0.9` that snaps (transforms get
 *                    `{ type: false }`) reads as a glitch, not as feedback.
 *   feedback.pulse → unchanged. An opacity flash IS the reduced form; there is
 *                    no vestibular component to remove.
 *
 * These are DESCRIPTIONS of what the floor already produces, not a second
 * reduction path. `MotionConfig` takes no role map, and installing a parallel
 * per-role reducer beside it would be two mechanisms for one job — the exact
 * fork `.claude/rules/pattern-evolution.md` bans. The forms above are pinned by
 * `src/design-system/motion/roles.test.ts`, so this comment cannot quietly drift
 * from the shipped behaviour.
 */
export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
