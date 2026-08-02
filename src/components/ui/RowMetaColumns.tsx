'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
import { EMPTY_META_DASH, conditionGradeTableLabel, isEmptyMetaDash } from '@/lib/conditions';
import { orderRowConditionTone } from '@/lib/condition-tone';

import {
  QUEUE_ROW_META_INDENT,
} from '@/components/ui/queue-row-chrome';

export {
  QUEUE_ROW,
  metaIndentFor,
} from '@/components/ui/queue-row-chrome';

/**
 * Dashboard / queue / receiving order-row title + meta subrow.
 *
 * The row's identity chips already lay out as fixed virtual columns on the right
 * via `ChipColumns` / `CHIP_COL` (see ui/ChipColumns). This is the LEFT-side
 * counterpart: the product title and the "qty · condition · rest" subrow beneath
 * it, factored out of the five tables that used to hand-roll (and drift) it —
 * DashboardShippedTable, OrdersQueueTable, TechTable, PackerTable,
 * ReceivingLinesTable.
 *
 * Layout contract:
 *   • The dot sits centered inside a fixed `dotTrack` (w-5 / w-7) so the title
 *     text begins at a known x.
 *   • RowMetaColumns indents by that SAME width (`indent`) so the subrow lines up
 *     under the title text — NOT under the dot — and then locks qty | condition |
 *     rest into FIXED virtual columns (a CSS grid), the left-side mirror of
 *     ChipColumns. Because the qty track is a fixed width, the condition starts at
 *     the same x on every row whether qty is "1" or "100/100" — so the columns
 *     never drift the way a content-width flow does.
 *
 * Left-edge stack (title text x), outer → inner:
 *   page gutter → card → [optional nest] → QUEUE_ROW.px → [select gutter] →
 *   META_COL dotTrack → title. Meta indent = metaIndentFor(track, selectMode).
 *   Wide track is intentional for received/expected qty (Receiving) — title starts
 *   0.5rem later than Orders; do not collapse to w-5.
 *
 * Typography — CF Type roles (search-and-dense-ui plan §2.4):
 *     title → text-role-data text-text-default (role-caption when `small`;
 *             role bakes weight 500 — do not stack font-semibold/bold)
 *     meta  → text-role-eyebrow uppercase text-text-muted (role bakes 600 + tracking;
 *             muted — not soft/faint — so qty/condition stay scannable at ops density)
 *
 * INVARIANTS:
 *   • RowMetaColumns `indent` MUST equal the RowTitle `dotTrack` width
 *     (w-5 → 1.25rem, w-7 → 1.75rem). Use `metaIndentFor`, never a hand-rolled calc.
 *   • A wide qty count ("0/1"…"100/100", receiving) needs the wider `qtyCol`
 *     (`qtyColWide`) so it doesn't clip — pair it with `indentWide`/`dotTrackWide`.
 *   • Accordion group headers MUST mirror child meta tracks (`indent` / `qtyCol` /
 *     `condCol`). Receiving PO headers + line rows both use `poCondCol` so the
 *     stage clock (`RowStageTimeMeta` / `META_REST_COL.stageTime`) starts at the
 *     same x whether the row shows PARTS or an empty condition.
 *   • Queue/station rows use `QUEUE_ROW.px` (never page-local `px-4`).
 *   Keep META_COL + QUEUE_ROW the single source for these paired widths.
 *
 * (Meta fields are low visual weight; chip reflow when toggling Configure columns
 * is animated in ChipColumns.)
 */

