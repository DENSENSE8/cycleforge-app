'use client';

/**
 * Sheets-class column header context menu — paint, text emphasis, hide, add
 * column (unhide from registry), sort, resize fit/reset, open column details.
 *
 * Mounted by {@link LedgerGridColumnHeader} when `columnMenu` is provided.
 * Prefs go through the same hooks as `GridColumnDetailsPanel` (never a fork).
 * Visibility uses {@link useGridColumnFieldsApi} from the gutter — never a
 * second `useGridFields` call site on a view.
 */

import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/design-system/primitives/ContextMenu';
import {
  GRID_HIGHLIGHT_PRESETS,
  GRID_COLUMN_TEXT_EMPHASIS_OPTS,
  normalizeGridColumnHighlight,
  normalizeGridColumnTextEmphasis,
  type GridColumnCellMode,
  type GridColumnTextEmphasis,
} from '@/design-system/components/grid/grid-column-display';
import { useGridColumnDisplay } from '@/design-system/components/grid/useGridColumnDisplay';
import { useGridColumnWidths } from '@/components/ui/table-column-config/useGridColumnWidths';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useGridColumnFieldsApi,
  useOpenGridColumnDetails,
} from '@/design-system/components/grid/GridColumnDetailsTrigger';

export type LedgerGridColumnMenuApi<C extends LedgerGridColumnModel> = {
  tableId: TableId;
  /** Full canonical model (for Add column = unhide). */
  allColumns: readonly C[];
  activeSort?: string | null;
  sortDir?: GridSortDir | null;
  onSortColumn?: (key: string, dir?: GridSortDir) => void;
  onClearSort?: () => void;
  /** Fit-to-data: measure body cells for this track and commit width. */
  onFitColumn?: (key: string) => void;
};

export function LedgerGridColumnContextMenu<C extends LedgerGridColumnModel>({
  column,
  menu,
  children,
}: {
  column: C;
  menu: LedgerGridColumnMenuApi<C>;
  children: ReactNode;
}) {
  const hideKey = column.hideKey ?? column.key;
  const openDetails = useOpenGridColumnDetails();
  const fieldsApi = useGridColumnFieldsApi();
  const { displayByKey, setHighlight, setCellMode, setTextEmphasis } =
    useGridColumnDisplay(menu.tableId);
  const { setWidth, clearWidth } = useGridColumnWidths(menu.tableId);

  const pref = displayByKey[hideKey];
  const highlight = normalizeGridColumnHighlight(pref?.highlight);
  const textMode =
    normalizeGridColumnTextEmphasis(pref?.text) ?? ('default' as const);
  const cellMode: GridColumnCellMode = pref?.cell ?? 'default';

  const hiddenFields = (fieldsApi?.fields ?? []).filter(
    (f) => !f.visible && f.key !== hideKey,
  );
  const canHide = Boolean(column.hideKey) && !column.frozen;
  const sortable = Boolean(menu.onSortColumn);

  const fitToData = () => {
    if (menu.onFitColumn) {
      menu.onFitColumn(column.key);
      return;
    }
    if (typeof document === 'undefined') return;
    const cells = document.querySelectorAll<HTMLElement>(
      `[data-col="${CSS.escape(column.key)}"]`,
    );
    let max = 0;
    cells.forEach((el) => {
      max = Math.max(max, el.scrollWidth, el.getBoundingClientRect().width);
    });
    if (max > 0) setWidth(column.key, Math.ceil(max + 16));
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent data-testid="ledger-grid-column-menu">
        {sortable ? (
          <>
            <ContextMenuItem
              onSelect={() => menu.onSortColumn?.(column.key, 'asc')}
            >
              Sort ascending
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => menu.onSortColumn?.(column.key, 'desc')}
            >
              Sort descending
            </ContextMenuItem>
            {menu.activeSort === column.key && menu.onClearSort ? (
              <ContextMenuItem onSelect={() => menu.onClearSort?.()}>
                Clear sort
              </ContextMenuItem>
            ) : null}
            <ContextMenuSeparator />
          </>
        ) : null}

        <ContextMenuSub>
          <ContextMenuSubTrigger>Paint column</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={highlight ?? 'none'}
              onValueChange={(v) =>
                setHighlight(hideKey, v === 'none' ? 'none' : v)
              }
            >
              <ContextMenuRadioItem value="none">None</ContextMenuRadioItem>
              {GRID_HIGHLIGHT_PRESETS.map((p) => (
                <ContextMenuRadioItem key={p.hex} value={p.hex}>
                  {p.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Text style</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={textMode}
              onValueChange={(v) =>
                setTextEmphasis(hideKey, v as GridColumnTextEmphasis | 'default')
              }
            >
              {GRID_COLUMN_TEXT_EMPHASIS_OPTS.map((o) => (
                <ContextMenuRadioItem key={o.id} value={o.id}>
                  {o.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Display as</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={cellMode}
              onValueChange={(v) =>
                setCellMode(hideKey, v as GridColumnCellMode)
              }
            >
              <ContextMenuRadioItem value="default">Default</ContextMenuRadioItem>
              <ContextMenuRadioItem value="chip">Chip</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {canHide && fieldsApi ? (
          <ContextMenuItem
            onSelect={() => fieldsApi.setFieldVisible(hideKey, false)}
          >
            Hide column
          </ContextMenuItem>
        ) : null}

        {hiddenFields.length > 0 && fieldsApi ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Add column…</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {hiddenFields.map((f) => (
                <ContextMenuItem
                  key={f.key}
                  onSelect={() => fieldsApi.setFieldVisible(f.key, true)}
                >
                  {f.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={fitToData}>Fit to data</ContextMenuItem>
        <ContextMenuItem onSelect={() => clearWidth(column.key)}>
          Reset width
        </ContextMenuItem>

        {column.hideKey ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => openDetails(hideKey)}>
              Column details…
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
