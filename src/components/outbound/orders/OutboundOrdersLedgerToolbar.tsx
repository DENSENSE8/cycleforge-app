'use client';

/**
 * The ledger's TABLE toolbar — table-level controls only (operator 2026-09-26):
 * select-all at the leading edge; page size, platforms, row size, density
 * and fullscreen right-aligned. Search, sort, filters, saved views and
 * exception category are view-level and live in the contextual sidebar, never
 * here (sort moved 2026-09-27).
 */

import { useState } from 'react';
import { DataTablePageSizeMenu } from '@/components/tables/DataTable';
import { DeskRecordViewSwitch } from '@/design-system/components/DeskRecordViewSwitch';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { CatalogManagerPopover } from '@/components/receiving/workspace/line-edit/CatalogManagerPopover';
import { useTableSelectionTotal } from '@/hooks/useTableSelection';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  SLOT_TABLE_PAGE_SIZES,
  isSlotTablePageSize,
  writeSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useViewDensity } from './useViewDensity';
import type { OrderListViewKey } from '@/lib/views/view-specs';
import {
  LEDGER_HIT_CLASS,
  LEDGER_NESTED_HIT_CLASS,
  LEDGER_TOOLBAR_CLASS,
  LEDGER_ZOOM_LABEL,
} from './outbound-orders-ledger-geometry';

/** One flush industrial cell on the toolbar row (zoom rung, density step). */
const LEDGER_TOOL_CELL_CLASS = cn(
  'ds-raw-button inline-flex w-8 items-center justify-center border-r border-mode-edge',
  LEDGER_HIT_CLASS,
  RECORD_LABEL_CLASS,
  focusRing('cell'),
);

export function OutboundOrdersLedgerToolbar({
  viewKey,
  selectedCount,
  pageSize,
  onPageSizeChange,
}: {
  /** The list view — its spec bounds the row sizes offered. */
  viewKey: OrderListViewKey;
  /** Rows ticked in the orders selection scope. */
  selectedCount: number;
  pageSize: SlotTablePageSize;
  onPageSizeChange: (size: SlotTablePageSize) => void;
}) {
  const { density: zoom, allowed: zooms, setDensity: setZoom } = useViewDensity(viewKey);
  const selectionTotal = useTableSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE);
  const allSelected = selectionTotal > 0 && selectedCount >= selectionTotal;
  // "Edit platforms" — the same catalog manager Unbox's platform pill opens, so
  // the short label the band paints (`AMZRN`) is edited where it is read.
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const zoomIndex = zooms.indexOf(zoom);

  return (
    <>
      <div
        data-testid="data-table-toolbar"
        className={cn(LEDGER_TOOLBAR_CLASS, LEDGER_NESTED_HIT_CLASS)}
      >
        <GridRowCheckbox
          checked={allSelected ? true : selectedCount > 0 ? 'mixed' : false}
          onToggle={() =>
            emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, allSelected ? 'none' : 'all')
          }
          label={allSelected ? 'Clear selection' : 'Select all orders on this page'}
          className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
        />
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          <DataTablePageSizeMenu
            pageSize={pageSize}
            pageSizes={SLOT_TABLE_PAGE_SIZES}
            onPageSizeChange={(size) => {
              if (!isSlotTablePageSize(size)) return;
              writeSlotTablePageSize(size);
              onPageSizeChange(size);
            }}
          />
        </span>
        <span className="inline-flex shrink-0 items-stretch self-stretch">
          {/* ds-raw-button: flush industrial toolbar cell on the ledger's hit row — no Button shape paints edge-to-edge. */}
          <button
            type="button"
            data-testid="ledger-edit-platforms"
            aria-haspopup="dialog"
            onClick={() => setPlatformsOpen(true)}
            className={cn(
              'ds-raw-button inline-flex items-center border-l border-mode-edge px-3',
              LEDGER_HIT_CLASS,
              RECORD_LABEL_CLASS,
              focusRing('cell'),
              'text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
            )}
          >
            Edit platforms
          </button>
          <div role="group" aria-label="Row size" className="inline-flex items-stretch border-l border-mode-edge">
            {zooms.map((step) => (
              <button
                key={step}
                type="button"
                aria-pressed={zoom === step}
                aria-label={LEDGER_ZOOM_LABEL[step]}
                data-testid={`ledger-zoom-${step}`}
                onClick={() => setZoom(step)}
                className={cn(
                  LEDGER_TOOL_CELL_CLASS,
                  zoom === step ? 'bg-mode-ink text-mode-bar' : 'text-mode-muted hover:bg-mode-hover',
                )}
              >
                {step}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Adjust row density" className="inline-flex items-stretch border-l border-mode-edge">
            <button
              type="button"
              data-testid="ledger-density-decrease"
              aria-label="Decrease row density"
              disabled={zoomIndex <= 0}
              onClick={() => {
                if (zoomIndex > 0) setZoom(zooms[zoomIndex - 1]!);
              }}
              className={cn(
                LEDGER_TOOL_CELL_CLASS,
                'text-mode-muted hover:bg-mode-hover disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              −
            </button>
            <button
              type="button"
              data-testid="ledger-density-increase"
              aria-label="Increase row density"
              disabled={zoomIndex >= zooms.length - 1}
              onClick={() => {
                if (zoomIndex < zooms.length - 1) setZoom(zooms[zoomIndex + 1]!);
              }}
              className={cn(
                LEDGER_TOOL_CELL_CLASS,
                'text-mode-muted hover:bg-mode-hover disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              +
            </button>
          </div>
          <DeskRecordViewSwitch labels="wide" />
        </span>
      </div>
      <CatalogManagerPopover open={platformsOpen} kind="platform" onClose={() => setPlatformsOpen(false)} />
    </>
  );
}