export const META_COL = {
  /** Default dot-track width AND meta indent — single-token counts (orders/shipped/tech/packer). */
  indent: QUEUE_ROW_META_INDENT.default,
  dotTrack: 'w-5',
  /** Wider variant for received/expected counts ("0/1" … "100/100") — receiving. */
  indentWide: QUEUE_ROW_META_INDENT.wide,
  dotTrackWide: 'w-7',
  /** Fixed qty-column track — single/low counts ("1"…"999"). */
  qtyCol: '0.75rem',
  /** Fixed qty-column track — received/expected counts ("0/1"…"100/100"). */
  qtyColWide: '2.15rem',
  /** Fixed condition-column track — NEW / USED / L-NEW / PARTS (table labels). */
  condCol: '2.25rem',
  /**
   * PO line accordion — fixed condition-column track sized to the LONGEST
   * `ConditionGradeChip` table label ("PARTS" / "L-NEW", both ~57.7px measured
   * dense). Fixed (not `max-content`) so the chip starts at the same x on every
   * row and the columns don't drift; 3.75rem (60px) fits the widest label with a
   * sub-pixel safety margin. Wider than the shared 2.5rem `condCol` (which clips
   * "PARTS" → "PAR"), so it stays a separate PoLineMetaGrid-only token. */
  poCondCol: '3.75rem',
  /**
   * PO line accordion — SKU last-8 chip column. Content-width, NOT a fixed
   * 2.75rem: `SkuScanRefChip` truncates itself inside a fixed track, so the
   * 4-char last-8 was clipping to "0…". `max-content` sizes the track to the
   * full last-8 (mono → consistent across rows). Only PoLineMetaGrid uses this.
   */
  skuCol: 'max-content',
  /** PO line accordion — serial chip column (the flex track that absorbs slack). */
  serialCol: 'minmax(2.5rem, 1fr)',
  /**
   * PO line accordion — unit price (tabular, right-aligned). Content-width, NOT a
   * fixed 2.75rem: the price chip is intentionally non-shrinking (fitDisplayWidth),
   * so a fixed track clipped any amount wider than "$8.88" off the card's right
   * edge. `max-content` sizes the track to the full amount ($1,299.00) and the
   * serial column (1fr) gives up the slack.
   */
  priceCol: 'max-content',
} as const;

/**
 * Fixed tracks inside the meta `rest` cluster — in-lane age, staff initials, stage
 * stamp. Same rigid-column idea as `META_COL` qty/condition; keeps packed/staged
 * rows vertically scannable when optional facts (price, days late) vary by row.
 */
export const META_REST_COL = {
  /** In-lane age compact label (<1m … 999d) — sized for mono tabular digits. */
  laneAge: 'w-[2rem]',
  /** Single tester or packer initials slot (2 chars or `--`). */
  staff: 'w-[1.25rem] justify-center',
  /** Stage stamp (12:16 PM / 3m ago). */
  stageTime: 'w-[4.5rem]',
} as const;

