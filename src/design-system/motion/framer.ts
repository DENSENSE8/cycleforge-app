/**
 * THE motion engine import site. This file is the only place in `src/` that
 * names a motion package — everything else imports `@/design-system/motion`.
 *
 * Package: `motion/react` (v12). `framer-motion` is the legacy alias for the
 * same engine, not a second library; the lockfile carries one major and the
 * guard keeps it that way. Naming the package here rather than at ~220 call
 * sites is the entire point of the boundary: swapping it later is a dependency
 * decision, not a repo-wide migration.
 *
 * Re-exports are EXPLICIT, not `export *`. A star re-export would put every
 * symbol the engine ships into the barrel's surface, which (a) hides what the
 * app actually depends on and (b) is the bundle-altitude trap
 * `.claude/rules/build-gotchas.md` catalogues. Adding a symbol here is a
 * deliberate one-line decision — that friction is the boundary working.
 *
 * NOTE — no `'use client'` here on purpose. The directive belongs on the
 * component that renders motion; putting it on a re-export module would drag
 * every consumer into the client graph even when it only wants a type.
 *
 * `AnimateNumber` is deliberately NOT here — it lives in `./plus`, off the main
 * barrel, so `motion-plus` stays out of every barrel consumer's module graph.
 *
 * Law: The import boundary.
 * Guard: `../foundations/motion-major.guard.test.ts`.
 */

export {
  motion,
  animate,
  AnimatePresence,
  MotionConfig,
  LayoutGroup,
  Reorder,
  useReducedMotion,
  useAnimationControls,
  useAnimationFrame,
  useMotionValue,
  useTransform,
  useDragControls,
} from 'motion/react';

export type {
  Transition,
  Variants,
  PanInfo,
  HTMLMotionProps,
  DragControls,
} from 'motion/react';
