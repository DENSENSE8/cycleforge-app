'use client';

/**
 * One pasted number on the Pasted list page — every fact the house holds
 * about it, one column each, Sheets density (4px side pad scaled by the
 * sheet's zoom, single line, a hairline between columns, the full text on
 * hover). A press on a cell COPIES that cell's text (owner 2026-10-04) — a
 * wash fades over it and a toast names the value; the row never opens on a
 * press. The record opens from the hover icon in the Number cell, or Enter / O
 * on the cursor row.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionDuration, motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { LedgerGridLeafRow, gridCellAlignClass } from '@/design-system/components/grid';
import { LEDGER_GRID_FROZEN_CELL, ledgerGridCell } from '@/design-system/components/grid/grid-cell-chrome';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ExternalLink } from '@/components/Icons';
import { StaffCell } from '@/components/identity/StaffCell';
import { GridCellDash } from '@/components/ui/grid-cells';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { formatOrderIdDisplay, getLast8 } from '@/lib/copy-chip-format';
import { RowVerdict } from '@/components/sidebar/contextual/NavBulkRow';
import { PastedListUnits } from './PastedListUnits';
import { JourneyClockCell } from '@/components/outbound/fulfilled/JourneyClockCell';
import {
  PASTED_LIST_CAPABILITIES,
  deliveredWaitDays,
  pastedListCellHint,
  pastedListCellText,
  pastedListFrozenLeft,
  pastedListGridTemplate,
  pastedTimes,
  lastCarrierEventText,
  trackingsOf,
  type PastedListColumn,
  type PastedListColumnKey,
  type PastedListRow,
} from './pasted-list-table';

/** A small marker beside a cell's value (×2 pasted, Backfill). */
const CELL_MARKER = 'shrink-0 rounded-sm bg-surface-sunken px-1 text-role-micro font-medium text-text-muted';

/** A sheet cell: 4px side pad and 2px top/bottom at 100%, scaled by the sheet's zoom (`--cf-density`); one line. */
export const PASTED_LIST_CELL =
  'whitespace-nowrap px-[calc(0.25rem*var(--cf-density,1))] py-[calc(0.125rem*var(--cf-density,1))]';

/** Rows past this one arrive together — the cascade never makes the tail wait. */
const CASCADE_ROWS = 14;

/** Dock-to-stock: amber from 2 days delivered and not unboxed, red from 5. */
function waitTone(days: number): string {
  return days >= 5 ? 'text-text-danger' : days >= 2 ? 'text-text-warning' : 'text-text-muted';
}

/** This row's part of the sheet's cell range (`useCellRangeSelection`): columns c0..c1, and which edges it carries. */
export interface RowRangeSlice {
  c0: number;
  c1: number;
  /** The range's first / last row — they draw its top / bottom outline. */
  top: boolean;
  bottom: boolean;
  /** The anchor cell's column when the anchor is on this row. */
  anchorCol: number | null;
}