/** Fixed-width meta fact cell — renders muted centered `--` when empty and `reserve` is true. */
export function MetaFactSlot({
  width,
  children,
  className,
  reserve = true,
}: {
  width: string;
  children?: ReactNode;
  className?: string;
  reserve?: boolean;
}) {
  const hasContent = children != null && children !== false;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center tabular-nums normal-case tracking-normal',
        !hasContent && reserve && 'justify-center',
        width,
        className,
      )}
    >
      {hasContent ? (
        children
      ) : reserve ? (
        <span className="text-text-muted" aria-hidden>
          {EMPTY_META_DASH}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Condition fact for order/queue/station meta rows. Empty values render the
 * house `--` centered in the fixed condition track; real labels stay start-aligned.
 */
export function RowConditionMeta({
  condition,
  className,
}: {
  condition: string | null | undefined;
  className?: string;
}) {
  const label = conditionGradeTableLabel(condition);
  return (
    <span
      className={cn(
        orderRowConditionTone(condition),
        isEmptyMetaDash(label) && 'block w-full text-center',
        className,
      )}
    >
      {label}
    </span>
  );
}

export function RowTitle({
  dot,
  dotTitle,
  dotTooltip,
  title,
  dotTrack = META_COL.dotTrack,
  /** Smaller title (text-role-caption) instead of the default text-role-data. */
  small,
  /** Optional leading slot rendered before the dot (e.g. a select-mode checkbox). */
  leading,
  titleClassName,
}: {
  /** Tailwind background class for the status dot. */
  dot: string;
  /** Hover/a11y label for the dot. */
  dotTitle?: string;
  /** When true, render `dotTitle` via the styled HoverTooltip instead of the native title attr. */
  dotTooltip?: boolean;
  title: ReactNode;
  dotTrack?: string;
  small?: boolean;
  leading?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center">
      {leading != null ? (
        <span className="mr-2 flex shrink-0 items-center">{leading}</span>
      ) : null}
      {/* Dot centered inside the dot-track so the title text starts at a known x. */}
      <span className={cn('flex shrink-0 items-center justify-center', dotTrack)}>
        {dotTooltip && dotTitle ? (
          <HoverTooltip label={dotTitle} className="flex items-center">
            <span className={cn('h-2 w-2 rounded-full', dot)} />
          </HoverTooltip>
        ) : (
          /* ds-allow-title */
          <span className={cn('h-2 w-2 rounded-full', dot)} title={dotTitle} />
        )}
      </span>
      <div
        className={cn(
          // Role utilities already bake weight (500); avoid stacking semibold —
          // at dense sizes extra weight blooms and fights IBM Plex’s clarity.
          'truncate text-text-default',
          small ? 'text-role-caption' : 'text-role-data',
          titleClassName,
        )}
      >
        {title}
      </div>
    </div>
  );
}

/**
 * Left meta subrow under a product title: fixed qty | condition tracks, then a
 * fact-only `rest` flex of optional signals. Callers MUST omit empty facts —
 * never render ghost "---" staff or empty icon boxes (Pending/Blocked have no
 * tester yet; blank slots destroy column scan).
 *
 * Recommended `rest` order (queue / fulfillment tables):
 *   1. price        — money (success tone), only if present
 *   2. daysLate     — tabular urgency number, only if deadline past
 *   3. staff        — StaffInitials cluster, only when at least one assignee
 *   4. flags        — exception icons sharing one cluster:
 *                      notes = muted FileText · OOS = red AlertTriangle
 *                      (same slot family, different tone = different severity)
 *   5. lifecycle    — e.g. LBL printed chip
 *
 * Notes vs OOS: both are "attention" icons, not people or quantities. Pair them
 * in one `flags` group so the eye learns "icons = exceptions"; keep tones
 * distinct so OOS still screams blocked stock and notes stay quiet context.
 */
export function RowMetaColumns({
  qty,
  condition,
  rest,
  indent = META_COL.indent,
  qtyCol = META_COL.qtyCol,
  condCol = META_COL.condCol,
  className,
}: {
  qty: ReactNode;
  condition: ReactNode;
  /**
   * Trailing fact-only cluster after condition. Prefer the slot order in the
   * docblock above; never pass placeholder staff ("---") or empty reserved cells.
   */
  rest?: ReactNode;
  /** Left indent — pass the matching RowTitle `dotTrack` width so qty aligns under the title. */
  indent?: string;
  /** Fixed qty-column width — pass `META_COL.qtyColWide` for wide received/expected counts. */
  qtyCol?: string;
  /** Fixed condition-column width. */
  condCol?: string;
  className?: string;
}) {
  // Per-staff hidden slots (no-op outside a TableColumnConfigProvider). A hidden
  // slot drops its grid track + cell; chip side uses the same drop + layout animation.
  const isHidden = useIsColumnHidden();
  const showQty = !isHidden('qty');
  const showCondition = !isHidden('condition');
  const showRest = rest != null && !isHidden('rest');

  // Build the virtual-column template from only the visible slots.
  const tracks: string[] = [];
  if (showQty) tracks.push(qtyCol);
  if (showCondition) tracks.push(condCol);
  if (showRest) tracks.push('minmax(0,auto)');

  if (tracks.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-0.5 grid min-w-0 items-center gap-x-0.5 text-role-eyebrow uppercase text-text-muted',
        className,
      )}
      style={{ paddingLeft: indent, gridTemplateColumns: tracks.join(' ') }}
    >
      {showQty ? (
        <span data-col="qty" className="truncate text-right font-mono tabular-nums normal-case tracking-normal">
          {qty}
        </span>
      ) : null}
      {showCondition ? (
        <span data-col="condition" className="min-w-0 truncate text-left">
          {condition}
        </span>
      ) : null}
      {showRest ? (
        <span data-col="rest" className="flex min-w-0 items-center gap-0.5 truncate">{rest}</span>
      ) : null}
    </div>
  );
}
