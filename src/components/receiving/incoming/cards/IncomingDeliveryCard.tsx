'use client';

/**
 * One DELIVERY CARD on the Inbound triage list — the receiving family's
 * adapter over the shared {@link RecordCard} (the To-ship order card's twin).
 * The anatomy, motion and disclosure are RecordCard's; this file only hands
 * it the purchase ({@link receiptRecordCard}), the PO handle and the quick look.
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

/** Quick look (Space): what the card leaves out — the full tracking, carrier, source and dates. */
function ReceiptCardPeek({ model }: { model: ReceiptCardModel }) {
  const lead = model.lead;
  const facts: [string, string | null][] = [
    ['Tracking', lead.tracking_number],
    ['Carrier', lead.carrier],
    ['Source', model.source],
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
      identity={<span className="truncate" title={model.identity}>PO {model.identity}</span>}
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
