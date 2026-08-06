'use client';

import { Pencil } from '@/components/Icons';
import { PoChip, getLast8 } from '@/components/ui/CopyChip';
import { Button } from '@/design-system/primitives';
import { dispatchReceivingOpenPairingPo } from '@/utils/events';
import { cn } from '@/utils/_cn';
import { type DetailsResponse, fmtDate, fmtDateTime, fmtMoney } from './incoming-details-shared';
import { Row, Empty } from './incoming-details-primitives';

export function PoTab({
  data,
  focusReceivingId,
  focusReceivingLineId,
}: {
  data: DetailsResponse;
  focusReceivingId?: number | null;
  focusReceivingLineId?: number | null;
}) {
  const po = data.po;
  const lines = data.line_items ?? [];
  const tracking = (data.shipment?.tracking_number || '').trim();
  const showCartonStrip =
    focusReceivingId != null && Number.isFinite(focusReceivingId) && focusReceivingId > 0;

  if (!po) {
    return <Empty msg="PO not found in zoho_po_mirror yet — wait for the next sync tick." />;
  }

  return (
    <div className="space-y-5">
      {showCartonStrip ? (
        <div className="flex items-start justify-between gap-3 rounded-none border border-border-hairline bg-surface-sunken/60 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-role-eyebrow uppercase tracking-wider text-text-soft">This carton</p>
            <p className="mt-0.5 text-role-caption font-semibold text-text-default">
              #{focusReceivingId}
              {tracking ? (
                <span className="ml-2 font-medium text-text-muted">· {tracking}</span>
              ) : null}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            ariaLabel="Change purchase order"
            onClick={() => dispatchReceivingOpenPairingPo()}
            className="shrink-0 gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Change PO
          </Button>
        </div>
      ) : null}

      <div>
        <Row
          label="PO #"
          value={<PoChip value={po.zoho_purchaseorder_number} display={getLast8(po.zoho_purchaseorder_number)} />}
        />
        <Row label="Status" value={po.status ?? '—'} />
        <Row label="Vendor" value={po.vendor_name ?? '—'} />
        <Row label="Reference #" value={po.reference_number ?? '—'} copyValue={po.reference_number} />
        <Row label="PO Date" value={fmtDate(po.po_date)} />
        <Row label="Expected delivery" value={fmtDate(po.expected_delivery_date)} />
        <Row label="Total" value={fmtMoney(po.total, po.currency)} />
        <Row label="Modified in inventory" value={fmtDateTime(po.last_modified_zoho)} />
        <Row label="Synced locally" value={fmtDateTime(po.last_synced_at)} />
      </div>

      <div>
        <p className="mb-2 text-role-eyebrow uppercase tracking-wider text-text-soft">Line items</p>
        {lines.length === 0 ? (
          <p className="rounded-none border border-dashed border-border-hairline px-3 py-4 text-center text-role-caption font-medium text-text-faint">
            No lines on this order yet
          </p>
        ) : (
          <ul className="divide-y divide-border-hairline rounded-none border border-border-hairline overflow-hidden">
            {lines.map((line, idx) => {
              const isActive =
                focusReceivingLineId != null &&
                line.receiving_line_id != null &&
                line.receiving_line_id === focusReceivingLineId;
              const label = (line.sku || line.name || 'Line').trim() || 'Line';
              const qty = `${line.quantity_received}/${line.quantity_expected}`;
              return (
                <li
                  key={line.line_item_id || line.receiving_line_id || `line-${idx}`}
                  className={cn(
                    'flex items-start justify-between gap-3 px-3 py-2.5',
                    isActive && 'bg-blue-50/80',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-role-caption font-semibold text-text-default">
                      {label}
                      {isActive ? (
                        <span className="ml-1.5 text-role-eyebrow font-semibold uppercase tracking-wider text-blue-700">
                          Active
                        </span>
                      ) : null}
                    </p>
                    {line.name && line.sku ? (
                      <p className="mt-0.5 truncate text-role-caption text-text-muted">{line.name}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-role-caption font-semibold tabular-nums text-text-default">{qty}</p>
                    {line.workflow_status ? (
                      <p className="mt-0.5 text-role-eyebrow uppercase tracking-wider text-text-soft">
                        {line.workflow_status}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
