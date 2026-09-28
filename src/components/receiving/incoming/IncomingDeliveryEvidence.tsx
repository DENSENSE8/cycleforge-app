'use client';

/**
 * The INCOMING DELIVERY RECORD — the one record for an inbound purchase line, on every desk that lists deliveries (`/incoming` On the way,…
 * Built for triage at a glance (owner 2026-09-25), on the order record's shape:
 */

import type { ReactNode } from 'react';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_LABEL_CLASS, type RecordStateFace } from '@/design-system/tokens/industrial-record';
import { Button } from '@/design-system/primitives';
import { ReceivingFulfilment, ReceivingStatusStrip } from '@/components/receiving/record/ReceivingStatusStrip';
import { ReceivingPhotosSection } from '@/components/station/receiving/ReceivingPhotosSection';
import { useIncomingDetails, type IncomingDetailsController } from '@/components/sidebar/receiving/incoming-details/useIncomingDetails';
import { PairingTab } from '@/components/sidebar/receiving/incoming-details/PairingTab';
import { ShipmentTab } from '@/components/sidebar/receiving/incoming-details/ShipmentTab';
import { ActivityTab } from '@/components/sidebar/receiving/incoming-details/ActivityTab';
import { EmailTab } from '@/components/sidebar/receiving/incoming-details/EmailTab';
import {
  fmtDateTime,
  fmtMoney,
  type DetailsResponse,
} from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { incomingDetailsTargetFromRow, type IncomingDetailsFromRowResult } from '@/lib/receiving/incoming-details-target';
import { deriveIncomingAlerts, deriveIncomingSteps } from '@/lib/receiving/incoming-record-status';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingStatusStep } from '@/lib/receiving/receiving-status-strip';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { cn } from '@/utils/_cn';
import { cartonIdOf, IncomingItem, IncomingRecordAside } from './incoming-record-sections';
import { incomingDeliveryNextAction, purchaseExceptionReason } from './IncomingDeliveryRecord';

/**
 * The lane read as a whole — the ledger's summary with nothing open. On the
 * way counts carrier states; Exceptions counts reasons.
 */
export function incomingDeliverySummary(
  rows: readonly ReceivingLineRow[],
  lane: 'pipeline' | 'exceptions' = 'pipeline',
): RecordLedgerSummary {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = (lane === 'exceptions' && row.exception_code) || row.delivery_state || 'UNKNOWN';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    title: lane === 'exceptions' ? 'Exceptions' : 'On the way',
    sub: lane === 'exceptions'
      ? 'Inbound lines that need a person, not time'
      : 'Carrier-side lifecycle before warehouse receipt',
    facts: [
      { label: 'Lines', value: rows.length },
      ...[...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([deliveryState, count]) => ({ label: deliveryState.replaceAll('_', ' '), value: count })),
    ],
    note: 'Select a purchase-order line to see its status, items, carrier trail and actions.',
  };
}


/**
 * The open delivery's details read + verbs — one controller for the record body
 * and the plane header. `row` null keeps the read idle (nothing open).
 */
export interface IncomingDelivery {
  /** The row's details target, or why it has none; null when nothing is open. */
  resolved: IncomingDetailsFromRowResult | null;
  controller: IncomingDetailsController;
}

export function useIncomingDelivery(row: ReceivingLineRow | null): IncomingDelivery {
  const resolved = row ? incomingDetailsTargetFromRow(row) : null;
  const target = resolved?.ok ? resolved.target : null;
  const controller = useIncomingDetails({
    zohoPurchaseOrderId: target?.poId ?? null,
    poNumberHint: target?.poNumber ?? null,
    shipmentId: target?.shipmentId ?? null,
    inboundSourceType: target?.inboundSourceType ?? null,
    inboundSourceOrderId: target?.inboundSourceOrderId ?? null,
    focusReceivingId: target?.receivingId ?? null,
  });
  return { resolved, controller };
}


