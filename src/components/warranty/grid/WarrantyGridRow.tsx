'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { CopyableCellValue, OrderIdChip, SerialChip, getLast8 } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateTimeCellValue } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { WarrantyClockChip, WarrantyStatusBadge } from '@/components/warranty/chips';
import { WarrantyTicketButton } from '@/components/warranty/WarrantyTicketPopover';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import { cn } from '@/utils/_cn';
import { WARRANTY_GRID_CAPABILITIES } from './warranty-grid-descriptor';
import {
  WARRANTY_GRID_COLUMNS,
  WARRANTY_GRID_FROZEN_CELL,
  warrantyGridCell,
  warrantyGridFrozenLeft,
  warrantyGridRowShellClass,
  warrantyGridTemplate,
  type WarrantyGridColumn,
} from './warranty-grid-layout';

const dataCell = (col: WarrantyGridColumn, rule = true) =>
  cn(warrantyGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/** The item a claim is about — title, else the SKU, else the serial. */
export function warrantyClaimItemLabel(claim: WarrantyClaimListRow): string | null {
  return claim.productTitle || claim.sku || claim.serialNumber || null;
}

/**
 * One warranty claim — CSS-grid columns matching {@link WARRANTY_GRID_COLUMNS}.
 *
 * Read-only: no inline editor and no fold. The row opens the claim at the
 * RECORD plane (`?open=`); the only row-scoped control is the ticket link,
 * which stops propagation so linking a ticket never also swaps the detail panel
 * out from under the operator.
 */
export const WarrantyGridRow = memo(function WarrantyGridRow({
  claim,
  isSelected,
  onOpenClaim,
  columns = WARRANTY_GRID_COLUMNS,
}: {
  claim: WarrantyClaimListRow;
  isSelected: boolean;
  onOpenClaim: (id: number) => void;
  columns?: readonly WarrantyGridColumn[];
}) {
  const itemLabel = warrantyClaimItemLabel(claim);

  const renderCell = (col: WarrantyGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              warrantyGridCell({ inset: 'none', rule: true }),
              WARRANTY_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: warrantyGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), WARRANTY_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: warrantyGridFrozenLeft('title') }}
            data-frozen-edge
          >
            {itemLabel ? (
              <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
                {itemLabel}
              </span>
            ) : (
              <GridCellDash />
            )}
            {claim.sku && claim.productTitle ? (
              <CopyableCellValue
                value={claim.sku}
                historyKind="sku"
                className="min-w-0 shrink truncate font-mono text-role-eyebrow uppercase tracking-widest text-text-faint"
                dense
              />
            ) : null}
          </div>
        );
      case 'claim':
        return (
          <div data-col="claim" className={dataCell(col, rule)}>
            <OrderIdChip
              value={claim.claimNumber}
              display={getLast8(claim.claimNumber)}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </div>
        );
      case 'serial':
        return (
          <div data-col="serial" className={dataCell(col, rule)}>
            {claim.serialNumber ? (
              <SerialChip value={claim.serialNumber} width="w-fit max-w-full" />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'customer':
        return (
          <div data-col="customer" className={dataCell(col, rule)}>
            {claim.customerName ? (
              <span className="min-w-0 truncate text-role-caption text-text-muted">
                {claim.customerName}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'status':
        return (
          <div data-col="status" className={dataCell(col, rule)}>
            <WarrantyStatusBadge status={claim.status} />
          </div>
        );
      case 'warranty':
        return (
          <div data-col="warranty" className={dataCell(col, rule)}>
            <WarrantyClockChip daysRemaining={claim.daysRemaining} basis={claim.clockBasis} />
          </div>
        );
      case 'logged':
        return (
          <div data-col="logged" className={dataCell(col, rule)}>
            <GridDateTimeCellValue raw={claim.createdAt} className="text-role-caption text-text-faint" />
          </div>
        );
      case 'ticket':
        return (
          <div
            data-col="ticket"
            className={cn(dataCell(col, rule), 'justify-center')}
            // Row-scoped action: the click must not also toggle the record
            // plane. Keyboard too — Enter inside the popover trigger would
            // otherwise bubble to the row's own Enter handler.
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <WarrantyTicketButton claimId={claim.id} linked={claim.zendeskTicketId != null} />
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-warranty-row-id={claim.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Warranty claim ${claim.claimNumber}`}
      onClick={() => onOpenClaim(claim.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenClaim(claim.id);
        }
      }}
      className={cn(
        warrantyGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: WARRANTY_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: warrantyGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
