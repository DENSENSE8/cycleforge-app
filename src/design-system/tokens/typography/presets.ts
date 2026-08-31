/**
 * Composed typography presets — Tailwind class strings for common text patterns.
 * These eliminate drift from hand-rolling the same size/weight/tracking combos.
 *
 * LedgerGrid Sheets body is caption-dense (`ledgerCell` + dense CopyChips via
 * `chipText`). Headers / status chips stay `text-role-micro` (intentional chrome).
 */

/** Section headers in sidebars, panels, and cards (e.g. "SHIPPING", "DETAILS") */
export const sectionLabel = 'text-role-micro uppercase tracking-[0.2em] text-text-soft' as const;

/** Form field labels (e.g. "SKU *", "CONDITION") */
export const fieldLabel = 'text-role-micro uppercase tracking-[0.16em] text-text-muted' as const;

/** Primary data values (e.g. product titles, names) */
export const dataValue = 'text-sm font-semibold text-text-default' as const;

/** Monospace data values (e.g. serial numbers, tracking codes, SKUs) */
export const monoValue = 'text-sm font-semibold font-mono text-text-default' as const;

/**
 * Chip / badge text — the ONE face for dense mono IDs (CopyChip `dense`, card
 * header ID chips, carton chrome cells). Size · family · weight · numerics ·
 * leading only; **ink is not part of this preset** so callers can paint tone
 * (Photos blue, Claim orange) or state (empty / editing) without a conflicting
 * `text-*` utility landing in the same class string.
 *
 * No `tracking-*`: `role-caption` already carries +0.01em, and the hand-rolled
 * `tracking-tight` this replaced (-0.025em) is what made dense chips read a
 * size smaller than the semibold sans cells sitting beside them on the carton
 * bar. Guard: `carton-chrome-type-unity.guard.test.ts`.
 */
export const chipText =
  'text-role-caption font-semibold font-mono tabular-nums leading-none' as const;

/**
 * Word face — the sentence-case twin of {@link chipText} for LABELS (Claim,
 * eBay, Medium, PO) as opposed to IDs and figures.
 *
 * Identical metrics to `chipText` — same role size, weight, leading — so a word
 * cell and a number cell on one chrome row are the same optical height. Only
 * the FAMILY differs: mono is for values an operator scans character by
 * character (order #, tracking, money); proportional is for words they read.
 * That is the one axis allowed to vary on the carton bar, and it is why these
 * are two presets rather than one.
 *
 * No `uppercase`: labels render in the case the catalog authored them (`eBay`
 * keeps its lowercase e). Shouting them was what made 10px condensed chrome
 * look like a different type system from the 12px row it sits on.
 */
export const chipLabel =
  'text-role-caption font-semibold font-sans leading-none' as const;

/** PO line received/expected counts (e.g. accordion "1/3" meta) */
export const qtyProgress = 'text-role-caption font-semibold font-mono tabular-nums leading-none' as const;

/**
 * LedgerGrid Sheets body fact (product title, plain cell text).
 * Pair with dense CopyChips (`chipText`) for mono IDs — never raw `text-sm`.
 */
export const ledgerCell = 'min-w-0 truncate text-role-caption text-text-default' as const;

/** Card titles (e.g. OrderCard, FbaItemCard, RepairCard main heading) */
export const cardTitle = 'text-base font-semibold text-text-default leading-tight' as const;

/**
 * LedgerGrid / AdminTable column headers — quiet label chrome (override
 * role-micro's 600 weight). Sentence case as authored (`label` / `gridLabel`);
 * never CSS `uppercase` (eyebrows · chips · field/section labels keep that).
 * Guard: `table-header-casing.guard.test.ts`.
 */
/**
 * Column-header face. BLACK ink (operator ruling 2026-08-31, was
 * `text-text-soft`): a header is the label an operator aims a sort or a resize
 * at, and a grey one reads as disabled next to the values under it.
 */
export const tableHeader = 'text-role-micro font-normal text-text-default' as const;

/** Table cell content */
export const tableCell = 'text-sm font-semibold text-text-default' as const;

/** Micro badges (e.g. 8px uppercase labels, subtitle accents) */
export const microBadge = 'text-role-micro uppercase' as const;

export const typographyPresets = {
  sectionLabel,
  fieldLabel,
  dataValue,
  monoValue,
  chipText,
  chipLabel,
  qtyProgress,
  ledgerCell,
  cardTitle,
  tableHeader,
  tableCell,
  microBadge,
} as const;

export type TypographyPresets = typeof typographyPresets;
