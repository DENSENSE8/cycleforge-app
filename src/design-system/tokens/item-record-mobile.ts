/**
 * Phone item-record faces — qty · condition · notes as ONE cluster, a padded
 * cornered thumb, a two-line reserved title, and Pick / Packed matching the
 * desk CompoundStageStep (PackageSearch / Package + Assigned or stamp).
 *
 * design-mcp introspects this file as `ds_tokens({ axis: 'item-record' })`.
 * Named queries: `ds_tokens({ axis: 'item-record', query: 'meta' | 'thumb' |
 * 'stage' | 'title' })`. Adding a phone card fact is a key here — never three
 * independent chips, never a person's name on the card.
 */

export const ITEM_RECORD_MOBILE_THUMB = {
  /** Thumb column is the padded square, not a 5rem flush bleed. */
  grid: 'grid-cols-[auto_1fr]',
  column: 'p-2 pr-0',
  face: 'relative flex size-20 shrink-0 items-center justify-center overflow-hidden',
  /** Soft inner corner inside Panel radius=xl. Not the industrial ladder (flush). */
  corner: 'rounded-lg',
  packageIcon: 'size-8',
} as const;

export const ITEM_RECORD_MOBILE_TITLE = {
  /** Title on top, meta+stage pinned to the bottom of the two-line band. */
  band: 'flex min-h-0 min-w-0 flex-col justify-between self-stretch py-2 pr-2',
  face: 'line-clamp-2 min-h-[2lh] text-role-title font-semibold leading-snug text-text-default',
  foot: 'flex min-w-0 items-end gap-2',
} as const;

export const ITEM_RECORD_MOBILE_META = {
  /** Qty · condition · notes. One sunken token under the reserved title. */
  cluster: 'row-gap min-w-0 bg-surface-sunken inset-chip',
  corner: 'rounded-lg',
  qty: 'shrink-0',
  condition: 'shrink-0 font-semibold',
  notes: 'min-w-0 truncate text-role-caption text-text-muted',
  notesIdle: 'h-3 w-3 shrink-0 text-text-faint',
} as const;

export const ITEM_RECORD_MOBILE_STAGE = {
  /** Pick + Packed marks, right of the meta cluster. Desk CompoundStageStep face. */
  cluster: 'ml-auto shrink-0 flex items-start gap-3',
  mark: 'flex min-w-0 flex-col',
  glyph: 'inline-flex min-w-0 items-center gap-1 text-text-muted',
  icon: 'h-3.5 w-3.5 shrink-0',
  verb: 'text-role-caption font-semibold uppercase tracking-wide text-text-default',
  stamp: 'text-role-caption text-text-muted tabular-nums',
  /** Desk unclaimed mark (CompoundStageStep). Phone stage does not paint this. */
  empty: 'block h-5 w-5 shrink-0 border border-dashed border-border-default bg-surface-card',
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
