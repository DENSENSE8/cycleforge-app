'use client';

/** Incoming desk Pairing topic — composes the same Package Pairing hub Arrival Displays use (`CartonMatchHub` · `tabSet="arrival"` ·… */

import { useAuth } from '@/contexts/AuthContext';
import { CartonMatchHub } from '@/components/receiving/workspace/line-edit/CartonMatchHub';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { DetailsResponse } from './incoming-details-shared';

export function PairingTab({
  data,
  seedRow,
  focusReceivingId,
  focusReceivingLineId,
  onPaired,
}: {
  data: DetailsResponse;
  seedRow?: ReceivingLineRow | null;
  focusReceivingId?: number | null;
  focusReceivingLineId?: number | null;
  /** After a successful link — invalidate Incoming feeds / details. */
  onPaired?: () => void;
}) {
  const { user } = useAuth();
  const staffId = String(user?.staffId ?? '');
  const row = seedRow ?? synthesizePairingRow(data, focusReceivingId, focusReceivingLineId);
  const receivingId = row.receiving_id;

  // Relink / import-sales-order broadcast line + package patches — refresh the
  // inspector so Pairing collapses and the PO tab appears.
  useReceivingEvents(
    {
      'receiving-line-updated': (detail) => {
        if (!onPaired || receivingId == null) return;
        if (detail.receiving_id === receivingId || detail.id === row.id) onPaired();
      },
      'receiving-package-updated': (detail) => {
        if (!onPaired || receivingId == null) return;
        if (detail.receiving_id === receivingId) onPaired();
      },
    },
    Boolean(onPaired && receivingId != null),
  );

  if (!receivingId) {
    return (
      <p
        className={cn(
          cornerClass('flush'),
          'border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-role-caption text-text-soft',
        )}
      >
        This package has no carton record yet — scan its tracking at Arrival to
        enable pairing.
      </p>
    );
  }

  const unfound = shouldUseUnmatchedItemsSurface(row);

  return (
    <div className="-mx-2 min-h-0">
      <CartonMatchHub
        row={row}
        staffId={staffId}
        tabSet="arrival"
        chrome="bare"
        autoFocusSearch={false}
        showOpenInUnbox={false}
        autoMatch={
          unfound
            ? {
                receivingId,
                lineId: row.id > 0 ? row.id : null,
                trackingNumber: row.tracking_number ?? data.shipment?.tracking_number ?? null,
                onTicketChanged: onPaired,
              }
            : null
        }
      />
    </div>
  );
}

/** Minimal row when the panel opened without a grid seed (order-chip Details). */
function synthesizePairingRow(
  data: DetailsResponse,
  focusReceivingId?: number | null,
  focusReceivingLineId?: number | null,
): ReceivingLineRow {
  const receivingId = data.receiving?.id ?? focusReceivingId ?? null;
  const lineId =
    focusReceivingLineId && focusReceivingLineId > 0
      ? focusReceivingLineId
      : data.line_items?.[0]?.receiving_line_id ?? 0;
  const first = data.line_items?.[0];
  return {
    id: lineId,
    receiving_id: receivingId,
    tracking_number: data.shipment?.tracking_number ?? null,
    carrier: data.shipment?.carrier ?? null,
    zoho_item_id: first?.item_id ?? null,
    zoho_line_item_id: first?.line_item_id ?? null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: data.po?.zoho_purchaseorder_id ?? null,
    zoho_purchaseorder_number: data.po?.zoho_purchaseorder_number ?? null,
    item_name: first?.name ?? null,
    sku: first?.sku ?? null,
    quantity_received: first?.quantity_received ?? 0,
    quantity_expected: first?.quantity_expected ?? null,
    qa_status: '',
    workflow_status: first?.workflow_status ?? null,
    disposition_code: '',
    condition_grade: '',
    disposition_audit: [],
    needs_test: false,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: null,
    receiving_source: data.po ? 'zoho_po' : 'unmatched',
    notes: null,
    created_at: null,
    image_url: null,
    source_platform: null,
  } as unknown as ReceivingLineRow;
}
