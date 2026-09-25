'use client';

import { useMemo } from 'react';
import { ExternalLink, RefreshCw } from '@/components/Icons';
import { SkeletonList } from '@/design-system/components/Skeletons';
import {
  EvidenceDecisionBar,
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  EvidenceTitle,
} from '@/design-system/components/record-ledger/RecordEvidence';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { Button } from '@/design-system/primitives';
import { incomingDetailsTargetFromRow } from '@/lib/receiving/incoming-details-target';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { useIncomingDetails } from '@/components/sidebar/receiving/incoming-details/useIncomingDetails';
import { PairingTab } from '@/components/sidebar/receiving/incoming-details/PairingTab';
import { EbayTab } from '@/components/sidebar/receiving/incoming-details/EbayTab';
import { ShipmentTab } from '@/components/sidebar/receiving/incoming-details/ShipmentTab';
import { ActivityTab } from '@/components/sidebar/receiving/incoming-details/ActivityTab';
import { EmailTab } from '@/components/sidebar/receiving/incoming-details/EmailTab';
import { NotesTab } from '@/components/sidebar/receiving/incoming-details/NotesTab';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { fmtDate, fmtDateTime, fmtMoney } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { incomingDeliveryNextAction } from './IncomingDeliveryRecord';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import { cn } from '@/utils/_cn';

interface IncomingDeliveryEvidenceProps {
  row: ReceivingLineRow | null;
  state: RecordStateFace | null;
  rows: readonly ReceivingLineRow[];
  onClose: () => void;
}

function IncomingDeliverySummary({ rows }: { rows: readonly ReceivingLineRow[] }) {
  const counts = useMemo(() => {
    const next: Record<string, number> = {};
    for (const row of rows) {
      const key = row.delivery_state || 'UNKNOWN';
      next[key] = (next[key] ?? 0) + 1;
    }
    return next;
  }, [rows]);

  return (
    <>
      <EvidenceTitle sub="Carrier-side lifecycle before warehouse receipt">On the way</EvidenceTitle>
      <EvidenceSection label="Visible records">
        <EvidenceFacts>
          <EvidenceFact label="Lines" mono>{rows.length.toLocaleString()}</EvidenceFact>
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([state, count]) => (
              <EvidenceFact key={state} label={state.replaceAll('_', ' ')} mono>
                {count.toLocaleString()}
              </EvidenceFact>
            ))}
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceNotice>Select a purchase-order line to inspect its purchase, carrier trail, notes, pairing, and actions.</EvidenceNotice>
    </>
  );
}

function DetailsLoadFailure({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <EvidenceNotice tone="warn">Could not load delivery evidence.</EvidenceNotice>
      <Button type="button" variant="secondary" size="sm" onClick={retry}>Retry</Button>
    </div>
  );
}

