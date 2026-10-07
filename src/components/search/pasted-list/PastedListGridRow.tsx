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

import { memo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { LedgerGridLeafRow, gridCellAlignClass } from '@/design-system/components/grid';
import { LEDGER_GRID_FROZEN_CELL, ledgerGridCell } from '@/design-system/components/grid/grid-cell-chrome';
import { IconButton } from '@/design-system/primitives';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { ChevronDown, ChevronRight, ExternalLink, Pencil } from '@/components/Icons';
import { StaffCell } from '@/components/identity/StaffCell';
import { GridCellDash } from '@/components/ui/grid-cells';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { formatOrderIdDisplay, getLast8 } from '@/lib/copy-chip-format';
import { RECORD_STATUS_TONE_CLASSES } from '@/lib/status/record-status';
import { RowVerdict } from '@/components/sidebar/contextual/NavBulkRow';
import { PastedListUnits } from './PastedListUnits';
import { JourneyClockCell } from '@/components/outbound/fulfilled/JourneyClockCell';
import {
  PASTED_LIST_CAPABILITIES,
  deliveredWaitDays,
  pastedListCellHint,
  pastedListCellText,
  pastedListFrozenLeft,
  pastedListFrozenRight,
  pastedListGridTemplate,
  pastedTimes,
  lastCarrierEventText,
  recordStatusOf,
  trackingsOf,
  type PastedListColumn,
  type PastedListColumnKey,
  type PastedListRow,
} from './pasted-list-table';

/** A small marker beside a cell's value (×2 pasted, Backfill). */
const CELL_MARKER = 'shrink-0 rounded-sm bg-surface-sunken px-1 text-role-micro font-medium text-text-muted';

/**
 * A sheet cell: 4px side pad, one line, and ONE row height for every row —
 * the staff avatar's (owner 2026-10-07: a row never grows or shrinks with
 * what it holds). All scaled by the sheet's zoom (`--cf-density`).
 */
export const PASTED_LIST_CELL =
  'whitespace-nowrap px-[calc(0.25rem*var(--cf-density,1))] h-[calc(1.5rem*var(--cf-density,1))]';

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

/** A status cell's word — default ink over the tone's whole-cell fill (`RECORD_STATUS_TONE_CLASSES[tone].cell`). */
const STATUS_WORD = 'relative min-w-0 truncate text-role-caption font-semibold text-text-default';

/** Who did a step, and when: the instant (warehouse time) then the staffer — one face for every "… by" column. */
function StaffAt({ staff, at }: { staff: { id: number | null; name: string | null } | null | undefined; at: string | null | undefined }): ReactNode {
  if (!staff) return <GridCellDash />;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {at ? <span className="shrink-0 tabular-nums text-text-muted">{formatMonthDayTimePST(at)}</span> : null}
      <StaffCell staffId={staff.id} name={staff.name} />
    </span>
  );
}

/** A hover verb inside a cell (edit, open), revealed on the row's hover; a press never reaches the cell's copy. */
const CELL_VERB = 'hidden size-5 shrink-0 place-content-center rounded-full text-text-muted hover:text-text-default group-hover/row:grid';

/** In-place edit of one identifier cell (Records Order # / Tracking), on the house inline editor. */
export interface RowCellEdit {
  /** The cell now being edited on this row, or null. */
  key: PastedListColumnKey | null;
  /** The cells this row may edit (empty = none; a stable list). */
  keys: readonly PastedListColumnKey[];
  start: (key: PastedListColumnKey) => void;
  commit: (key: PastedListColumnKey, value: string) => void;
  cancel: () => void;
}

