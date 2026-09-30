'use client';

import { memo, useMemo } from 'react';
import { CollapseItem } from '@/design-system/components/Collapse';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { PICKUP_HISTORY_VIEW } from '@/lib/triage/views';
import { pickupMoney } from '@/lib/receiving/pickup/pickup-lines';
import { pickupRecordCard, type PickupCardModel, type PickupOrderRecord } from '@/lib/receiving/pickup/pickup-card-model';

function PickupCardPeek({ model }: { model: PickupCardModel }) {
  const lead = model.line;
  const facts: [string, string | null][] = [
    ['Customer', model.customer],
    ['Reference', lead.reference_number],
    ['Receiving carton', lead.receiving_id == null ? null : String(lead.receiving_id)],
    ['Zoho status', lead.zoho_status],
    ['Items', String(model.itemCount)],
    ['Total', pickupMoney(String(model.totalValue))],
    ['Payment', model.paymentMethod],
    ['Paid', model.paidAmountCents == null ? null : pickupMoney(String(model.paidAmountCents / 100))],
  ];
  return (
    <CollapseItem>
      <dl data-testid="pickup-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-[13px]">
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

export const PickupCard = memo(function PickupCard({
  model,
  checked,
  open,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
}: TriageCardSlotProps<PickupOrderRecord, PickupCardModel>) {
  const record = useMemo(() => pickupRecordCard(model), [model]);
  return (
    <RecordCard
      model={record}
      factColumns={PICKUP_HISTORY_VIEW.facts}
      testIdPrefix={PICKUP_HISTORY_VIEW.testIdPrefix}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(model.lead, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{ role: 'identity', content: <span className="truncate" title={model.identity}>{model.identity}</span> }}
      trailing={null}
      quickLook={<PickupCardPeek key="peek" model={model} />}
      onOpenLine={(_lineId, event) => onOpen(model.lead, event)}
      openLineId={null}
    />
  );
});
