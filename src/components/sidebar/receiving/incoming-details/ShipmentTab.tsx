'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Link2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IncomingAttachTrackingPopover } from '@/components/sidebar/receiving/IncomingAttachTrackingPopover';
import { type DetailsResponse } from './incoming-details-shared';
import { Empty } from './incoming-details-primitives';
import { CarrierTrackingSection } from './CarrierTrackingSection';

/**
 * Incoming panel Shipment tab — empty/attach state when no shipment, otherwise
 * delegates to {@link CarrierTrackingSection} (shared with WorkspaceTimelineTab).
 */
export function ShipmentTab({ data }: { data: DetailsResponse }) {
  const s = data.shipment;
  const queryClient = useQueryClient();

  if (!s) {
    const poId = (data.po?.zoho_purchaseorder_id || '').trim();
    return (
      <div className="space-y-3">
        <Empty msg="No shipment linked yet — the PO reference# is empty or hasn't resolved to a tracking number. Attach a tracking number below, or wait for the next sync run." />
        {poId ? (
          <div className="flex justify-center">
            <IncomingAttachTrackingPopover
              presetPo={{ poId, poNumber: data.po?.zoho_purchaseorder_number ?? null }}
              onAttached={() => {
                queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
                queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
                queryClient.invalidateQueries({ queryKey: ['receiving-lines-incoming-summary'] });
              }}
              trigger={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Link2 />}
                  className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  Add tracking
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  return <CarrierTrackingSection shipment={s} />;
}
