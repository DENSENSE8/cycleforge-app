import { LIFECYCLE_CLASSES } from './lifecycle';

/**
 * Phone item-record faces — photo + context row, title row, and an operational facts row. Desk compound order under the title: qty · amount · condition.
 */

/** Industrial phone queue row. */
export const ITEM_RECORD_MOBILE_ROW = {
  shell:
    'relative overflow-hidden border-b border-border-hairline bg-surface-card',
  actionCluster: 'ml-auto flex shrink-0 items-center gap-px',
  primaryReveal: 'w-[88px]',
  triageReveal: 'w-36',
} as const;

/**
 * The left state rail is a semantic workflow projection. The shared Outbound
 * resolver selects the role; this face alone maps that role to color tokens.
 */
export const ITEM_RECORD_MOBILE_STATE_RAIL = {
  ready: 'border-l-4 border-border-accent',
  exception: 'border-l-4 border-border-danger',
  packed: `border-l-4 ${LIFECYCLE_CLASSES.packed.spine}`,
} as const;

export const ITEM_RECORD_MOBILE_THUMB = {
  /**
   * The thumbnail is a real grid cell, not a card beside the record. The
   * selected state widens that one track from 48px to 80px without changing
   * the three-row information hierarchy to its right.
   */
  grid: 'grid-cols-[auto_minmax(0,1fr)]',
  // The photo rail is a full-height row edge, never a 48px tile with a blank
  // gutter beneath it when the management facts add a third line.
  column: 'flex self-stretch items-stretch pr-2',
  face: 'relative flex w-12 shrink-0 self-stretch items-center justify-center overflow-hidden bg-surface-card',
  /** The phone cube — 64px, where the desk face (`ITEM_RECORD_FACE`) is 80px. */
  size: 'w-12',
  activeSize: 'w-20',
  corner: 'rounded-none',
  packageIcon: 'size-6',
  /** Missing catalog photo: explicit part marker + two-character item mark. */
  fallbackMark:
    'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-surface-sunken font-mono text-role-eyebrow font-semibold uppercase tracking-wide text-text-default',
  fallbackLabel: 'text-text-muted',
} as const;

export const ITEM_RECORD_MOBILE_TITLE = {
  // A three-line management record must compact upward beside the fixed 48px
  // thumbnail; centered content plus bottom padding creates a false blank gutter.
  band: 'flex min-h-0 min-w-0 flex-col justify-start gap-0 self-stretch pt-1 pb-0',
  context: 'flex min-w-0 items-center gap-2 text-role-eyebrow font-semibold uppercase tracking-wide text-text-muted',
  locationContext: 'shrink-0 font-mono text-role-eyebrow font-semibold uppercase tracking-wide text-text-default',
  face: 'line-clamp-1 min-w-0 truncate text-sm font-semibold leading-5 text-text-default',
  foot: 'flex min-w-0 items-center gap-1',
  /** Quiet Row 3 scan fallback: present on glass, never title-weight. */
  skuTertiary: 'shrink-0 font-mono text-role-caption font-normal normal-case leading-4 text-text-muted',
  quantityAnchor: 'ml-2 flex min-w-18 shrink-0 self-stretch flex-col items-end justify-center bg-surface-sunken px-2 text-right',
  quantityLabel: 'text-role-eyebrow font-semibold uppercase tracking-wide text-text-muted',
  quantityValue: 'text-base font-bold leading-5 tabular-nums text-text-default',
  quantityStatus: 'text-role-eyebrow font-semibold uppercase tracking-wide text-text-success',
  conditionPill: 'shrink-0 border border-border-default bg-surface-sunken px-1.5 py-0.5 font-mono text-role-eyebrow font-semibold uppercase tracking-wide text-text-default',
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
const ITEM_RECORD_MOBILE_STAGE_ICONS = {
  pick: 'package-search',
  packed: 'package',
} as const;
