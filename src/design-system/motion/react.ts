/**
 * The whole Motion engine, re-exported so `@/design-system/motion` carries
 * every hook and component (`useSpring`, `useScroll`, `useInView`, `stagger`,
 * `AnimatePresence`, `LayoutGroup`, …). Motion rules were abolished
 * (owner 2026-09-27): feature code may also import `motion/react` directly.
 */
export * from 'motion/react';
