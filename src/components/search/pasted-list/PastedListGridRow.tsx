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

import { memo, useState } from 'react';
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
import { RowVerdict } from '@/components/sidebar/contextual/NavBulkRow';
import { PastedListUnits } from './PastedListUnits';
import {
  PASTED_LIST_CAPABILITIES,
  deliveredWaitDays,
  pastedListCellText,
  pastedListFrozenLeft,
  pastedListGridTemplate,
  pastedTimes,
  type PastedListColumn,
  type PastedListColumnKey,
  type PastedListRow,
} from './pasted-list-table';

/** A sheet cell: 4px side pad and 2px top/bottom at 100%, scaled by the sheet's zoom (`--cf-density`); one line. */
export const PASTED_LIST_CELL =
  'whitespace-nowrap px-[calc(0.25rem*var(--cf-density,1))] py-[calc(0.125rem*var(--cf-density,1))]';

/** Rows past this one arrive together — the cascade never makes the tail wait. */
const CASCADE_ROWS = 14;

/** Dock-to-stock: amber from 2 days delivered and not unboxed, red from 5. */
function waitTone(days: number): string {
  return days >= 5 ? 'text-text-danger' : days >= 2 ? 'text-text-warning' : 'text-text-muted';
}

export const PastedListGridRow = memo(function PastedListGridRow({
  row,
  index,
  columns,
  lit,
  cascade,
  onPoint,
  onOpen,
  onCopy,
}: {
  row: PastedListRow;
  /** Position in the shown list (the cascade step). */
  index: number;
  columns: readonly PastedListColumn[];
  /** The keyboard cursor. */
  lit: boolean;
  /** First paint of the page: rows settle in top → bottom. */
  cascade: boolean;
  onPoint: () => void;
  /** Open the number's record (or the list that holds it). */
  onOpen: () => void;
  /** Copy one cell's text. */
  onCopy: (text: string) => void;
}) {
  const presence = useMotionPresence(motionPresence.findListRow);
  const settle = useMotionTransition(motionTransition.findListRow);
  const washPresence = useMotionPresence(motionPresence.findCellCopied);
  const wash = useMotionTransition(motionTransition.findCellCopied);
  const [copied, setCopied] = useState<{ key: PastedListColumnKey; n: number } | null>(null);
  const { entry, position, primary } = row.view;
  const facts = entry.facts ?? null;
  const times = pastedTimes(row);

  const renderValue = (key: PastedListColumnKey) => {
    const text = pastedListCellText(row, key);
    switch (key) {
      case 'pos':
        return <span className="tabular-nums text-text-faint">{position}</span>;
      case 'ref':
        return (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate">{entry.ref}</span>
            {times > 1 ? (
              <HoverTooltip label={`Pasted ×${times} — the list keeps one row`} focusable={false} asChild>
                <span data-pasted-times={times} className="shrink-0 rounded-sm bg-surface-sunken px-1 text-role-micro font-medium text-text-muted">
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
              key === 'product' ? 'text-text-default' : 'text-text-muted',
              (key === 'sku' || key === 'tracking' || key === 'po') && 'font-mono',
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
      data-buckets={entry.buckets.join(' ')}
      className="group/row cursor-cell"
      onPointerEnter={onPoint}
      renderCell={(col) => {
        const frozen = col.frozen === true;
        const text = pastedListCellText(row, col.key);
        return (
          <div
            data-col={col.key}
            title={text || undefined}
            onClick={() => {
              if (!text) return;
              onCopy(text);
              setCopied((last) => ({ key: col.key, n: (last?.n ?? 0) + 1 }));
            }}
            className={cn(
              ledgerGridCell({ inset: 'none' }),
              'relative overflow-hidden',
              PASTED_LIST_CELL,
              gridCellAlignClass(col),
              frozen && LEDGER_GRID_FROZEN_CELL,
              'min-w-0 text-role-caption text-text-default',
              col.key === 'ref' && 'font-mono font-semibold',
            )}
            style={frozen ? { left: pastedListFrozenLeft(columns, col.key) } : undefined}
          >
            {renderValue(col.key)}
            <AnimatePresence>
              {copied?.key === col.key ? (
                <motion.span
                  key={copied.n}
                  aria-hidden
                  data-cell-copied
                  initial={washPresence.initial}
                  animate={washPresence.animate}
                  transition={wash}
                  onAnimationComplete={() => setCopied((last) => (last?.n === copied.n ? null : last))}
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
