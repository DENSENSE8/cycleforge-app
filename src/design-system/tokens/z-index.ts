/** Centralized z-index scale — the single source of truth for stacking order. */
export { zIndex } from './z-index.mjs';

export type ZIndex = typeof import('./z-index.mjs').zIndex;
export type ZIndexToken = keyof ZIndex;
