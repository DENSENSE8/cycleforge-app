'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { EMPTY_META_DASH, conditionGradeTableLabel, isEmptyMetaDash } from '@/lib/conditions';
import { orderRowConditionTone } from '@/lib/condition-tone';

import {
  QUEUE_ROW_META_INDENT,
} from '@/components/ui/queue-row-chrome';

export {
  QUEUE_ROW,
  metaIndentFor,
} from '@/components/ui/queue-row-chrome';

/** Dashboard / queue / receiving order-row title + meta subrow. */

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
   * PO line accordion — legacy fixed condition track. PoLineMetaGrid now uses
   * `auto` boxed cells (`grid-cols-[auto_auto_auto_minmax(2.5rem,1fr)_auto]`);
   * keep this token for any sibling that still sizes a dedicated condition slot.
   */
  poCondCol: '3.75rem',
  /**
   * PO line accordion — SKU last-8 chip column (legacy). Nested-grid meta uses
   * `auto` intrinsic width; keep for queue/header mirrors that still need it.
   */
  skuCol: 'max-content',
  /** PO line accordion — serial flex track (legacy token; meta grid embeds this). */
  serialCol: 'minmax(2.5rem, 1fr)',
  /**
   * PO line accordion — unit price (legacy). Nested-grid meta places price in a
   * trailing `auto` cell after the serials `1fr` cell.
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
          // at dense sizes extra weight blooms and fights Inter’s clarity.
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

/** Left meta subrow under a product title: */
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
  // Per-staff hidden slots (no-op outside a TableColumnConfigProvider).
  const isHidden = (_key?: string) => false;
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
        'mt-0.5 grid min-w-0 items-center gap-x-0.5 text-role-eyebrow text-text-muted',
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
