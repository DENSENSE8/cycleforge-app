/**
 * Density-aware spacing scale — the single source of truth for
 * padding/margin/gap steps.
 *
 * Values live in `spacing.mjs` (Node-native ESM for tailwind.config — see
 * `.claude/rules/build-gotchas.md`); this module re-exports them with
 * TypeScript types for app code, mirroring `z-index.ts`.
 *
 * Usage:
 *   - Tailwind: `p-3` / `gap-2` / `space-y-6` — the numeric scale itself is
 *     density-aware (wired in tailwind.config.ts from spacing.mjs), so
 *     existing utilities pick it up with no class rename.
 *   - Inline style (rare): `style={{ padding: spacingScale[3] }}`.
 *
 * The old static `spacing`/`density` exports (a bespoke 0.2/0.4/0.6rem scale
 * plus px/py preset maps) were retired when the scale was wired (spacing
 * token-leakage plan Phase 1): nothing read the CSS vars they fed, and their
 * values disagreed with the Tailwind scale the app actually renders with.
 */
export { spacingScale } from './spacing.mjs';

export type SpacingScale = typeof import('./spacing.mjs').spacingScale;
export type SpacingKey = keyof SpacingScale;
