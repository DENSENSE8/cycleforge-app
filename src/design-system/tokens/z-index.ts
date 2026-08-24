/**
 * Centralized z-index scale — the single source of truth for stacking order.
 *
 * Values live in `z-index.mjs` (Node-native ESM for tailwind.config). This
 * module re-exports them with TypeScript types for app code.
 *
 * Numbers preserve the bands the codebase already converged on (panel=100,
 * modal=200, command=1000, splash=2000, tooltip=max) so a component can be
 * migrated onto a name at any time WITHOUT inverting an existing layer.
 *
 * Usage:
 *   - Tailwind:  className="z-panel"  (semantic classes are wired in
 *                tailwind.config.mjs from z-index.mjs)
 *   - Inline:    style={{ zIndex: zIndex.modal }}
 *   - CSS var:   var(--ds-zIndex-modal)  (emitted by css-variables.ts)
 *
 * Rule of thumb: never hardcode a raw z-[NNN]. Pick the closest name below.
 * If two things need to stack within one band, use `+ N` off the band token
 * (e.g. zIndex.modal + 1) rather than inventing a new magic number.
 */
export { zIndex } from './z-index.mjs';

export type ZIndex = typeof import('./z-index.mjs').zIndex;
export type ZIndexToken = keyof ZIndex;
