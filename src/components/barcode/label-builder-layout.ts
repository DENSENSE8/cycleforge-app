/**
 * Warehouse Labels / Racks label-builder layout pin.
 *
 * Barcode-local only — NOT promoted to `@/design-system` yet.
 * Approve before moving tokens/components into the DS SoT table.
 *
 * Desktop = ops density (compact). Mobile builders keep their own larger
 * targets until a density prop is introduced.
 */

export const LABEL_BUILDER = {
  /** Inner content column — matches StickyActionBar default. */
  contentMax: 'max-w-3xl',
  contentShell: 'mx-auto w-full max-w-3xl',
  /** Page gutter around Labels/Racks main panes. */
  pagePad: 'px-4 py-5 sm:px-6',
  /** Vertical rhythm inside the builder column. */
  stackGap: 'gap-3',
} as const;

/** Quiet selected chrome — solid / soft, no blue gradients. */
export const LABEL_BUILDER_SELECTED = {
  /** Numpad pad / step pill active. */
  solid:
    'border-blue-600 bg-blue-600 text-white shadow-none',
  /** Soft selected (room row, custom tile focus). */
  soft: 'border-blue-300 bg-blue-50/80 text-blue-900 ring-1 ring-blue-200',
  /** Done-but-inactive step pill. */
  done: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  /** Primary confirm affordance inside a tile (checkmark). */
  confirm:
    'bg-blue-600 text-white shadow-none disabled:bg-surface-strong disabled:text-text-faint',
} as const;

/** Desktop ops sizing for numeric quick-picks. */
export const LABEL_BUILDER_NUMPAD = {
  grid: 'grid max-w-md grid-cols-5 gap-1.5',
  tile: 'relative flex h-11 flex-col items-center justify-center rounded-xl border text-center transition-colors',
  tileLabel: 'font-mono text-sm font-semibold tabular-nums tracking-tight',
  customTile:
    'relative flex h-11 items-center rounded-xl border border-dashed bg-surface-card pl-2.5 pr-1 transition-colors',
  customInput:
    'h-full w-full min-w-0 bg-transparent pr-1 text-center font-mono text-sm font-semibold tabular-nums tracking-tight text-text-default outline-none placeholder:text-role-caption placeholder:font-medium placeholder:tracking-wide placeholder:text-text-faint [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
} as const;
