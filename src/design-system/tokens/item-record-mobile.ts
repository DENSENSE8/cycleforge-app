/**
 * Phone item-record faces — photo + two rows (title · qty/price/condition).
 * Desk compound order under the title: qty · amount · condition.
 */

export const ITEM_RECORD_MOBILE_THUMB = {
  grid: 'grid-cols-[auto_1fr]',
  column: 'self-stretch',
  face: 'relative flex h-full w-16 shrink-0 items-center justify-center self-stretch overflow-hidden bg-surface-card',
  corner: 'rounded-none',
  packageIcon: 'size-6',
} as const;

export const ITEM_RECORD_MOBILE_TITLE = {
  band: 'flex min-h-0 min-w-0 flex-col justify-center gap-0.5 self-stretch py-2 pl-2 pr-2',
  face: 'line-clamp-1 min-w-0 truncate text-sm font-semibold leading-5 text-text-default',
  foot: 'flex min-w-0 items-center gap-1',
} as const;

export const ITEM_RECORD_MOBILE_META = {
  cluster: 'row-tight min-w-0 items-center text-role-caption leading-4',
  corner: 'rounded-lg',
  qty: 'shrink-0 text-role-caption font-semibold tabular-nums',
  price: 'shrink-0 text-role-caption font-semibold tabular-nums text-text-success',
  condition: 'shrink-0 text-role-caption font-semibold',
  notes: 'min-w-0 truncate text-role-caption text-text-muted',
  notesIdle: 'h-3 w-3 shrink-0 text-text-faint',
  sep: 'shrink-0 text-text-faint',
} as const;

export const ITEM_RECORD_MOBILE_STAGE = {
  cluster: 'ml-auto flex shrink-0 items-center gap-2',
  mark: 'flex min-w-0 items-center gap-1',
  glyph: 'inline-flex min-w-0 items-center gap-1 text-text-muted',
  icon: 'h-3 w-3 shrink-0',
  verb: 'text-role-eyebrow font-medium text-text-muted',
  stamp: 'text-role-eyebrow text-text-muted tabular-nums',
  empty: 'block size-4 shrink-0 border border-dashed border-border-default bg-surface-card',
} as const;

/** Catalog done verbs + the pending-claim word. Never a staff name. */
export const ITEM_RECORD_MOBILE_STAGE_VERBS = {
  pick: 'Picked',
  packed: 'Packed',
  assigned: 'Assigned',
} as const;

/** Catalog iconKey → glyph. Pick = package-search; Packed = package. */
export const ITEM_RECORD_MOBILE_STAGE_ICONS = {
  pick: 'package-search',
  packed: 'package',
} as const;
