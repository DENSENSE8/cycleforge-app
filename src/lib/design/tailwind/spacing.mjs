/**
 * Density-aware spacing scale values — loaded natively by Node
 * (tailwind.config) without MODULE_TYPELESS_PACKAGE_JSON reparsing, same
 * pattern as `z-index.mjs`. Types live in `spacing.ts`.
 *
 * Every step = Tailwind's stock rem value × var(--cf-density, 1) — the same
 * treatment as the CF Type `role-*` fontSize tokens (tailwind.config.mjs). At
 * the default density (1) each value renders pixel-identical to the stock
 * scale, so wiring this in is additive and invisible; inside a
 * `[data-density='compact']` container (--cf-density: 0.92, globals.css)
 * padding/margin/gap tighten together with type.
 *
 * Merged via `theme.extend.spacing` (Tailwind v3 = merge, not replace): keys
 * listed here become density-aware everywhere the spacing scale is consumed
 * (p-*, m-*, gap-*, space-*, inset-*, w-*, h-*, translate-*, …); keys NOT
 * listed keep Tailwind's static stock values. The set below covers the
 * complete in-use p/m/gap/space key census (2026-07-13, spacing-token-leakage
 * plan §9) — when a new key enters use, add it here so it joins the density
 * scale instead of silently staying static.
 *
 * `0` and `px` stay literal — never scale a zero or a hairline.
 */
const d = (rem) => `calc(${rem} * var(--cf-density, 1))`;

export const spacingScale = {
  0: '0px',
  px: '1px',
  0.5: d('0.125rem'),
  1: d('0.25rem'),
  1.5: d('0.375rem'),
  2: d('0.5rem'),
  2.5: d('0.625rem'),
  3: d('0.75rem'),
  3.5: d('0.875rem'),
  4: d('1rem'),
  5: d('1.25rem'),
  6: d('1.5rem'),
  7: d('1.75rem'),
  8: d('2rem'),
  9: d('2.25rem'),
  10: d('2.5rem'),
  11: d('2.75rem'),
  12: d('3rem'),
  14: d('3.5rem'),
  16: d('4rem'),
  20: d('5rem'),
  24: d('6rem'),
  28: d('7rem'),
  32: d('8rem'),
  36: d('9rem'),
  40: d('10rem'),
  44: d('11rem'),
};
