'use client';

import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { ReceivingRecordItem, ReceivingRecordPlatform } from '@/components/receiving/ReceivingRecordIdentity';
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
import { dockedNextStep, dockedReceivedQuantity, dockedRecordFace } from '@/lib/receiving/docked-record-state';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { conditionSentenceLabel } from '@/lib/conditions';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { resolveReceivingRowStageStamp, type ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';

export function DockedReceivingRecord({
  row,
  open,
  selected,
  activityAxis,
  onOpen,
  onToggle,
}: {
  row: ReceivingLineRow;
  open: boolean;
  selected: boolean;
  activityAxis: ReceivingActivityAxis;
  onOpen: (row: ReceivingLineRow) => void;
  onToggle: (row: ReceivingLineRow) => void;
}) {
  // Same face and next step as the cards (`dockedRecordFace` / `dockedNextStep`).
  const state = dockedRecordFace(row);
  const next = dockedNextStep(row);
  const title = displayReceivingProductTitle(row);
  const stamp = resolveReceivingRowStageStamp(row, activityAxis);
  const activityAt = stamp?.instant;
  const po = row.zoho_purchaseorder_number || row.source_order_id || `Carton ${row.receiving_id ?? row.id}`;
  const quantity = dockedReceivedQuantity(row);

  return (
    <IndustrialRecord
      state={state}
      open={open}
      openLabel={`Open ${title}`}
      onOpen={() => onOpen(row)}
      photo={<RecordPhoto src={row.image_url} fallback={title} />}
      recordKey={String(row.id)}
      bands={[
        {
          main: (
            <>
              <span className="pointer-events-auto flex h-full items-center">
                <GridRowCheckbox
                  checked={selected}
                  label={`Select ${title}`}
                  onToggle={() => onToggle(row)}
                  chrome="hover"
                />
              </span>
              <RecordStateCode state={state} />
              <ReceivingRecordPlatform row={row} />
              <RecordIdFact label="PO" value={po} />
              <ReceivingRecordItem row={row} />
            </>
          ),
          right: <RecordStamp title={`${stamp?.label || 'Activity'} · ${fmtDate(activityAt)}`}>{fmtDate(activityAt, 'MMM d')}</RecordStamp>,
        },
        {
          main: <RecordTitle>{title}</RecordTitle>,
          right: <RecordQty value={quantity} />,
        },
        {
          main: (
            <>
              <RecordIdFact label="Cond" value={row.condition_grade ? conditionSentenceLabel(row.condition_grade) : '—'} />
              <RecordIdFact label="Bin" value={row.staged_location_code || row.staged_location_name || row.staging_location_label || 'Unassigned'} />
              {row.tracking_number ? <RecordIdFact label="TRK" value={row.tracking_number} /> : null}
              {row.sku ? <RecordIdFact label="SKU" value={row.sku} /> : null}
              <RecordIdFact label="CTN" value={String(row.receiving_id ?? '—')} />
            </>
          ),
          right: next ? <RecordNext label={next} warn={state.tone === 'danger' || state.tone === 'warning'} /> : null,
        },
      ]}
    />
  );
}
