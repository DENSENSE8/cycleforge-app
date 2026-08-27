'use client';

import { Pencil } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { dispatchReceivingOpenPairingPo } from '@/utils/events';
import { InventoryPoHeader } from '@/components/receiving/inventory/InventoryPoHeader';
import { InventoryPoLineList } from '@/components/receiving/inventory/InventoryPoLineList';
import { InventoryActivityPanel } from '@/components/receiving/inventory/InventoryActivityPanel';
import { type DetailsResponse } from './incoming-details-shared';
import { Empty } from './incoming-details-primitives';

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

      <InventoryPoHeader data={data} />

      <div>
        <p className="mb-2 text-role-eyebrow uppercase tracking-wider text-text-soft">Line items</p>
        <InventoryPoLineList
          lines={lines}
          focusReceivingLineId={focusReceivingLineId ?? null}
        />
      </div>

      <div>
        <p className="mb-2 text-role-eyebrow uppercase tracking-wider text-text-soft">Activity</p>
        <InventoryActivityPanel data={data} />
      </div>
    </div>
  );
}
