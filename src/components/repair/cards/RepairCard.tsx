'use client';

/**
 * One REPAIR CARD — the repair family's face over the shared {@link RecordCard}
 * (owner 2026-09-29): the ticket (and carton) · channel · customer on line 1,
 * the inline status control and the SLA top-right; the device on line 2; the
 * issue leading line 3 (· price · date · receiver) and the serial at the
 * card's bottom-right. Facts come from `repairCardModel`.
 */

import { memo, useMemo } from 'react';
import { Store, Truck } from '@/components/Icons';
import { TicketChip } from '@/components/ui/CopyChip';
import { CollapseItem } from '@/design-system/components/Collapse';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { RecordFactPaint } from '@/design-system/components/record-card/record-fact';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import type { RepairCardModel } from '@/lib/repair/repair-card-model';
import { REPAIR_QUEUE_VIEW } from '@/lib/triage/views';
import { cn } from '@/utils/_cn';
import { formatPhoneNumber } from '@/utils/phone';
import { RepairStatusControl } from './RepairStatusControl';

/** Quick look (Space): what the face leaves out — contact, links, the full issue. */
function RepairCardPeek({ model }: { model: RepairCardModel }) {
  const lead = model.lead;
  const contact = resolveRepairContact(lead);
  const facts: [string, string | null][] = [
    ['Phone', contact.phone ? formatPhoneNumber(contact.phone) : null],
    ['Email', contact.email],
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

/** The face's slot props plus the card's one write: its status. */
export interface RepairCardProps extends TriageCardSlotProps<RSRecord, RepairCardModel> {
  onChangeStatus: (repair: RSRecord, next: string) => void;
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
  onChangeStatus,
}: RepairCardProps) {
  const record = useMemo<RecordCardModel>(() => {
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
    </span>
  );
  const status = (
    <RepairStatusControl
      status={model.lead.status}
      onPick={(next) => onChangeStatus(model.lead, next)}
      testId={`${REPAIR_QUEUE_VIEW.testIdPrefix}-status-control`}
    />
  );
  // Bottom-right, where the orders' next step sits: the serial the bench reads off the device.
  const serial = (
    <span className={cn(CARD_FACT_BOX_CLASS, 'whitespace-nowrap text-[13px]')} data-testid={`${REPAIR_QUEUE_VIEW.testIdPrefix}-serial`}>
      <RecordFactPaint face={model.serial} />
    </span>
  );
  return (
    <RecordCard
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
      trailing={{ role: 'trailing', content: status }}
      action={serial}
      quickLook={<RepairCardPeek key="peek" model={model} />}
    />
  );
});
