'use client';

/**
 * One CSV staging row — the parsed record's REAL details in the data table,
 * with its triage state in the `status` column.
 *
 * **Sheets-style in-cell edit.** Every mapped canonical field edits in place via
 * {@link LedgerCellEditor} (click / Enter / F2 opens; a printable char replaces;
 * Escape blurs) — the Unfound recipe, so the whole app has one editing grammar.
 * A commit writes back through the mapping and the row's triage state is derived
 * on read, so fixing the missing value flips Ready / Action required in front of
 * the operator with no extra plumbing.
 *
 * The frozen `order` track mounts an editor too: `order_number` is this
 * surface's most common Action-required cause, and the house identity floor is
 * `select` + `title` only (`GRID_IDENTITY_COLUMN_KEYS` — frozen ≠ identity).
 *
 * A field with **no mapped source column has nowhere to write**, so its cell
 * stays read-only rather than pretending to accept a value; the fix is the
 * rail's Map columns leaf, and the reason is visible in `status`.
 *
 * Click (outside an editor) opens the row on the rail's Row leaf; the gutter
 * check toggles bulk membership. A missing mapped field paints its own cell
 * rose, so the operator sees *which* value is the reason without opening it.
 */

import { memo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash, GridPlatformMarkValue, GridStatusCellValue } from '@/components/ui/grid-cells';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  LedgerCellEditor,
  LedgerGridLeafRow,
  gridCellAlignClass,
} from '@/design-system/components/grid';
import {
  CSV_ORDER_CANONICAL_FIELDS,
  type CsvOrderCanonicalKey,
} from '@/lib/orders/csv-order-import';
import {
  ORDER_IMPORT_DESCRIPTOR,
  type OrderImportRowView,
} from '@/lib/orders/order-import-descriptor';
import { updateTableImportRow } from '@/lib/tables/import/staging-store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { CSV_IMPORT_STAGING_GRID_CAPABILITIES } from './csv-import-staging-grid-descriptor';
import {
  CSV_IMPORT_STAGING_GRID_COLUMNS,
  CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  csvImportStagingGridCell,
  csvImportStagingGridFrozenLeft,
  csvImportStagingGridTemplate,
  isCsvImportStagingGridFrozen,
  type CsvImportStagingGridColumn,
  type CsvImportStagingGridColumnKey,
} from './csv-import-staging-grid-layout';

/** Stable row key — the draft index is the row's identity in a session draft. */
export function csvImportStagingRowKey(row: OrderImportRowView): string {
  return `staging:${row.index}`;
}

const FIELD_LABEL = new Map(
  CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, f.label] as const),
);

/**
 * Grid track → canonical field. The `select` gutter and the derived `status`
 * track deliberately have no entry: a triage state is COMPUTED from the record,
 * so an editor on it would let an operator assert a readiness the row does not
 * have.
 */
const EDITABLE_FIELD_BY_COLUMN: Partial<
  Record<CsvImportStagingGridColumnKey, CsvOrderCanonicalKey>
> = {
  order: 'order_number',
  sku: 'sku',
  qty: 'quantity',
  customer: 'customer_name',
  tracking: 'tracking_number',
  platform: 'platform',
};

/** "Missing: Order number, SKU" — the reason Confirm would skip this row. */
function csvImportStagingMissingLabel(row: OrderImportRowView): string | null {
  if (row.missing.length === 0) return null;
  return `Missing: ${row.missing.map((k) => FIELD_LABEL.get(k) ?? k).join(', ')}`;
}

/** Rose wash for the one cell whose value is why the row cannot be imported. */
const MISSING_CELL_CLASS = 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';

interface CsvImportStagingGridRowProps {
  row: OrderImportRowView;
  /** Current column mapping — decides which cells have somewhere to write. */
  mapping: Record<string, string>;
  /** Bulk membership — what Confirm acts on. */
  checked: boolean;
  /** Open on the record plane (right rail). */
  focused: boolean;
  onToggle: (index: number) => void;
  onOpen: (index: number) => void;
  columns?: readonly CsvImportStagingGridColumn[];
}

