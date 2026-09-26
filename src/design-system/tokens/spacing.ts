/** Density-aware spacing scale — the single source of truth for padding/margin/gap steps. */
export { spacingScale } from './spacing.mjs';

export type SpacingScale = typeof import('./spacing.mjs').spacingScale;
export type SpacingKey = keyof SpacingScale;
