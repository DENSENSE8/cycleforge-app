'use client';

/**
 * One REPAIR CARD — the repair family's face over the shared {@link RecordCard}
 * (owner 2026-09-29; retailored 2026-10-04): the ticket, carton and serial ·
 * channel · customer on line 1 and the SLA top-right; the issue as the
 * headline; the device, date and receiver under it. The status is the rail and
 * glyph only — it changes on the open record, never on the card. Facts come
 * from `repairCardModel`.
 */

import { memo, useMemo } from 'react';
import { Store, Truck } from '@/components/Icons';
import { SerialChip, TicketChip } from '@/components/ui/CopyChip';
import { CollapseItem } from '@/design-system/components/Collapse';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import type { RepairCardModel } from '@/lib/repair/repair-card-model';
import { repairPriceDisplay } from '@/lib/repair/repair-queue-model';
import { REPAIR_QUEUE_VIEW } from '@/lib/triage/views';
import { formatPhoneNumber } from '@/utils/phone';

/** Quick look (Space): what the face leaves out — contact, price, links, the full issue. */
export function RepairCardPeek({ model }: { model: RepairCardModel }) {
  const lead = model.lead;
  const contact = resolveRepairContact(lead);
  const facts: [string, string | null][] = [
    ['Phone', contact.phone ? formatPhoneNumber(contact.phone) : null],
    ['Email', contact.email],
    ['Price', repairPriceDisplay(lead)],
    ['SKU', lead.source_sku?.trim() || null],
    ['Order', lead.source_order_id?.trim() || null],
    ['Tracking', lead.source_tracking_number?.trim() || null],
    ['Issue', lead.issue?.trim() || null],
    ['Notes', lead.notes?.trim() || null],
  ];
  return (
    <CollapseItem>
      <dl data-testid="repair-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-role-data">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-muted">{label}</dt>
              <dd className="min-w-0 whitespace-pre-line break-words font-medium text-text-default">{value}</dd>
            </div>
          ))}
      </dl>
    </CollapseItem>
  );
}

export const RepairCard = memo(function RepairCard({
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
}: TriageCardSlotProps<RSRecord, RepairCardModel>) {
  const record = useMemo<ViewCardModel<typeof REPAIR_QUEUE_VIEW>>(() => {
    const channel = model.record.channel;
    if (!channel) return model.record;
    const Glyph = model.channel === 'shipment' ? Truck : Store;
    return { ...model.record, channel: { ...channel, dot: <Glyph aria-hidden className="size-3.5 shrink-0 text-text-muted" /> } };
  }, [model]);
  const { ticket, carton } = model.handles;
  const identity = (
    <span className="flex min-w-0 items-center gap-1.5" data-testid="repair-card-handles">
      {ticket ? (
        <TicketChip value={ticket} display={`#${ticket}`} dense disableTooltip />
      ) : (
        <span className="whitespace-nowrap font-normal text-text-muted">No ticket #</span>
      )}
      {carton ? (
        <span className="whitespace-nowrap text-text-muted" data-handle="carton" title="Receiving carton">
          {carton}
        </span>
      ) : null}
      {model.serial ? <SerialChip value={model.serial} width="w-fit shrink-0" dense /> : null}
    </span>
  );
  return (
    <RecordCard
      view={REPAIR_QUEUE_VIEW}
      model={record}
      factColumns={REPAIR_QUEUE_VIEW.facts}
      testIdPrefix={REPAIR_QUEUE_VIEW.testIdPrefix}
      rowAttrs={{ 'data-repair-id': model.lead.id }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(model.lead, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{ role: 'identity', content: identity }}
      trailing={null}
      quickLook={<RepairCardPeek key="peek" model={model} />}
    />
  );
});
