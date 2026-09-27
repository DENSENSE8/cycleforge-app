/**
 * Sole Motion+ import site for the design system.
 * Feature code must use `AnimatedStat` (or other wrappers) — never import
 * `motion-plus` / `@motionplus/*` directly.
 *
 * This module stays OFF the main `@/design-system/motion` barrel on purpose
 * (see `react.ts`): importing it pulls `motion-plus` into the consumer's
 * module graph, and only the surfaces that actually render a Plus component
 * should pay for it.
 *
 * The AI-surface additions (2026-09-06) and what they are for — the AI design
 * system (`@/design-system/ai`) owns their timings:
 * - `AnimateText` — split-by-word/char spans carrying variants.
 * - `Typewriter` — natural-variance typing with `replace="type"` morphing;
 *   the Motion Lab's replayable prose demo.
 * - `ScrambleText` — character settle between phrase swaps; the AI phase
 *   line morphing from one tool phrase to the next.
 */
export { AnimateNumber } from 'motion-plus/react';
export { AnimateText, ScrambleText, Typewriter } from 'motion-plus/react';
export type {
  AnimateTextProps,
  ScrambleTextProps,
  TypewriterProps,
  TypingSpeed,
} from 'motion-plus/react';
