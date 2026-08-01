'use client';

import { MotionConfig } from 'framer-motion';

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
 * That is the house intent from `.claude/rules/display/motion-crossfade.md`:
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
 */
export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