export const CsvImportStagingGridRow = memo(function CsvImportStagingGridRow({
  row,
  mapping,
  checked,
  focused,
  onToggle,
  onOpen,
  columns = CSV_IMPORT_STAGING_GRID_COLUMNS,
}: CsvImportStagingGridRowProps) {
  const missingLabel = csvImportStagingMissingLabel(row);
  const [editing, setEditing] = useState<CsvImportStagingGridColumnKey | null>(null);
  const [editSeed, setEditSeed] = useState<string | null>(null);

  const openEditor = (key: CsvImportStagingGridColumnKey, seed: string | null = null) => {
    setEditSeed(seed);
    setEditing(key);
  };
  const closeEditor = () => {
    setEditing(null);
    setEditSeed(null);
  };

  /** Sheets keys on the CELL — stopPropagation so the row click never also fires. */
  const cellTriggerProps = (key: CsvImportStagingGridColumnKey, label: string) => ({
    tabIndex: 0 as const,
    role: 'button' as const,
    'aria-label': label,
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      openEditor(key);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        openEditor(key);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        openEditor(key, e.key);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).blur();
      }
    },
  });

  const cellValue = (key: CsvImportStagingGridColumnKey): string => {
    switch (key) {
      case 'order':
        return row.orderNumber;
      case 'sku':
        return row.sku;
      case 'qty':
        return row.quantity;
      case 'customer':
        return row.customerName;
      case 'tracking':
        return row.trackingNumber;
      case 'platform':
        return row.platform;
      default:
        return '';
    }
  };

  const renderValue = (key: CsvImportStagingGridColumnKey) => {
    switch (key) {
      case 'order':
        return row.orderNumber ? (
          <CopyableCellValue value={row.orderNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'status':
        return (
          <GridStatusCellValue
            label={row.status === 'ready' ? 'Ready' : 'Action required'}
            toneClass={
              row.status === 'ready'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800'
            }
            dotClass={row.status === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'}
            tooltip={missingLabel}
          />
        );
      case 'sku':
        return row.sku ? <CopyableCellValue value={row.sku} dense /> : <GridCellDash />;
      case 'qty':
        return row.quantity ? (
          <span className="truncate tabular-nums">{row.quantity}</span>
        ) : (
          <GridCellDash />
        );
      case 'customer':
        return row.customerName ? (
          <span className="truncate">{row.customerName}</span>
        ) : (
          <GridCellDash />
        );
      case 'tracking':
        return row.trackingNumber ? (
          <CopyableCellValue value={row.trackingNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'platform': {
        const platform = sourcePlatformMeta(row.platform);
        return platform.value || row.platform ? (
          <GridPlatformMarkValue
            platformValue={platform.value || null}
            label={platform.label || row.platform}
            meta={platform.value ? platform : undefined}
          />
        ) : (
          <GridCellDash />
        );
      }
      default:
        return null;
    }
  };

  return (
    <LedgerGridLeafRow<CsvImportStagingGridColumn>
      columns={columns}
      template={csvImportStagingGridTemplate(columns)}
      selected={focused}
      capabilities={CSV_IMPORT_STAGING_GRID_CAPABILITIES}
      // No `role="row"`: LedgerGrid body rows sit outside the header rowgroup,
      // so the role would be orphaned (`grid-aria-roles.guard.test.ts`). The
      // gutter checkbox, the editable cells and the rail are the keyboard-
      // reachable controls.
      data-staging-row={row.index}
      data-staging-status={row.status}
      className="cursor-pointer"
      onClick={() => onOpen(row.index)}
      renderCell={(col, { rule }) => {
        if (col.key === 'select') {
          return (
            <div
              className={cn(
                csvImportStagingGridCell({ inset: 'none', rule }),
                isCsvImportStagingGridFrozen(col.key) && CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
                'justify-center',
              )}
              style={{ left: csvImportStagingGridFrozenLeft('select') }}
            >
              <GridRowCheckbox
                checked={checked}
                onToggle={() => onToggle(row.index)}
                label={`Select staging row ${row.index + 1}`}
              />
            </div>
          );
        }

        const key = col.key;
        const frozen = isCsvImportStagingGridFrozen(key);
        const missing =
          (key === 'order' && row.missing.includes('order_number')) ||
          (key === 'sku' && row.missing.includes('sku'));

        const field = EDITABLE_FIELD_BY_COLUMN[key];
        // No mapped source header ⇒ no destination for the value.
        const editable = Boolean(field && mapping[field]);
        const fieldLabel = field ? (FIELD_LABEL.get(field) ?? key) : key;
        const editLabel = `Edit ${fieldLabel.toLowerCase()} for staging row ${row.index + 1}`;

        return (
          <div
            className={cn(
              csvImportStagingGridCell({ inset: 'grid', rule }),
              gridCellAlignClass(col),
              frozen && CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
              'text-role-caption text-text-default',
              // The editor is `absolute inset-0`; a frozen cell is already
              // `sticky` (its own containing block), a scrolling one is not.
              editable && !frozen && 'relative',
              editable && focusRing('cell'),
              missing && MISSING_CELL_CLASS,
            )}
            style={frozen ? { left: csvImportStagingGridFrozenLeft(key) } : undefined}
            {...(editable ? cellTriggerProps(key, editLabel) : {})}
          >
            {renderValue(key)}
            {editable && editing === key ? (
              <LedgerCellEditor
                variant={key === 'qty' ? 'number' : 'text'}
                initialValue={cellValue(key)}
                replaceWith={editSeed}
                ariaLabel={editLabel}
                placeholder="—"
                onCommit={(next) => {
                  if (!field) return;
                  updateTableImportRow(ORDER_IMPORT_DESCRIPTOR, row.index, {
                    [field]: next,
                  });
                }}
                onClose={closeEditor}
              />
            ) : null}
          </div>
        );
      }}
    />
  );
});
