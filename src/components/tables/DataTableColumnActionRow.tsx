'use client';

/**
 * Icon-only bulk action row that shares the LedgerGrid column template.
 *
 * Select rows with the left gutter, then commit from the icon sitting under
 * the same track (download under Image, copy under Order, …). Not a second
 * toolbar and not the status-bar pill cluster.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  LEDGER_GRID_FROZEN_CELL,
  ledgerGridCell,
  ledgerGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import {
  isGridColumnFillTrack,
  isGridColumnFlushTrack,
} from '@/design-system/components/grid/grid-column-editability';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { useSelectionStatusBarHotkeys } from '@/hooks/useSelectionStatusBarHotkeys';
import type { TableStatusSelectionAction } from '@/components/tables/TableStatusBar';
import { ColumnStaffAssignControl } from '@/components/tables/ColumnStaffAssignControl';
import { columnKeyForSelectionAction } from '@/lib/tables/column-action-slots';
import { cn } from '@/utils/_cn';

export type ColumnActionCopySource = {
  orderIds: string[];
  trackingNumbers: string[];
  onCopyOrderIds: () => void;
  onCopyTracking: () => void;
  onCopyAll: () => void;
};

export function DataTableColumnActionRow<C extends LedgerGridColumnModel & { fieldId?: string }>({
  columns,
  actions,
  copySource,
  selectedLabel,
  shownLabel,
}: {
  columns: readonly C[];
  actions: readonly TableStatusSelectionAction[];
  copySource: ColumnActionCopySource | null;
  selectedLabel: string | null;
  shownLabel: string | null;
}) {
  const { showHotkeys } = useSelectionStatusBarHotkeys(actions, actions.length > 0);
  const template = gridTemplate(columns);
  const byColumn = new Map<string, TableStatusSelectionAction[]>();
  for (const action of actions) {
    const key = columnKeyForSelectionAction(action.key, columns);
    if (!key) continue;
    const list = byColumn.get(key);
    if (list) list.push(action);
    else byColumn.set(key, [action]);
  }

  return (
    <div
      role="row"
      aria-label="Selection actions"
      data-testid="data-table-column-actions"
      className={cn(
        PRIMARY_CHROME_ROW_FACE,
        ledgerGridRowShellClass(false, { scrollMinContent: true }),
        'border-t border-border-hairline bg-surface-card',
      )}
      style={{ gridTemplateColumns: template }}
    >
      {columns.map((column) => {
        const flush = isGridColumnFlushTrack(column);
        const fill = isGridColumnFillTrack(column);
        const frozen = Boolean(column.frozen);
        const cellActions = byColumn.get(column.key) ?? [];
        return (
          <div
            key={column.key}
            role="gridcell"
            data-col={column.key}
            className={cn(
              ledgerGridCell({
                inset: flush ? 'none' : 'grid',
                rule: !fill,
              }),
              'flex items-center',
              flush ? 'justify-center' : 'justify-start gap-0.5',
              fill && 'justify-end',
              frozen && LEDGER_GRID_FROZEN_CELL,
            )}
            style={frozen ? { left: gridFrozenLeft(columns, column.key) } : undefined}
          >
            {fill ? (
              <span className="truncate px-2 text-role-micro text-text-soft">
                {selectedLabel ? (
                  <span className="font-semibold tabular-nums text-text-default">
                    {selectedLabel}
                  </span>
                ) : null}
                {selectedLabel && shownLabel ? ' · ' : null}
                {shownLabel ? <span className="tabular-nums">{shownLabel}</span> : null}
              </span>
            ) : (
              cellActions.map((action) =>
                action.key === 'assign-pick' || action.key === 'assign-pack' ? (
                  <ColumnStaffAssignControl
                    key={action.key}
                    lane={action.key === 'assign-pick' ? 'pick' : 'pack'}
                    label={action.label}
                    hotkey={action.hotkey}
                    showHotkey={showHotkeys}
                  />
                ) : action.key === 'copy' && copySource ? (
                  <CopyActionDropdown
                    key={action.key}
                    action={action}
                    copySource={copySource}
                    showHotkey={showHotkeys}
                  />
                ) : (
                  <ColumnActionIcon
                    key={action.key}
                    action={action}
                    showHotkey={showHotkeys}
                  />
                ),
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function HotkeyGlyph({ letter }: { letter: string }) {
  return (
    <KeyboardKey
      aria-hidden
      size="sm"
      data-testid="data-table-selection-hotkey-cap"
      className="pointer-events-none absolute right-1.5 top-1/2 z-raised -translate-y-1/2"
    >
      {letter}
    </KeyboardKey>
  );
}

function ColumnActionIcon({
  action,
  showHotkey,
}: {
  action: TableStatusSelectionAction;
  showHotkey: boolean;
}) {
  const hotkey = action.hotkey?.trim().toLowerCase();
  const showGlyph = Boolean(showHotkey && hotkey && hotkey.length === 1);
  const aria = hotkey
    ? `${action.label} (press ${hotkey.toUpperCase()})`
    : action.label;
  return (
    <span
      className="relative inline-flex shrink-0"
      data-testid="data-table-selection-action-wrap"
    >
      <IconButton
        type="button"
        size="md"
        tone="neutral"
        icon={action.icon ?? <span />}
        ariaLabel={aria}
        title={action.label}
        aria-keyshortcuts={hotkey ? hotkey.toUpperCase() : undefined}
        data-testid={`data-table-selection-action-${action.key}`}
        onClick={action.onClick}
        className="hover:bg-surface-hover"
      />
      {showGlyph && hotkey ? <HotkeyGlyph letter={hotkey} /> : null}
    </span>
  );
}

function CopyActionDropdown({
  action,
  copySource,
  showHotkey,
}: {
  action: TableStatusSelectionAction;
  copySource: ColumnActionCopySource;
  showHotkey: boolean;
}) {
  const hotkey = action.hotkey?.trim().toLowerCase();
  const showGlyph = Boolean(showHotkey && hotkey && hotkey.length === 1);
  return (
    <span
      className="relative inline-flex shrink-0"
      data-testid="data-table-selection-action-wrap"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            type="button"
            size="md"
            tone="neutral"
            icon={action.icon ?? <span />}
            ariaLabel={action.label}
            title={action.label}
            aria-keyshortcuts={hotkey ? hotkey.toUpperCase() : undefined}
            data-testid={`data-table-selection-action-${action.key}`}
            className="hover:bg-surface-hover"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuItem
            disabled={copySource.orderIds.length === 0}
            onSelect={copySource.onCopyOrderIds}
          >
            Copy order ID
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={copySource.trackingNumbers.length === 0}
            onSelect={copySource.onCopyTracking}
          >
            Copy tracking number
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copySource.onCopyAll}>Copy all</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {showGlyph && hotkey ? <HotkeyGlyph letter={hotkey} /> : null}
    </span>
  );
}