export function IncomingDeliveryEvidence({ row, state, rows, onClose }: IncomingDeliveryEvidenceProps) {
  const resolved = row ? incomingDetailsTargetFromRow(row) : null;
  const target = resolved?.ok ? resolved.target : null;
  const controller = useIncomingDetails({
    zohoPurchaseOrderId: target?.poId ?? null,
    poNumberHint: target?.poNumber ?? null,
    shipmentId: target?.shipmentId ?? null,
    inboundSourceType: target?.inboundSourceType ?? null,
    inboundSourceOrderId: target?.inboundSourceOrderId ?? null,
    focusReceivingId: target?.receivingId ?? null,
    focusReceivingLineId: target?.receivingLineId ?? null,
    seedRow: target?.seedRow ?? null,
    onClose,
  });
  if (!row || !state) return <IncomingDeliverySummary rows={rows} />;

  if (!resolved?.ok) {
    return (
      <>
        <EvidenceTitle sub={displayReceivingProductTitle(row)}>{row.tracking_number || `Line ${row.id}`}</EvidenceTitle>
        <EvidenceStateStrip state={state} next="Pair" />
        <EvidenceNotice tone="warn">{resolved?.toast || 'This delivery has no resolvable purchase identity.'}</EvidenceNotice>
      </>
    );
  }

  if (controller.isLoading) {
    return <div className="p-4"><SkeletonList count={7} /></div>;
  }
  if (controller.isError || !controller.data?.success) {
    return <DetailsLoadFailure retry={() => void controller.refetch()} />;
  }

  const data = controller.data;
  const identity =
    controller.headerPo ||
    controller.headerOrder ||
    controller.headerTracking ||
    row.source_order_id ||
    `Line ${row.id}`;
  const listing = data.inbound?.listing_url || row.listing_url || row.receiving_listing_url || null;
  const next = incomingDeliveryNextAction(row.delivery_state);

  const verbs = [
    ...(!controller.isShipmentOnly && !controller.isCartonOnly
      ? [{
          label: controller.syncing ? 'Syncing…' : 'Sync',
          onPress: () => void controller.syncOne(),
          disabled: controller.syncing,
          icon: <RefreshCw aria-hidden />,
        }]
      : []),
  ];

  return (
    <>
      <EvidenceTitle sub={data.po?.vendor_name || data.inbound?.seller_name || displayReceivingProductTitle(row)}>{identity}</EvidenceTitle>
      <EvidenceStateStrip state={state} next={next} />

      <EvidenceSection label="Purchase identity">
        <EvidenceFacts>
          <EvidenceFact label="Source" mono>{(data.inbound?.source_type || row.inbound_source_type || row.source_platform || '—').toUpperCase()}</EvidenceFact>
          <EvidenceFact label="Order" mono>{data.inbound?.order_number || row.source_order_id || data.po?.zoho_purchaseorder_number || '—'}</EvidenceFact>
          <EvidenceFact label="PO status">{data.po?.status || '—'}</EvidenceFact>
          <EvidenceFact label="Reference" mono>{data.po?.reference_number || '—'}</EvidenceFact>
          <EvidenceFact label="Vendor">{data.po?.vendor_name || data.inbound?.seller_name || row.vendor_name || '—'}</EvidenceFact>
          <EvidenceFact label="Account">{data.inbound?.account_label || row.platform_account_label || '—'}</EvidenceFact>
          <EvidenceFact label="PO date" mono>{fmtDate(data.po?.po_date || row.po_date)}</EvidenceFact>
          <EvidenceFact label="Expected" mono>{fmtDate(data.po?.expected_delivery_date || row.expected_delivery_date)}</EvidenceFact>
          <EvidenceFact label="Total" mono>{fmtMoney(data.po?.total ?? null, data.po?.currency ?? null)}</EvidenceFact>
          <EvidenceFact label="Listing">
            {listing ? (
              <a href={listing} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                Open listing <ExternalLink aria-hidden />
              </a>
            ) : '—'}
          </EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>

      <EvidenceSection label="Warehouse receipt">
        <EvidenceFacts>
          <EvidenceFact label="Carrier delivered" mono>{fmtDateTime(data.shipment?.delivered_at ?? row.delivered_at)}</EvidenceFact>
          <EvidenceFact label="Door scan" mono>{fmtDateTime(data.receiving?.received_at ?? row.received_at)}</EvidenceFact>
          <EvidenceFact label="Unboxed" mono>{fmtDateTime(row.unboxed_at)}</EvidenceFact>
          <EvidenceFact label="Line received" mono>{fmtDateTime(row.received_done_at)}</EvidenceFact>
          <EvidenceFact label="Carton receipt" mono>{fmtDateTime(data.receiving?.inventory_received_at)}</EvidenceFact>
          <EvidenceFact label="Receipt ID" mono>{data.receiving?.zoho_purchase_receive_id || row.zoho_purchase_receive_id || '—'}</EvidenceFact>
          <EvidenceFact label="Workflow">{row.workflow_status || '—'}</EvidenceFact>
          <EvidenceFact label="Condition">{row.condition_grade || '—'}</EvidenceFact>
          <EvidenceFact label="Location" mono>{row.staged_location_code || row.staged_location_name || row.staging_location_label || 'Not recorded'}</EvidenceFact>
        </EvidenceFacts>
        <p className="mt-2 text-role-data text-mode-muted">Carrier delivery and a door scan do not confirm inventory receipt. Carton receipt is the latest received line, not proof every item is received. A dash means no timestamp was supplied.</p>
      </EvidenceSection>

      {data.inbound?.links.length ? (
        <EvidenceSection label="Purchase relationships">
          <EvidenceFacts>
            {data.inbound.links.map((link) => (
              <EvidenceFact key={`${link.source_type}:${link.source_order_id}`} label={link.is_primary ? 'Primary' : 'Linked'} mono>
                {link.source_type.toUpperCase()} · {link.source_order_id}
              </EvidenceFact>
            ))}
          </EvidenceFacts>
        </EvidenceSection>
      ) : null}

      <EvidenceSection label={`Item lines · ${data.line_items.length}`}>
        <div className="flex flex-col border-t border-mode-rule">
          {data.line_items.map((line, index) => {
            const lineListing = line.listing_url || (line.receiving_line_id === row.id ? row.listing_url : null);
            return (
              <div key={line.receiving_line_id ?? line.line_item_id ?? index} className="border-b border-mode-rule py-2 last:border-b-0">
                <div className="flex min-w-0 items-start gap-2">
                  <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 break-words')}>{line.name || line.sku || `Line ${index + 1}`}</span>
                  <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>RCVD {line.quantity_received} / EXP {line.quantity_expected}</span>
                </div>
                <div className={cn(RECORD_LABEL_CLASS, 'mt-1 flex flex-wrap items-center gap-3 text-mode-muted')}>
                  {line.sku ? <span>SKU <b className="text-mode-ink">{line.sku}</b></span> : null}
                  {lineListing ? (
                    <a href={lineListing} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-mode-ink underline underline-offset-2">
                      LISTING <ExternalLink aria-hidden />
                    </a>
                  ) : null}
                </div>
                <EvidenceFacts>
                  <EvidenceFact label="Workflow">{line.workflow_status || '—'}</EvidenceFact>
                  <EvidenceFact label="Unit cost" mono>{fmtMoney(line.rate == null ? null : String(line.rate), data.po?.currency ?? null)}</EvidenceFact>
                  <EvidenceFact label="Line total" mono>{fmtMoney(line.item_total == null ? null : String(line.item_total), data.po?.currency ?? null)}</EvidenceFact>
                </EvidenceFacts>
                {line.description ? <p className="mt-1 whitespace-pre-wrap text-role-data text-mode-muted">{line.description}</p> : null}
              </div>
            );
          })}
        </div>
      </EvidenceSection>

      {!data.po?.zoho_purchaseorder_id ? (
        <EvidenceSection label="Package pairing">
          <PairingTab
            data={data}
            seedRow={row}
            focusReceivingId={resolved.target.receivingId}
            focusReceivingLineId={resolved.target.receivingLineId}
            onPaired={controller.invalidateIncoming}
          />
        </EvidenceSection>
      ) : null}

      {data.inbound ? <EvidenceSection label="Marketplace"><EbayTab data={data} /></EvidenceSection> : null}
      <EvidenceSection label="Tracking and carrier"><ShipmentTab data={data} /></EvidenceSection>
      <EvidenceSection label="Activity"><ActivityTab data={data} /></EvidenceSection>
      {data.po ? (
        <EvidenceSection label="Purchase record">
          <EvidenceFacts>
            <EvidenceFact label="PO ID" mono>{data.po.zoho_purchaseorder_id}</EvidenceFact>
            <EvidenceFact label="Modified" mono>{fmtDateTime(data.po.last_modified_zoho)}</EvidenceFact>
            <EvidenceFact label="Last synced" mono>{fmtDateTime(data.po.last_synced_at)}</EvidenceFact>
          </EvidenceFacts>
          {data.po_notes ? <p className="mt-2 whitespace-pre-wrap text-role-data text-mode-ink">{data.po_notes}</p> : null}
          {data.zoho_activity.map((event, index) => (
            <div key={`${event.timestamp}:${index}`} className="mt-2 border-t border-mode-rule pt-2 text-role-data">
              <p className={RECORD_LABEL_CLASS}>{fmtDateTime(event.timestamp)} · {event.label}</p>
              {event.description ? <p className="whitespace-pre-wrap text-mode-muted">{event.description}</p> : null}
            </div>
          ))}
        </EvidenceSection>
      ) : null}
      {data.po ? <EvidenceSection label="Email"><EmailTab data={data} /></EvidenceSection> : null}
      <EvidenceSection label="Notes">
        {row.notes ? <p className="mb-2 whitespace-pre-wrap text-role-data text-mode-ink">Line note: {row.notes}</p> : null}
        <NotesTab receivingId={data.receiving?.id ?? null} initialValue={data.notes ?? ''} />
      </EvidenceSection>
      {verbs.length ? <EvidenceDecisionBar verbs={verbs} /> : null}
      <EvidenceSection label="Remove from incoming">
        <p className="mb-2 text-role-data text-mode-muted">{data.po ? 'Removes all incoming lines for this purchase order. The upstream purchase order is unchanged.' : 'Removes this incoming record.'}</p>
        <InspectorFlushDelete
          key={row.id}
          onConfirm={controller.handleDelete}
          onDeleted={onClose}
          label="Delete incoming record"
          confirmLabel={data.po ? 'Confirm removal of all incoming lines for this purchase order' : 'Confirm removal of this incoming record'}
        />
      </EvidenceSection>
    </>
  );
}
