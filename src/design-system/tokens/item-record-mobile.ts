/**
 * Phone item-record faces — photo + two rows (title · qty/price/condition).
 * Desk compound order under the title: qty · amount · condition.
 */

export const ITEM_RECORD_MOBILE_THUMB = {
  grid: 'grid-cols-[auto_1fr]',
  column: 'self-stretch',
  face: 'relative flex h-full w-16 shrink-0 items-center justify-center self-stretch overflow-hidden bg-surface-card',
  /**
   * The phone cube — 64px, where the desk face (`ITEM_RECORD_FACE`) is 80px.
   * A phone row is 390px wide and the photo is the cheapest 16px to give back:
   * the title and the SKU under it are what an operator reads to decide, and at
   * 80px a two-word product name truncated mid-word. `.face` states the same
   * width for the card-row variant that also owns the background.
   */
  size: 'w-16 min-h-16',
  corner: 'rounded-none',
  packageIcon: 'size-6',
} as const;

export const ITEM_RECORD_MOBILE_TITLE = {
  band: 'flex min-h-0 min-w-0 flex-col justify-center gap-0.5 self-stretch py-2 pl-2 pr-2',
  face: 'line-clamp-1 min-w-0 truncate text-sm font-semibold leading-5 text-text-default',
  foot: 'flex min-w-0 items-center gap-1',
} as const;

export const ITEM_RECORD_MOBILE_META = {
  // `row-gap` (8px), not `row-tight` (6px): the middot separators are gone
  // (operator 2026-09-15), so whitespace is the only thing keeping the three
  // facts apart. Tighten this and `2 $40 Grade A` reads as one string.
  cluster: 'row-gap min-w-0 items-center text-role-caption leading-4',
  corner: 'rounded-lg',
  /** Identity, not a fact — mono and quiet so the eye skips it when scanning. */
  itemNumber: 'min-w-0 truncate font-mono text-role-caption text-text-muted',
  qty: 'shrink-0 text-role-caption font-semibold tabular-nums',
  price: 'shrink-0 text-role-caption font-semibold tabular-nums text-text-success',
  condition: 'shrink-0 text-role-caption font-semibold',
  notes: 'min-w-0 truncate text-role-caption text-text-muted',
  notesIdle: 'h-3 w-3 shrink-0 text-text-faint',
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
