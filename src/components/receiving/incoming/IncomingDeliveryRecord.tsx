'use client';

import { ChevronDown, ChevronRight } from '@/components/Icons';
import { ReceivingRecordItem, ReceivingRecordPlatform } from '@/components/receiving/ReceivingRecordIdentity';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { Button } from '@/design-system/primitives';
import {
  IndustrialRecord,
  RecordIdFact,
  RecordNext,
  RecordPhoto,
  RecordQty,
  RecordStamp,
  RecordStateCode,
  RecordTitle,
} from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_LABEL_CLASS, type RecordStateFace } from '@/design-system/tokens/industrial-record';
import { resolveInboundDeliveryRecordState } from '@/design-system/tokens/inbound-delivery';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { RowGroup } from '@/lib/group-rows';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { cn } from '@/utils/_cn';

export type IncomingLedgerEntry =
  | { kind: 'group'; key: string; date: string; group: RowGroup<ReceivingLineRow> }
  | { kind: 'line'; key: string; date: string; groupKey: string; row: ReceivingLineRow; grouped: boolean };

const DELIVERY_RISK: Record<string, number> = {
  WRONG_DESTINATION: 100,
  TRACKING_UNAVAILABLE: 95,
  CARRIER_MISMATCH: 90,
  DELIVERED_UNOPENED: 85,
  DELIVERED_NOT_UNBOXED: 80,
  STALLED: 70,
  ARRIVING_TODAY: 60,
  AWAITING_TRACKING: 50,
  PENDING_CARRIER: 40,
  IN_TRANSIT: 30,
  UNKNOWN: 20,
  RECEIVED: 10,
};

export function incomingDeliveryRecordState(row: ReceivingLineRow): RecordStateFace {
  return resolveInboundDeliveryRecordState(row.delivery_state);
}

function groupState(rows: readonly ReceivingLineRow[]): RecordStateFace {
  const worst = [...rows].sort(
    (a, b) => (DELIVERY_RISK[b.delivery_state ?? 'UNKNOWN'] ?? 0) - (DELIVERY_RISK[a.delivery_state ?? 'UNKNOWN'] ?? 0),
  )[0];
  return incomingDeliveryRecordState(worst ?? rows[0]!);
}

function purchaseIdentity(row: ReceivingLineRow): string {
  return row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || row.source_order_id || `Line ${row.id}`;
}

function sourceFace(row: ReceivingLineRow): string {
  return (row.inbound_source_type || row.source_platform || 'unknown').trim().toUpperCase();
}

export function incomingDeliveryNextAction(state: string | null | undefined): string {
  switch (state) {
    case 'AWAITING_TRACKING': return 'Attach tracking';
    case 'DELIVERED_UNOPENED': return 'Receive';
    case 'DELIVERED_NOT_UNBOXED': return 'Unbox';
    case 'WRONG_DESTINATION': return 'Investigate';
    case 'TRACKING_UNAVAILABLE':
    case 'CARRIER_MISMATCH':
    case 'STALLED': return 'Resolve';
    case 'RECEIVED': return 'History';
    default: return 'Monitor';
  }
}

function quantity(row: ReceivingLineRow): number {
  return Number(row.quantity_expected ?? row.quantity_received ?? 0);
}

function expectedStamp(row: ReceivingLineRow): string {
  return fmtDate(row.expected_delivery_date || row.po_date || row.created_at, 'MMM d');
}

interface IncomingDeliveryRecordProps {
  entry: IncomingLedgerEntry;
  open: boolean;
  folded: boolean;
  selectedIds: Set<number>;
  onOpen: (key: string) => void;
  onToggleFold: (key: string) => void;
  onToggleRow: (row: ReceivingLineRow) => void;
}

