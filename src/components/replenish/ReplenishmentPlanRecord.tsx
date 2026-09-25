'use client';

import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
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
import { REPLENISHMENT_RECORD_STATE } from '@/design-system/tokens/replenishment';
import type { NeedToOrderRow } from './replenish-types';
import { numText } from './replenish-types';

const NEXT_ACTION: Readonly<Record<NeedToOrderRow['status'], string>> = {
  detected: 'Review',
  pending_review: 'Plan PO',
  planned_for_po: 'Create PO',
  po_created: 'Await receipt',
  waiting_for_receipt: 'Receive',
  fulfilled: 'Complete',
  cancelled: 'Closed',
};

export function ReplenishmentPlanRecord({
  row,
  open,
  selected,
  onOpen,
  onToggle,
}: {
  row: NeedToOrderRow;
  open: boolean;
  selected: boolean;
  onOpen: (row: NeedToOrderRow) => void;
  onToggle: (row: NeedToOrderRow) => void;
}) {
  const state = REPLENISHMENT_RECORD_STATE[row.status];
  const waiting = Array.isArray(row.orders_waiting) ? row.orders_waiting.length : 0;
  const stock = Number(row.zoho_quantity_available || 0);
  const incoming = Number(row.zoho_incoming_quantity || 0);

  return (
    <IndustrialRecord
      state={state}
      open={open}
      openLabel={`Open purchasing plan for ${row.item_name}`}
      onOpen={() => onOpen(row)}
      photo={<RecordPhoto src={null} fallback={row.item_name || row.sku || 'Purchasing plan'} />}
      recordKey={row.id}
      bands={[
        {
          main: (
            <>
              <span className="pointer-events-auto flex h-full items-center">
                <GridRowCheckbox
                  checked={selected}
                  label={`Select ${row.item_name}`}
                  onToggle={() => onToggle(row)}
                  chrome="hover"
                />
              </span>
              <RecordStateCode state={state} />
              {row.sku ? <RecordIdFact label="SKU" value={row.sku} /> : null}
            </>
          ),
          right: <RecordStamp>{row.vendor_name || 'NO VENDOR'}</RecordStamp>,
        },
        {
          main: <RecordTitle>{row.item_name || 'Unknown item'}</RecordTitle>,
          right: <RecordQty value={Number(row.quantity_to_order || row.quantity_needed || 0)} />,
        },
        {
          main: (
            <>
              <RecordIdFact label="NEED" value={numText(row.quantity_needed)} />
              <RecordIdFact label="STOCK" value={String(stock)} />
              <RecordIdFact label="IN" value={String(incoming)} />
              {waiting > 0 ? <RecordIdFact label="BLOCKED" value={String(waiting)} /> : null}
            </>
          ),
          right: (
            <RecordNext
              label={NEXT_ACTION[row.status]}
              warn={state.tone === 'danger' || state.tone === 'warning'}
            />
          ),
        },
      ]}
    />
  );
}
