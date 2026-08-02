'use client';

import { Fragment, memo, useCallback, useRef, useState, type ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PoChip, TrackingChip, SerialChip, getLast8 } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass, LedgerCellEditor } from '@/design-system/components/grid';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  DEBOUNCE_MS,
  splitPoContext,
  type PatchBody,
  type QueueRow,
} from '../queue-table/unfound-queue-shared';
import { UNFOUND_GRID_CAPABILITIES } from './unfound-grid-descriptor';
import {
  UNFOUND_GRID_COLUMNS,
  UNFOUND_GRID_FROZEN_CELL,
  unfoundGridCell,
  unfoundGridFrozenLeft,
  unfoundGridRowShellClass,
  unfoundGridTemplate,
  type UnfoundGridColumn,
} from './unfound-grid-layout';

const dataCell = (col: UnfoundGridColumn, rule = true) =>
  cn(unfoundGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

type EditField = 'ticket' | 'usaNote' | 'vietnamNote';

export function unfoundRowKey(row: QueueRow): string {
  return `${row.kind}:${row.source_id}`;
}

/** Product label used for sort + the title cell's primary line. */
export function unfoundRowTitle(row: QueueRow): string {
  if (row.kind === 'email_po') {
    const { prefix } = splitPoContext(row.context);
    return prefix || row.product_title || '';
  }
  return row.product_title || '';
}

interface UnfoundGridRowProps {
  row: QueueRow;
  isSelected: boolean;
  onOpen: (row: QueueRow) => void;
  onPatch: (row: QueueRow, patch: PatchBody) => Promise<void>;
  onPush: (row: QueueRow) => Promise<void>;
  pushing: boolean;
  justSaved: boolean;
  columns?: readonly UnfoundGridColumn[];
}

/**
 * One unfound-queue hit — CSS-grid columns matching {@link UNFOUND_GRID_COLUMNS}.
 *
 * In-cell edit via {@link LedgerCellEditor} (ticket + team notes). Check and
 * Push are row-scoped controls that stopPropagation so they never also open the
 * detail plane. Row click (outside those controls / editors) opens the panel.
 */
export const UnfoundGridRow = memo(function UnfoundGridRow({
  row,
  isSelected,
  onOpen,
  onPatch,
  onPush,
  pushing,
  justSaved,
  columns = UNFOUND_GRID_COLUMNS,
}: UnfoundGridRowProps) {
  const [editing, setEditing] = useState<EditField | null>(null);
  const [editSeed, setEditSeed] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedPatch = useCallback(
    (patch: PatchBody) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void onPatch(row, patch);
      }, DEBOUNCE_MS);
    },
    [onPatch, row],
  );

  const openEditor = (field: EditField, seed: string | null = null) => {
    setEditSeed(seed);
    setEditing(field);
  };
  const closeEditor = () => {
    setEditing(null);
    setEditSeed(null);
  };

  const cellTriggerProps = (field: EditField, opts: { typing?: boolean; label: string }) => ({
    tabIndex: 0 as const,
    'aria-label': opts.label,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openEditor(field);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        openEditor(field);
      } else if (
        opts.typing &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        openEditor(field, e.key);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).blur();
      }
    },
  });

  const renderTitleBody = (): ReactNode => {
    if (row.kind === 'email_po') {
      const { prefix, poNumbers } = splitPoContext(row.context);
      const label = prefix || row.product_title;
      return (
        <>
          {label ? (
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">{label}</span>
          ) : (
            <GridCellDash />
          )}
          {poNumbers.length > 0 ? (
            <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {poNumbers.map((po) => (
                <PoChip key={po} value={po} display={getLast8(po)} />
              ))}
            </span>
          ) : null}
        </>
      );
    }
    return (
      <>
        {row.product_title ? (
          <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
            {row.product_title}
          </span>
        ) : (
          <GridCellDash />
        )}
        {row.serial_numbers ? (
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
            {row.serial_numbers
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((sn) => (
                <SerialChip key={sn} value={sn} width="w-fit max-w-full" dense />
              ))}
          </span>
        ) : null}
        {row.context ? (
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-role-micro font-normal text-text-soft">
            {row.kind === 'unmatched_receiving' ? (
              <TrackingChip value={row.context} display={getLast8(row.context)} />
            ) : (
              <span className="truncate">{row.context}</span>
            )}
          </span>
        ) : null}
      </>
    );
  };

  const renderCell = (col: UnfoundGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              unfoundGridCell({ inset: 'none', rule: true }),
              UNFOUND_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: unfoundGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), UNFOUND_GRID_FROZEN_CELL, 'flex-col items-stretch gap-0')}
            style={{ left: unfoundGridFrozenLeft('title') }}
            data-frozen-edge
          >
            {renderTitleBody()}
          </div>
        );
      case 'ticket': {
        const value = row.zendesk_ticket_id ?? '';
        return (
          <div
            data-col="ticket"
            className={cn(dataCell(col, rule), 'relative', focusRing('cell'))}
            {...cellTriggerProps('ticket', { typing: true, label: 'Edit ticket id' })}
          >
            {value ? (
              <span className="min-w-0 truncate font-mono text-role-caption text-text-default">
                {value}
              </span>
            ) : (
              <GridCellDash />
            )}
            {editing === 'ticket' ? (
              <LedgerCellEditor
                initialValue={value}
                replaceWith={editSeed}
                ariaLabel="Edit ticket id"
                placeholder="—"
                onCommit={(next) => {
                  const trimmed = next.trim() || null;
                  if (trimmed !== (row.zendesk_ticket_id ?? null)) {
                    void onPatch(row, { zendesk_ticket_id: trimmed });
                  }
                }}
                onClose={closeEditor}
              />
            ) : null}
          </div>
        );
      }
      case 'usaNote': {
        const value = row.usa_team_note ?? '';
        return (
          <div
            data-col="usaNote"
            className={cn(dataCell(col, rule), 'relative', focusRing('cell'))}
            {...cellTriggerProps('usaNote', { typing: true, label: 'Edit USA team note' })}
          >
            {value ? (
              <span className="min-w-0 truncate text-role-caption text-text-muted">{value}</span>
            ) : (
              <GridCellDash />
            )}
            {editing === 'usaNote' ? (
              <LedgerCellEditor
                initialValue={value}
                replaceWith={editSeed}
                ariaLabel="Edit USA team note"
                placeholder="—"
                onCommit={(next) => {
                  const trimmed = next.trim() || null;
                  if (trimmed !== (row.usa_team_note ?? null)) {
                    debouncedPatch({ usa_team_note: trimmed });
                  }
                }}
                onClose={closeEditor}
              />
            ) : null}
          </div>
        );
      }
      case 'vietnamNote': {
        const value = row.vietnam_team_note ?? '';
        return (
          <div
            data-col="vietnamNote"
            className={cn(dataCell(col, rule), 'relative', focusRing('cell'))}
            {...cellTriggerProps('vietnamNote', {
              typing: true,
              label: 'Edit Vietnam team note',
            })}
          >
            {value ? (
              <span className="min-w-0 truncate text-role-caption text-text-muted">{value}</span>
            ) : (
              <GridCellDash />
            )}
            {editing === 'vietnamNote' ? (
              <LedgerCellEditor
                initialValue={value}
                replaceWith={editSeed}
                ariaLabel="Edit Vietnam team note"
                placeholder="—"
                onCommit={(next) => {
                  const trimmed = next.trim() || null;
                  if (trimmed !== (row.vietnam_team_note ?? null)) {
                    debouncedPatch({ vietnam_team_note: trimmed });
                  }
                }}
                onClose={closeEditor}
              />
            ) : null}
          </div>
        );
      }
      case 'checked':
        return (
          <div
            data-col="checked"
            className={cn(dataCell(col, rule), 'justify-center gap-1.5')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={row.checked}
              onChange={(e) => void onPatch(row, { checked: e.target.checked })}
              className="h-4 w-4"
              aria-label={row.checked ? 'Mark unchecked' : 'Mark checked'}
            />
            {justSaved ? (
              <span className="text-role-micro uppercase tracking-wider text-emerald-600">
                Saved
              </span>
            ) : null}
          </div>
        );
      case 'action':
        return (
          <div
            data-col="action"
            className={cn(dataCell(col, rule), 'justify-center')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {row.zendesk_ticket_id ? (
              <span className="text-role-micro uppercase tracking-wider text-emerald-600">
                Synced
              </span>
            ) : (
              <HoverTooltip label="Create a support ticket from this row" asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ExternalLink />}
                  onClick={() => void onPush(row)}
                  disabled={pushing}
                  className="gap-1 rounded-md border border-blue-200 px-2 py-1 text-role-micro uppercase tracking-wider text-blue-600 hover:bg-blue-50"
                >
                  {pushing ? '…' : 'Push'}
                </Button>
              </HoverTooltip>
            )}
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-unfound-row-id={unfoundRowKey(row)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Unfound item ${unfoundRowTitle(row) || row.source_id}`}
      onClick={(e) => {
        // Skip inline controls (editors, chips, checkbox, Push) — same rule the
        // hand-rolled row used so copy/edit never also swaps the detail plane.
        const target = e.target as HTMLElement | null;
        if (target?.closest('input, textarea, button, label')) return;
        onOpen(row);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement | null;
          if (target?.closest('input, textarea, button, label')) return;
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        unfoundGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: UNFOUND_GRID_CAPABILITIES,
        }),
        row.checked && 'text-text-soft',
      )}
      style={{ gridTemplateColumns: unfoundGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
