'use client';

import { memo, type ReactNode } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateTimeCellValue } from '@/components/ui/grid-cells';
import { LedgerGridLeafRow, gridCellAlignClass } from '@/design-system/components/grid';
import { ledgerGridCell } from '@/design-system/components/grid/grid-cell-chrome';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { ProductThumb } from '@/features/prepack/prepack-ui';
import { QC_LABEL_LIFECYCLE } from '@/design-system/tokens/qc-label-lifecycle';
import { qcLabelHandle, qcLabelStage, qcLabelUsesInternalSerial, type QcLabelRow } from '@/lib/labels/qc-label-row';
import { cn } from '@/utils/_cn';
import { QC_LABELS_GRID_CAPABILITIES } from './qc-labels-grid-descriptor';
import { qcLabelsGridTemplate, type QcLabelsGridColumn } from './qc-labels-grid-layout';

function cellClass(column: QcLabelsGridColumn, rule: boolean): string {
  return cn(ledgerGridCell({ rule, inset: 'grid' }), gridCellAlignClass(column));
}

function copyable(value: string | null, kind: string): ReactNode {
  return value ? (
    <CopyableCellValue
      value={value}
      historyKind={kind}
      className="min-w-0 flex-1 truncate text-role-caption text-text-default"
      dense
    />
  ) : (
    <GridCellDash />
  );
}

export const QcLabelGridRow = memo(function QcLabelGridRow({
  row,
  columns,
  onOpen,
}: {
  row: QcLabelRow;
  columns: readonly QcLabelsGridColumn[];
  onOpen: (row: QcLabelRow) => void;
}) {
  const order = row.order_label ?? (row.order_id != null ? String(row.order_id) : null);
  const label = qcLabelHandle(row);

  return (
    <LedgerGridLeafRow
      {...{ [DESK_RECORD_KEY_ATTR]: String(row.serial_unit_id) }}
      data-testid={`qc-label-row-${row.serial_unit_id}`}
      role="button"
      tabIndex={0}
      aria-label={`Open QC label ${label}, ${row.title}`}
      columns={columns}
      template={qcLabelsGridTemplate(columns)}
      selected={false}
      capabilities={QC_LABELS_GRID_CAPABILITIES}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(row);
        }
      }}
      renderCell={(column, { rule }) => {
        let body: ReactNode;
        switch (column.key) {
          case 'status':
            body = <LifecycleCode state={QC_LABEL_LIFECYCLE[qcLabelStage(row)]} />;
            break;
          case 'label':
            body = copyable(label, 'unit');
            break;
          case 'product':
            body = (
              <span className="flex min-w-0 items-center gap-2">
                <ProductThumb src={row.image_url} title={row.title} className="size-7" />
                <span className="min-w-0 truncate text-role-data text-text-default">{row.title}</span>
              </span>
            );
            break;
          case 'serial':
            body = qcLabelUsesInternalSerial(row.serial_number) ? (
              <span className="min-w-0 truncate text-role-caption text-text-faint">No OEM serial</span>
            ) : copyable(row.serial_number, 'serial');
            break;
          case 'sku':
            body = copyable(row.sku, 'sku');
            break;
          case 'location':
            body = row.location ? <span className="min-w-0 truncate text-role-caption text-text-muted">{row.location}</span> : <GridCellDash />;
            break;
          case 'order':
            body = order ? copyable(order, 'order') : <GridCellDash />;
            break;
          case 'prints':
            body = <span className="tabular-nums text-role-caption text-text-muted">{row.print_count}</span>;
            break;
          case 'last-printed':
            body = <GridDateTimeCellValue raw={row.last_printed_at} className="text-role-caption text-text-soft" />;
            break;
          default:
            body = <GridCellDash />;
        }
        return <div data-col={column.key} className={cellClass(column, rule)}>{body}</div>;
      }}
    />
  );
});
