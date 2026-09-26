/** Density-aware spacing scale — the single source of truth for padding/margin/gap steps. */
export { spacingScale } from './spacing.mjs';

type SpacingScale = typeof import('./spacing.mjs').spacingScale;
type SpacingKey = keyof SpacingScale;
