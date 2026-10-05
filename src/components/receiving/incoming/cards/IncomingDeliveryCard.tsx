'use client';

/**
 * One DELIVERY CARD on the Inbound triage list — the receiving family's
 * adapter over the shared {@link RecordCard} (the To-ship order card's twin).
 * The anatomy, motion and disclosure are RecordCard's; this file only hands
 * it the purchase ({@link receiptRecordCard}), its `OperationalIdentity` and the quick look.
 * A line inside an unfolded card opens that line; the check selects every line.
 */

import { memo, useMemo } from 'react';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { CollapseItem } from '@/design-system/components/Collapse';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { receiptRecordCard, type ReceiptCardModel } from './receipt-card-model';
import { OperationalIdentityChip } from '@/design-system/components/OperationalIdentityChip';
import { INBOUND_SOURCE_LABELS, isRegisteredInboundSource } from '@/lib/inbound/source-registry';

/**
 * Quick look (Space): what the card leaves out — the PO behind a marketplace order (detail-only),
 * platform · vendor · account · source type as separate facts, the full tracking, carrier and dates.
 */
export function ReceiptCardPeek({ model }: { model: ReceiptCardModel }) {
  const lead = model.lead;
  const sourceType = String(lead.inbound_source_type ?? '').trim().toLowerCase();
  const facts: [string, string | null][] = [
    ['PO', model.identity.fallback?.value ?? null],
    ['Platform', model.identity.platform?.label ?? null],
    ['Vendor', model.vendor],
    ['Account', lead.platform_account_label ?? null],
    ['Source', isRegisteredInboundSource(sourceType) ? INBOUND_SOURCE_LABELS[sourceType] : null],
    ['Tracking', lead.tracking_number],
    ['Carrier', lead.carrier],
    ['Zoho status', lead.zoho_status ?? null],
    ['PO date', lead.po_date ? fmtDate(lead.po_date) : null],
    ['Expected', lead.expected_delivery_date ? fmtDate(lead.expected_delivery_date) : null],
    ['Delivered', lead.delivered_at ? fmtDate(lead.delivered_at) : null],
  ];
  return (
    <CollapseItem>
      <dl data-testid="incoming-delivery-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-[13px]">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-muted">{label}</dt>
              <dd className="min-w-0 truncate font-medium text-text-default">{value}</dd>
            </div>
          ))}
      </dl>
    </CollapseItem>
  );
}

export const IncomingDeliveryCard = memo(function IncomingDeliveryCard({
  model,
  checked,
  open,
  openId,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
}: TriageCardSlotProps<ReceivingLineRow, ReceiptCardModel>) {
  const record = useMemo(() => receiptRecordCard(model), [model]);
  return (
    <RecordCard
      view={INCOMING_PIPELINE_VIEW}
      model={record}
      factColumns={INCOMING_PIPELINE_VIEW.facts}
      testIdPrefix={INCOMING_PIPELINE_VIEW.testIdPrefix}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(model.lead, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{ role: 'identity', content: <OperationalIdentityChip identity={model.identity} presentation="full" /> }}
      trailing={null}
      quickLook={<ReceiptCardPeek key="peek" model={model} />}
      // Each line of a purchase is a record of its own: it opens alone.
      onOpenLine={(lineId, event) => {
        const row = model.rows.find((candidate) => candidate.id === lineId);
        if (row) onOpen(row, event);
      }}
      openLineId={open ? openId : null}
    />
  );
});
