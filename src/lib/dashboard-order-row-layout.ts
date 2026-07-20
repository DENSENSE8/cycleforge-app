/**
 * Dashboard / queue table row layout.
 *
 * Two desktop anatomies:
 *   • **legacy** (`dashboardOrderRowShellClass`) — title+meta stack left, chips right.
 *     Still used by Shipped / Receiving siblings.
 *   • **orders queue columns** (`ordersQueueRowShellClass`) — a Google-Sheets-like
 *     WMS grid where EVERY fact owns its own track so the sticky header label
 *     locks vertically to each cell:
 *       select · status · title · qty · cond · age · notes · platform · order · tracking
 *     One track per column — never a bundled "ids" mega-cell — so platform,
 *     order, and tracking headers each dock over their own values. The row drag
 *     grip lives ONLY in the sticky header (select-all context); rows carry the
 *     checkbox alone. Mobile still stacks for thumb scanning.
 *
 * Driven by UIMode `isMobile` — desktop mode always renders the chosen desktop
 * anatomy regardless of viewport width.
 */

/** Sticky column header docks at the scrollport top; day bands sit beneath it. */
export const ORDERS_QUEUE_COL_HEADER_STICKY = 'top-0';
/** Day-band sticky offset — must match the column header’s rendered height (~36px). */
export const ORDERS_QUEUE_DATE_STICKY = 'top-9';

/**
 * Fixed track widths for the orders-queue columnar grid (desktop).
 * Keep header + row + group summary on THIS template — never mix `auto`/`fr`
 * for the same slot across rows, or columns drift (the uneven look the Sheets
 * rewrite exists to kill). Only `title` and `notes` flex; every id/fact column
 * is a fixed track so the header locks to it.
 */
const ORDERS_QUEUE_COL = {
  /** Row checkbox (header also holds the micro drag grip + select-all). */
  select: '2rem',
  /** Pipeline status dot — one shared vertical x across every row. */
  status: '1.25rem',
  /** Product title — primary flexing track. */
  title: 'minmax(14rem, 1.6fr)',
  qty: '2.5rem',
  condition: '3.5rem',
  /** Days-late pill / lane-age mono (single urgency column). */
  age: '3.25rem',
  /** Truncated order notes (secondary flexing track). */
  notes: 'minmax(6rem, 0.7fr)',
  /** Short platform label (`ebay` / `amazon`) — no leading glyph on this table. */
  platform: '5.5rem',
  /** Order id last-4 — no `#` glyph. */
  order: '4rem',
  /** Tracking / scan last-4 (or staged serial fallback) — no pin glyph. */
  tracking: '4rem',
} as const;

/** Canonical desktop grid — same string for header, every row, and group summary. */
export function ordersQueueGridTemplate(): string {
  return [
    ORDERS_QUEUE_COL.select,
    ORDERS_QUEUE_COL.status,
    ORDERS_QUEUE_COL.title,
    ORDERS_QUEUE_COL.qty,
    ORDERS_QUEUE_COL.condition,
    ORDERS_QUEUE_COL.age,
    ORDERS_QUEUE_COL.notes,
    ORDERS_QUEUE_COL.platform,
    ORDERS_QUEUE_COL.order,
    ORDERS_QUEUE_COL.tracking,
  ].join(' ');
}

/** Desktop columnar shell (orders queue + station rows that share it). */
export function ordersQueueRowShellClass(isMobile: boolean): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : 'grid w-full min-w-0 items-center gap-x-2';
}

/** Legacy two-zone shell — Shipped / Receiving / walk-in. */
export function dashboardOrderRowShellClass(isMobile: boolean): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2';
}

export function dashboardOrderRowChipsClass(isMobile: boolean): string {
  const base = 'flex shrink-0 flex-wrap items-center gap-0.5';
  return isMobile
    ? `${base} w-full justify-end`
    : `${base} justify-end pr-1`;
}
