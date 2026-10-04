/** Composed typography presets — Tailwind class strings for common text patterns. */

/**
 * Section headers in sidebars, panels, and cards ("Shipping", "Details").
 * Write them in sentence case.
 */
export const sectionLabel =
  'text-role-caption font-semibold text-text-soft' as const;

/** Form field labels ("SKU *", "Condition") — same two faces as {@link sectionLabel}. */
export const fieldLabel =
  'text-role-caption font-medium text-text-muted' as const;

/** Primary data values (e.g. product titles, names) */
export const dataValue = 'text-sm font-semibold text-text-default' as const;

/** Monospace data values (e.g. serial numbers, tracking codes, SKUs) */
export const monoValue = 'text-sm font-semibold font-mono text-text-default' as const;

/** Chip / badge text — the ONE face for dense mono IDs (CopyChip `dense`, card header ID chips, carton chrome cells). */
export const chipText =
  'text-role-data font-semibold font-mono tabular-nums leading-none' as const;

/** Primary record identity in a dense chip; one step above supporting SKU/tracking metadata. */
export const identityChipText =
  'text-role-body font-semibold font-mono tabular-nums leading-none' as const;

/** Word face — the sentence-case twin of {@link chipText} for LABELS (Claim, eBay, Medium, PO) as opposed to IDs and figures. */
export const chipLabel =
  'text-role-caption font-semibold font-sans leading-none' as const;

/** PO line received/expected counts (e.g. accordion "1/3" meta) */
export const qtyProgress = 'text-role-data font-semibold font-mono tabular-nums leading-none' as const;

/**
 * LedgerGrid Sheets body fact (product title, plain cell text).
 * Pair with dense CopyChips (`chipText`) for mono IDs — never raw `text-sm`.
 */
export const ledgerCell = 'min-w-0 truncate text-role-data text-text-default' as const;

/** Card titles (e.g. OrderCard and FbaItemCard main headings). */
export const cardTitle = 'text-base font-semibold text-text-default leading-tight' as const;

/** Dense record-row title: readable, but quieter than the identity and decision facts around it. */
export const denseRecordTitle = 'text-sm font-medium leading-tight' as const;

/** LedgerGrid / AdminTable column headers — quiet label chrome (override role-micro's 600 weight). */
/**
 * Column-header face. BLACK ink (operator ruling 2026-08-31, was
 * `text-text-soft`): a header is the label an operator aims a sort or a resize
 * at, and a grey one reads as disabled next to the values under it.
 */
export const tableHeader = 'text-role-micro font-normal text-text-default' as const;

/** Table cell content */
export const tableCell = 'text-sm font-semibold text-text-default' as const;

/** Micro badges and subtitle accents — case follows the region's label voice (`--mode-label-case`). */
export const microBadge = 'text-role-micro' as const;

/**
 * Status pill words (`In repair`, `Incoming shipment`, `Pending`, `Open`) — the
 * micro size in the app's clean sans (Inter), sentence case, no tracking. Owner
 * 2026-10-03: a status is read at a glance and must not wear the condensed
 * dense-chrome cut or the region's caps voice that `text-role-micro` binds.
 */
export const statusPillLabel = 'text-role-micro font-sans font-semibold normal-case tracking-normal' as const;

const typographyPresets = {
  sectionLabel,
  fieldLabel,
  dataValue,
  monoValue,
  chipText,
  identityChipText,
  chipLabel,
  qtyProgress,
  ledgerCell,
  cardTitle,
  denseRecordTitle,
  tableHeader,
  tableCell,
  microBadge,
  statusPillLabel,
} as const;

type TypographyPresets = typeof typographyPresets;