/** The 1px accent outline around a range, drawn inside the cells on its edges (no layout). */
export function rangeEdgeShadow(slice: RowRangeSlice, index: number): string | undefined {
  const line = 'var(--ds-color-accent-bg)';
  const parts = [
    slice.top ? `inset 0 1px 0 ${line}` : null,
    slice.bottom ? `inset 0 -1px 0 ${line}` : null,
    index === slice.c0 ? `inset 1px 0 0 ${line}` : null,
    index === slice.c1 ? `inset -1px 0 0 ${line}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export const PastedListGridRow = memo(function PastedListGridRow({
  row,
  index,
  columns,
  lit,
  cascade,
  range,
  flash,
  onPoint,
  onOpen,
}: {
  row: PastedListRow;
  /** Position in the shown list (the cascade step, and the range's row index). */
  index: number;
  columns: readonly PastedListColumn[];
  /** The keyboard cursor. */
  lit: boolean;
  /** First paint of the page: rows settle in top → bottom. */
  cascade: boolean;
  /** The selected cells on this row, or null. */
  range: RowRangeSlice | null;
  /** The cell just copied (a fading wash), `n` restarts it. */
  flash: { col: PastedListColumnKey; n: number } | null;
  onPoint: () => void;
  /** Open the number's record (or the list that holds it). */
  onOpen: () => void;
}) {
  const presence = useMotionPresence(motionPresence.findListRow);
  const settle = useMotionTransition(motionTransition.findListRow);
  const washPresence = useMotionPresence(motionPresence.findCellCopied);
  const wash = useMotionTransition(motionTransition.findCellCopied);
  const { entry, position, primary } = row.view;
  const facts = entry.facts ?? null;
  const times = pastedTimes(row);

  const renderValue = (key: PastedListColumnKey) => {
    const text = pastedListCellText(row, key);
    switch (key) {
      case 'pos':
        return <span className="tabular-nums text-text-faint">{position}</span>;
      case 'ref':
      case 'order':
        // Fulfilled's Order wears the last-8 face (identifier law); the copy and the hover stay the full number.
        return (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate">{key === 'order' ? formatOrderIdDisplay(entry.ref) : entry.ref}</span>
            {times > 1 ? (
              <HoverTooltip label={`Pasted ×${times} — the list keeps one row`} focusable={false} asChild>
                <span data-pasted-times={times} className={CELL_MARKER}>
                  ×{times}
                </span>
              </HoverTooltip>
            ) : null}
            <HoverTooltip label="Open its record" shortcut="Enter" focusable={false} asChild>
              <IconButton
                tabIndex={-1}
                ariaLabel={`Open ${entry.ref}`}
                data-pasted-open
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen();
                }}
                className="ml-auto hidden size-5 shrink-0 place-content-center rounded-full text-text-muted hover:text-text-default group-hover/row:grid"
                icon={<ExternalLink aria-hidden className="size-3" />}
              />
            </HoverTooltip>
          </span>
        );
      case 'where':
        // ONE status per number (`BulkRowView.primary`); plain text here — the cell copies it.
        return <RowVerdict entry={entry} primary={primary} className="w-full" />;
      case 'clock':
        // Ticks off the page's shared minute; the copy and the hover stay `pastedListCellText` / `pastedListCellHint`.
        return <JourneyClockCell clock={facts?.clock} />;
      case 'tracking': {
        const trackings = trackingsOf(row);
        if (trackings.length === 0) return <GridCellDash />;
        return (
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate font-mono text-text-muted">{getLast8(trackings[0])}</span>
            {trackings.length > 1 ? <span className={CELL_MARKER}>+{trackings.length - 1}</span> : null}
          </span>
        );
      }
      case 'scannedOut':
        if (!text) return <GridCellDash />;
        if (facts?.scanSource == null) return <span className="min-w-0 truncate text-text-faint">{text}</span>;
        return (
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 tabular-nums text-text-muted">{formatMonthDayTimePST(facts.shippedAt ?? '')}</span>
            {facts.scanSource === 'backfill' ? (
              <HoverTooltip label="A backdated scan-out stamp, not a live dock scan" focusable={false} asChild>
                <span data-scan-backfill className={CELL_MARKER}>Backfill</span>
              </HoverTooltip>
            ) : null}
          </span>
        );
      case 'scannedOutBy':
        return facts?.scannedOutBy ? <StaffCell staffId={facts.scannedOutBy.id} name={facts.scannedOutBy.name} /> : <GridCellDash />;
      case 'lastEvent': {
        const said = lastCarrierEventText(row);
        if (!said) return <GridCellDash />;
        const failing = facts?.lastPoll?.error ?? null;
        return (
          <span className="flex min-w-0 items-center gap-1">
            <span className={cn('min-w-0 truncate', said === 'Not polled' ? 'text-text-faint' : 'text-text-muted')}>{said}</span>
            {failing ? (
              <HoverTooltip label={`The carrier poll is failing: ${failing}`} focusable={false} asChild>
                <span data-poll-failing className="shrink-0 text-role-micro font-medium text-text-danger">Poll failing</span>
              </HoverTooltip>
            ) : null}
          </span>
        );
      }
      case 'unboxed':
        return facts?.unboxedAt ? (
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 tabular-nums text-text-muted">{formatMonthDayTimePST(facts.unboxedAt)}</span>
            {facts.unboxedBy ? <StaffCell staffId={facts.unboxedBy.id} name={facts.unboxedBy.name} /> : null}
          </span>
        ) : (
          <GridCellDash />
        );
      case 'packer':
        return facts?.packer ? <StaffCell staffId={facts.packer.id} name={facts.packer.name} /> : <GridCellDash />;
      case 'units':
        return facts?.units && text ? <PastedListUnits facts={facts} /> : <GridCellDash />;
      case 'detail': {
        const wait = deliveredWaitDays(row);
        if (wait == null && !entry.detail) return <GridCellDash />;
        return (
          <span className="flex min-w-0 items-baseline gap-1">
            {wait != null ? (
              <span data-pasted-wait={wait} className={cn('shrink-0 font-semibold tabular-nums', waitTone(wait))}>
                {wait}d since delivered
              </span>
            ) : null}
            {entry.detail ? <span className="min-w-0 truncate text-text-muted">{entry.detail}</span> : null}
          </span>
        );
      }
      default:
        return text ? (
          <span
            className={cn(
              'min-w-0 truncate',
              key === 'product' || key === 'item' ? 'text-text-default' : 'text-text-muted',
              (key === 'sku' || key === 'po') && 'font-mono',
            )}
          >
            {text}
          </span>
        ) : (
          <GridCellDash />
        );
    }
  };

  const leaf = (
    <LedgerGridLeafRow<PastedListColumn>
      columns={columns}
      template={pastedListGridTemplate(columns)}
      selected={lit}
      capabilities={PASTED_LIST_CAPABILITIES}
      data-pasted-list-row={position}
      data-range-row={index}
      data-buckets={entry.buckets.join(' ')}
      className="group/row cursor-cell"
      onPointerEnter={onPoint}
      renderCell={(col) => {
        const frozen = col.frozen === true;
        const hint = pastedListCellHint(row, col.key);
        const at = columns.indexOf(col);
        const inRange = range != null && at >= range.c0 && at <= range.c1;
        const edge = inRange ? rangeEdgeShadow(range, at) : undefined;
        return (
          <div
            data-col={col.key}
            data-in-range={inRange || undefined}
            title={hint || undefined}
            className={cn(
              ledgerGridCell({ inset: 'none' }),
              'relative overflow-hidden',
              PASTED_LIST_CELL,
              gridCellAlignClass(col),
              frozen && LEDGER_GRID_FROZEN_CELL,
              'min-w-0 text-role-caption text-text-default',
              (col.key === 'ref' || col.key === 'order') && 'font-mono font-semibold',
              // The staff accent's selection tint (it matches the range's accent outline); the anchor a step stronger.
              // A gradient LAYER, not a background colour: a frozen cell keeps its opaque fill under the tint.
              inRange && 'bg-gradient-to-r',
              inRange && (range.anchorCol === at ? 'from-accent-bg/20 to-accent-bg/20' : 'from-accent-bg/10 to-accent-bg/10'),
            )}
            style={frozen || edge ? { left: frozen ? pastedListFrozenLeft(columns, col.key) : undefined, boxShadow: edge } : undefined}
          >
            {renderValue(col.key)}
            <AnimatePresence>
              {flash?.col === col.key ? (
                <motion.span
                  key={flash.n}
                  aria-hidden
                  data-cell-copied
                  initial={washPresence.initial}
                  animate={washPresence.animate}
                  transition={wash}
                  className="pointer-events-none absolute inset-0 bg-surface-accent"
                />
              ) : null}
            </AnimatePresence>
          </div>
        );
      }}
    />
  );
  return (
    <motion.div
      // Read once, at mount: rows that scroll in later arrive as they are.
      initial={cascade ? presence.initial : false}
      animate={presence.animate}
      transition={{ ...settle, delay: cascade ? Math.min(index, CASCADE_ROWS) * motionDuration.findListRowStagger : 0 }}
    >
      {leaf}
    </motion.div>
  );
});