interface IncomingDeliveryEvidenceProps {
  /** The line the staffer opened. */
  row: ReceivingLineRow;
  /** Every loaded line of this purchase (the open line included) — the items' own status. */
  lines: readonly ReceivingLineRow[];
  state: RecordStateFace;
  delivery: IncomingDelivery;
}

export function IncomingDeliveryEvidence({ row, lines, state, delivery }: IncomingDeliveryEvidenceProps) {
  const { resolved, controller } = delivery;
  const data = controller.data?.success ? controller.data : undefined;
  const paired = Boolean(data?.po?.zoho_purchaseorder_id || row.zoho_purchaseorder_id || data?.inbound || row.source_order_id);
  const steps = deriveIncomingSteps(lines, data?.shipment ?? null);
  const alerts = deriveIncomingAlerts(lines, paired);
  const itemCount = data?.line_items.length || lines.length;

  const strip = (
    <ReceivingStatusStrip
      state={state}
      next={incomingDeliveryNextAction(state.id)}
      count={`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
      alerts={alerts}
      testId="incoming-record-status"
    />
  );

  // Exceptions: WHY this needs a person and the next action, above everything.
  const exception = purchaseExceptionReason(lines.length > 0 ? lines : [row]);
  const why = exception ? (
    <EvidenceNotice tone="warn">
      <span data-testid="incoming-record-exception">
        <b className="font-semibold">{exception.why}</b> → {exception.next}
      </span>
    </EvidenceNotice>
  ) : null;

  let body: ReactNode;
  if (resolved && !resolved.ok) {
    body = (
      <div className={DESK_RECORD_COLUMN_CARD_CLASS}>
        <EvidenceNotice tone="warn">{resolved.toast || 'This delivery has no resolvable purchase identity.'}</EvidenceNotice>
      </div>
    );
  } else if (controller.isLoading) {
    body = (
      <div className={cn(DESK_RECORD_COLUMN_CARD_CLASS, 'p-4')}>
        <SkeletonList count={7} />
      </div>
    );
  } else if (!data) {
    body = (
      <div className={cn(DESK_RECORD_COLUMN_CARD_CLASS, 'gap-3 p-4')}>
        <EvidenceNotice tone="warn">Could not load delivery details.</EvidenceNotice>
        <Button type="button" variant="secondary" size="sm" onClick={() => void controller.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else {
    body = (
      <DeskRecordLayout
        main={<IncomingRecordMain row={row} lines={lines} data={data} delivery={delivery} steps={steps} />}
        aside={
          <div className="flex min-w-0 flex-col gap-4">
            <IncomingRecordPhotos row={row} lines={lines} data={data} />
            <IncomingRecordAside row={row} data={data} />
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 bg-mode-canvas p-4 text-mode-ink" data-testid="incoming-record-view">
      {strip}
      {why}
      {body}
    </div>
  );
}

/** Photos top-right, above the Purchase facts — where the carton record keeps them. */
function IncomingRecordPhotos({
  row,
  lines,
  data,
}: {
  row: ReceivingLineRow;
  lines: readonly ReceivingLineRow[];
  data: DetailsResponse;
}) {
  const cartonId = cartonIdOf(row, data);
  const photoCount = lines.reduce((max, line) => Math.max(max, line.photo_count ?? 0), 0);
  if (!cartonId || photoCount === 0) return null;
  return (
    <RecordGroup title={`Photos · ${photoCount}`} testId="incoming-record-photos">
      <div className="px-4 pb-3 pt-1">
        <ReceivingPhotosSection
          receivingId={String(cartonId)}
          poRef={data.po?.zoho_purchaseorder_number ?? row.zoho_purchaseorder_number ?? null}
          readOnly
          hideHeader
        />
      </div>
    </RecordGroup>
  );
}

function IncomingRecordMain({
  row,
  lines,
  data,
  delivery,
  steps,
}: {
  row: ReceivingLineRow;
  lines: readonly ReceivingLineRow[];
  data: DetailsResponse;
  delivery: IncomingDelivery;
  steps: readonly ReceivingStatusStep[];
}) {
  const controller = delivery.controller;
  const target = delivery.resolved?.ok ? delivery.resolved.target : null;
  const byLineId = new Map(lines.map((line) => [line.id, line] as const));
  const ordered = data.line_items.reduce((sum, line) => sum + (line.quantity_expected || 0), 0);
  const received = data.line_items.reduce((sum, line) => sum + (line.quantity_received || 0), 0);
  const currency = data.po?.currency ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordGroup
        testId="incoming-record-items"
        title={
          data.line_items.length
            ? `Items · ${data.line_items.length} · received ${received}/${ordered}`
            : `Items · ${lines.length}`
        }
      >
        {data.line_items.length
          ? data.line_items.map((line, index) => (
              <IncomingItem
                key={line.receiving_line_id ?? line.line_item_id ?? index}
                title={resolveSkuIdentityTitle({
                  zoho_item_title: byLineId.get(line.receiving_line_id ?? -1)?.zoho_item_title,
                  catalog_product_title: byLineId.get(line.receiving_line_id ?? -1)?.catalog_product_title,
                  item_name: line.name ?? byLineId.get(line.receiving_line_id ?? -1)?.item_name,
                  sku: line.sku,
                }) || `Line ${index + 1}`}
                sku={line.sku}
                received={line.quantity_received}
                expected={line.quantity_expected}
                unitCost={fmtMoney(line.rate == null ? null : String(line.rate), currency)}
                lineTotal={fmtMoney(line.item_total == null ? null : String(line.item_total), currency)}
                workflow={line.workflow_status}
                listing={line.listing_url}
                description={line.description}
                row={byLineId.get(line.receiving_line_id ?? -1) ?? null}
                current={line.receiving_line_id === row.id}
              />
            ))
          : lines.map((line) => (
              <IncomingItem
                key={line.id}
                title={resolveSkuIdentityTitle(line) || `Line ${line.id}`}
                sku={line.sku}
                received={line.quantity_received ?? 0}
                expected={line.quantity_expected ?? 0}
                unitCost={fmtMoney(line.unit_price ?? null, currency)}
                lineTotal={null}
                workflow={line.workflow_status ?? null}
                listing={line.listing_url ?? null}
                description={line.zoho_notes ?? null}
                row={line}
                current={line.id === row.id}
              />
            ))}
      </RecordGroup>

      <ReceivingFulfilment steps={steps} testId="incoming-record-fulfilment" />

      {!data.po?.zoho_purchaseorder_id && !data.inbound ? (
        <RecordGroup title="Pair to a purchase order" testId="incoming-record-pairing">
          <div className="px-4 pb-4">
            <PairingTab
              data={data}
              seedRow={row}
              focusReceivingId={target?.receivingId ?? null}
              focusReceivingLineId={target?.receivingLineId ?? null}
              onPaired={controller.invalidateIncoming}
            />
          </div>
        </RecordGroup>
      ) : null}

      <RecordGroup title="Carrier trail" testId="incoming-record-carrier">
        <div className="px-4 pb-4">
          <ShipmentTab data={data} />
        </div>
      </RecordGroup>

      <RecordGroup title="Activity" testId="incoming-record-activity">
        <div className="px-4 pb-4">
          <ActivityTab data={data} />
          {data.zoho_activity.length ? (
            <ol className="mt-3 flex flex-col border-t border-mode-fact">
              {data.zoho_activity.map((event, index) => (
                <li key={`${event.timestamp}:${index}`} className="border-b border-mode-fact py-2 text-role-data last:border-b-0">
                  <p className={RECORD_LABEL_CLASS}>
                    {fmtDateTime(event.timestamp)} · {event.label}
                  </p>
                  {event.description ? <p className="whitespace-pre-wrap text-mode-muted">{event.description}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </RecordGroup>

      {data.po ? (
        <RecordGroup title="Email" testId="incoming-record-email">
          <div className="px-4 pb-4">
            <EmailTab data={data} />
          </div>
        </RecordGroup>
      ) : null}
    </div>
  );
}
