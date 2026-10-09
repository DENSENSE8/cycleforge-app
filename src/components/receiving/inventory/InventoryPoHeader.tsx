'use client';

/** Shared inventory PO header — dense Action Plane fact bands. */

import { PoChip, getLast8 } from '@/components/ui/CopyChip';
import {
  fmtDate,
  fmtDateTime,
  fmtMoney,
  type DetailsResponse,
} from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { Empty } from '@/components/sidebar/receiving/incoming-details/incoming-details-primitives';
import { StationDenseFactStrip } from '@/components/station/displays';
import { ZohoReceiptChip } from './ZohoReceiptChip';

export function InventoryPoHeader({
  data,
  variant = 'full',
}: {
  data: DetailsResponse;
  /** `full` — desk Incoming context (multi-column strip). */
  variant?: 'full' | 'compact' | 'instrument';
}) {
  const po = data.po;
  if (!po) {
    return (
      <Empty msg="Purchase order not in the local mirror yet — refresh from inventory or wait for the next tick." />
    );
  }

  if (variant === 'instrument') {
    return (
      <header
        className="shrink-0 border-b border-border-hairline"
        data-testid="inventory-po-header"
        data-variant="instrument"
        data-inventory-trust-header=""
      >
        <StationDenseFactStrip
          layout="rows"
          data-testid="inventory-po-header-facts"
          className="border-0 bg-transparent"
          facts={[
            {
              label: 'PO #',
              value: (
                <PoChip
                  value={po.zoho_purchaseorder_number}
                  display={getLast8(po.zoho_purchaseorder_number)}
                />
              ),
            },
            {
              label: 'Status',
              // Same face as Incoming / Unbox `zoho` grid column — never raw
              // mirror status prose.
              value: (
                <ZohoReceiptChip
                  status={po.status}
                  syncedAt={po.last_synced_at}
                />
              ),
            },
            {
              label: 'Total',
              value: fmtMoney(po.total, po.currency),
              mono: true,
            },
            { label: 'Vendor', value: po.vendor_name ?? '—' },
            {
              label: 'Reference #',
              value: po.reference_number ?? '—',
              copyValue: po.reference_number,
              mono: true,
            },
            { label: 'PO date', value: fmtDate(po.po_date) },
            // Expected delivery is Incoming / planning context (vendor ETA).
            // At Unbox the carton is already on the bench — omit from Information.
            {
              label: 'Modified in inventory',
              value: fmtDateTime(po.last_modified_zoho),
              mono: true,
            },
            {
              label: 'Last pulled',
              value: fmtDateTime(po.last_synced_at),
              mono: true,
            },
            // Carton receive trail (website do/undo) — dense facts on Information,
            // never a second trust-strip chrome (guard forbids data-inventory-receive-fact).
            {
              label: 'Received',
              value: fmtDateTime(data.receiving?.inventory_received_at ?? null),
              mono: true,
            },
            {
              label: 'Purchase receive',
              value: data.receiving?.zoho_purchase_receive_id?.trim() || '—',
              copyValue: data.receiving?.zoho_purchase_receive_id?.trim() || undefined,
              mono: true,
            },
          ]}
        />
      </header>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-1.5" data-testid="inventory-po-header" data-variant="compact">
        <StationDenseFactStrip
          layout="strip"
          columns={3}
          facts={[
            {
              label: 'PO #',
              value: (
                <PoChip
                  value={po.zoho_purchaseorder_number}
                  display={getLast8(po.zoho_purchaseorder_number)}
                />
              ),
            },
            {
              label: 'Status',
              value: (
                <ZohoReceiptChip
                  status={po.status}
                  syncedAt={po.last_synced_at}
                />
              ),
            },
            { label: 'Synced', value: fmtDateTime(po.last_synced_at) },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="inventory-po-header" data-variant="full">
      <StationDenseFactStrip
        layout="strip"
        columns={4}
        facts={[
          {
            label: 'PO #',
            value: (
              <PoChip
                value={po.zoho_purchaseorder_number}
                display={getLast8(po.zoho_purchaseorder_number)}
              />
            ),
          },
          {
            label: 'Status',
            value: (
              <ZohoReceiptChip
                status={po.status}
                syncedAt={po.last_synced_at}
              />
            ),
          },
          { label: 'Vendor', value: po.vendor_name ?? '—' },
          {
            label: 'Reference #',
            value: po.reference_number ?? '—',
            copyValue: po.reference_number,
            mono: true,
          },
        ]}
      />
      <StationDenseFactStrip
        layout="strip"
        columns={5}
        facts={[
          { label: 'PO date', value: fmtDate(po.po_date) },
          { label: 'Expected', value: fmtDate(po.expected_delivery_date) },
          { label: 'Total', value: fmtMoney(po.total, po.currency) },
          { label: 'Modified', value: fmtDateTime(po.last_modified_zoho) },
          { label: 'Synced', value: fmtDateTime(po.last_synced_at) },
        ]}
      />
    </div>
  );
}