export function IncomingDeliveryRecord({
  entry,
  open,
  folded,
  selectedIds,
  onOpen,
  onToggleFold,
  onToggleRow,
}: IncomingDeliveryRecordProps) {
  if (entry.kind === 'group') {
    const first = entry.group.rows[0]!;
    const checkedCount = entry.group.rows.filter((row) => selectedIds.has(row.id)).length;
    const checked = checkedCount === 0 ? false : checkedCount === entry.group.rows.length ? true : 'mixed';
    const qty = entry.group.rows.reduce((sum, row) => sum + quantity(row), 0);
    const state = groupState(entry.group.rows);
    const title = `${entry.group.rows.length} items · ${first.vendor_name || sourceFace(first)}`;
    return (
      <IndustrialRecord
        state={state}
        open={open}
        openLabel={`Open purchase ${purchaseIdentity(first)}`}
        onOpen={() => onOpen(entry.key)}
        photo={<RecordPhoto src={first.image_url} fallback={title} />}
        recordKey={entry.key}
        bands={[
          {
            main: (
              <>
                <span className="pointer-events-auto inline-flex h-full items-center gap-1">
                  <GridRowCheckbox
                    checked={checked}
                    label={`Select all lines in ${purchaseIdentity(first)}`}
                    onToggle={() => {
                      const turnOn = checked !== true;
                      for (const row of entry.group.rows) {
                        if (selectedIds.has(row.id) !== turnOn) onToggleRow(row);
                      }
                    }}
                    chrome="always"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    ariaLabel={folded ? 'Expand purchase order' : 'Collapse purchase order'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFold(entry.key);
                    }}
                  >
                    {folded ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
                  </Button>
                </span>
                <RecordStateCode state={state} />
                <ReceivingRecordPlatform row={first} />
                <RecordIdFact label="PO" value={purchaseIdentity(first)} />
              </>
            ),
            right: <RecordStamp>{expectedStamp(first)}</RecordStamp>,
          },
          { main: <RecordTitle>{title}</RecordTitle>, right: <RecordQty value={qty} /> },
          {
            main: (
              <>
                <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{entry.group.rows.length} LINES</span>
                <RecordIdFact label="TRK" value={entry.group.rows.filter((row) => row.tracking_number).length.toString()} />
              </>
            ),
            right: <RecordNext label={incomingDeliveryNextAction(state.id)} warn={state.tone === 'danger'} />,
          },
        ]}
      />
    );
  }

  const row = entry.row;
  const state = incomingDeliveryRecordState(row);
  const title = displayReceivingProductTitle(row);
  const poId = (row.zoho_purchaseorder_id || '').trim();
  const tracking = (row.tracking_number || '').trim() || 'NO TRACKING';
  return (
    <IndustrialRecord
      state={state}
      open={open}
      openLabel={`Open ${title}`}
      onOpen={() => onOpen(entry.key)}
      photo={<RecordPhoto src={row.image_url} fallback={title} />}
      recordKey={entry.key}
      bands={[
        {
          main: (
            <>
              <span className="pointer-events-auto flex h-full items-center">
                <GridRowCheckbox
                  checked={selectedIds.has(row.id)}
                  label={`Select ${title}`}
                  onToggle={() => onToggleRow(row)}
                  chrome="hover"
                />
              </span>
              <RecordStateCode state={state} />
              <ReceivingRecordPlatform row={row} />
              {!entry.grouped ? <RecordIdFact label="PO" value={purchaseIdentity(row)} /> : null}
              <ReceivingRecordItem row={row} />
            </>
          ),
          right: <RecordStamp title={fmtDate(row.expected_delivery_date || row.po_date || row.created_at)}>{expectedStamp(row)}</RecordStamp>,
        },
        { main: <RecordTitle>{title}</RecordTitle>, right: <RecordQty value={quantity(row)} /> },
        {
          main: (
            <>
              <RecordIdFact label="TRK" value={tracking} />
              {row.sku ? <RecordIdFact label="SKU" value={row.sku} /> : null}
              {!row.tracking_number && poId ? (
                <span className="pointer-events-auto">
                  <IncomingAttachTrackingButton poId={poId} poNumber={row.zoho_purchaseorder_number} />
                </span>
              ) : null}
            </>
          ),
          right: <RecordNext label={incomingDeliveryNextAction(row.delivery_state)} warn={state.tone === 'danger'} />,
        },
      ]}
    />
  );
}