function CellEditor({ initial, label, onCommit, onCancel }: { initial: string; label: string; onCommit: (value: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <InlineEditableValue
      value={draft}
      onChange={setDraft}
      onSubmit={() => onCommit(draft.trim())}
      onCancel={onCancel}
      autoFocus
      monospace
      showEditIcon={false}
      ariaLabel={label}
      className="w-full"
      inputClassName="h-5 text-role-caption"
    />
  );
}

export const PastedListGridRow = memo(function PastedListGridRow({
  row,
  index,
  columns,
  lit,
  range,
  flash,
  onPoint,
  onOpen,
  checked,
  onToggle,
  onExpand,
  edit,
}: {
  row: PastedListRow;
  /** Position in the shown list (the range's row index). */
  index: number;
  columns: readonly PastedListColumn[];
  /** The keyboard cursor. */
  lit: boolean;
  /** The selected cells on this row, or null. */
  range: RowRangeSlice | null;
  /** The cell just copied (a fading wash), `n` restarts it. */
  flash: { col: PastedListColumnKey; n: number } | null;
  onPoint: () => void;
  /** Open the number's record (or the list that holds it). */
  onOpen: () => void;
  /** The row's check in the `select` column; undefined = no check (a member line, or a sheet that selects nothing). */
  checked?: boolean;
  /** Toggle the check; Shift extends from the last toggled row. */
  onToggle?: (event: { shiftKey: boolean }) => void;
  /** A condensed grain's head: open / close its lines in place. */
  onExpand?: () => void;
  /** In-place identifier edit; absent = read-only. */
  edit?: RowCellEdit;
}) {
  const washPresence = useMotionPresence(motionPresence.findCellCopied);
  const wash = useMotionTransition(motionTransition.findCellCopied);
  const { entry, position, primary } = row.view;
  const facts = entry.facts ?? null;
  const times = pastedTimes(row);

  const editVerb = (key: PastedListColumnKey, what: string) =>
    edit?.keys.includes(key) ? (
      <HoverTooltip label={`Edit ${what}`} focusable={false} asChild>
        <IconButton
          tabIndex={-1}
          ariaLabel={`Edit ${what}`}
          data-cell-edit={key}
          onClick={(event) => {
            event.stopPropagation();
            edit.start(key);
          }}
          className={CELL_VERB}
          icon={<Pencil aria-hidden className="size-3" />}
        />
      </HoverTooltip>
    ) : null;

  const renderValue = (key: PastedListColumnKey) => {
    const text = pastedListCellText(row, key);
    if (edit?.key === key) {
      const initial = key === 'order' ? (facts?.orderNumber ?? entry.ref) : (facts?.tracking ?? '');
      return (
        <CellEditor
          initial={initial}
          label={key === 'order' ? `Order number of ${entry.ref}` : `Tracking of ${entry.ref}`}
          onCommit={(value) => edit.commit(key, value)}
          onCancel={edit.cancel}
        />
      );
    }
    switch (key) {
      case 'pos':
        return <span className="tabular-nums text-text-faint">{position}</span>;
      case 'select':
        return checked === undefined ? null : (
          <GridRowCheckbox
            checked={checked}
            onToggle={(event) => onToggle?.(event)}
            label={`Select ${row.group ? `${row.group.lines.length} lines of ` : ''}${entry.ref}`}
            chrome="hover"
          />
        );
      case 'ref':
      case 'order':
        // Fulfilled's / Records' Order wears the last-8 face (identifier law); the copy and the hover stay the full number.
        return (
          <span className={cn('flex min-w-0 flex-1 items-center gap-1', row.member && 'pl-3 font-normal text-text-muted')}>
            {onExpand && row.group ? (
              <HoverTooltip label={row.group.open ? 'Close its lines' : 'Open its lines'} focusable={false} asChild>
                <IconButton
                  tabIndex={-1}
                  ariaLabel={`${row.group.open ? 'Close' : 'Open'} the ${row.group.lines.length} lines of ${entry.ref}`}
                  aria-expanded={row.group.open}
                  data-group-toggle
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpand();
                  }}
                  className="grid size-4 shrink-0 place-content-center text-text-muted hover:text-text-default"
                  icon={row.group.open ? <ChevronDown aria-hidden className="size-3" /> : <ChevronRight aria-hidden className="size-3" />}
                />
              </HoverTooltip>
            ) : null}
            <span className="min-w-0 truncate">{key === 'order' ? formatOrderIdDisplay(entry.ref) : entry.ref}</span>
            {row.group && row.group.lines.length > 1 ? (
              <span data-group-count={row.group.lines.length} className={CELL_MARKER}>
                {row.group.lines.length}
              </span>
            ) : null}
            {times > 1 ? (
              <HoverTooltip label={`Pasted ×${times} — the list keeps one row`} focusable={false} asChild>
                <span data-pasted-times={times} className={CELL_MARKER}>
                  ×{times}
                </span>
              </HoverTooltip>
            ) : null}
            {editVerb(key, 'order number')}
            <HoverTooltip label="Open its record" shortcut="Enter" focusable={false} asChild>
              <IconButton
                tabIndex={-1}
                ariaLabel={`Open ${entry.ref}`}
                data-pasted-open
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen();
                }}
                className={cn('ml-auto', CELL_VERB)}
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
        if (trackings.length === 0) {
          return edit?.keys.includes('tracking') ? (
            <span className="flex min-w-0 flex-1 items-center gap-1">
              <GridCellDash />
              {editVerb('tracking', 'tracking')}
            </span>
          ) : (
            <GridCellDash />
          );
        }
        return (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate font-mono text-text-muted">{getLast8(trackings[0])}</span>
            {trackings.length > 1 ? <span className={CELL_MARKER}>+{trackings.length - 1}</span> : null}
            {editVerb('tracking', 'tracking')}
          </span>
        );
      }
      case 'internal':
      case 'external': {
        const status = recordStatusOf(row, key);
        if (!status) return text ? <span className="min-w-0 truncate text-text-faint">{text}</span> : <GridCellDash />;
        // The tone fills the whole cell; the word stays default ink (operator 2026-10-07).
        return (
          <>
            <span aria-hidden data-status-fill={status.tone} className={cn('pointer-events-none absolute inset-0', RECORD_STATUS_TONE_CLASSES[status.tone].cell)} />
            <span className={STATUS_WORD}>{status.label}</span>
          </>
        );
      }
      case 'pickedBy':
        return <StaffAt staff={facts?.pickedBy} at={facts?.pickedAt} />;
      case 'unboxedBy':
        return <StaffAt staff={facts?.unboxedBy} at={facts?.unboxedAt} />;
      case 'receivedBy':
        return <StaffAt staff={facts?.receivedBy} at={facts?.receivedAt} />;
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
        return <StaffAt staff={facts?.scannedOutBy} at={facts?.shippedAt} />;
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
        return <StaffAt staff={facts?.packer} at={facts?.packedAt} />;
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
      selected={lit || checked === true}
      capabilities={PASTED_LIST_CAPABILITIES}
      data-pasted-list-row={position}
      data-range-row={index}
      data-buckets={entry.buckets.join(' ')}
      className="group/row cursor-cell"
      onPointerEnter={onPoint}
      renderCell={(col) => {
        const frozen = col.frozen === true;
        const frozenEnd = col.frozenEnd === true;
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
              col.key === 'select' ? 'items-stretch p-0' : PASTED_LIST_CELL,
              gridCellAlignClass(col),
              (frozen || frozenEnd) && LEDGER_GRID_FROZEN_CELL,
              'min-w-0 text-role-caption text-text-default',
              (col.key === 'ref' || col.key === 'order') && 'font-mono font-semibold',
            )}
            style={
              frozen || frozenEnd
                ? {
                    left: frozen ? pastedListFrozenLeft(columns, col.key) : undefined,
                    right: frozenEnd ? pastedListFrozenRight(columns, col.key) : undefined,
                  }
                : undefined
            }
          >
            {renderValue(col.key)}
            {inRange ? (
              // The range's tint + outline as an OVERLAY, never the cell's own background: a frozen cell keeps its
              // opaque fill, so a scrolled column never shows through a just-pressed identifier (operator 2026-10-07).
              <span
                aria-hidden
                data-range-tint
                className={cn('pointer-events-none absolute inset-0', range.anchorCol === at ? 'bg-accent-bg/20' : 'bg-accent-bg/10')}
                style={edge ? { boxShadow: edge } : undefined}
              />
            ) : null}
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
  return leaf;
});
