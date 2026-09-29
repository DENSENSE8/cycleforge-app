'use client';

/**
 * One RECEIPT CARD on Inbound › History — the receiving-history family's
 * adapter over the shared {@link RecordCard}: one carton, its lines as
 * "+N items", each line opening on its own in the carton record.
 */

import { memo, useMemo } from 'react';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { CollapseItem } from '@/design-system/components/Collapse';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { INCOMING_DOCKED_VIEW } from '@/lib/triage/views';
import { cartonRecordCard, type CartonCardModel } from './carton-card-model';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaBrandDot } from '@/lib/source-platform';

/** Quick look (Space): only what the face leaves out — who did each step and when, the carton, full tracking. */
function CartonCardPeek({ model }: { model: CartonCardModel }) {
  const lead = model.lead;
  const stamp = (at: string | null | undefined, by: string | null | undefined) =>
    at ? `${fmtDate(at)}${by ? ` · ${by}` : ''}` : null;
  const carton = lead.receiving_id != null ? String(lead.receiving_id) : null;
  const facts: [string, string | null][] = [
    // The face's id is the carton number only when it has no PO / order #.
    ['Carton', carton === model.identity ? null : carton],
    ['Scanned', stamp(lead.scanned_at, lead.scanned_by_name)],
    ['Unboxed', stamp(lead.unboxed_at, lead.unboxed_by_name)],
    ['Received', stamp(lead.received_done_at ?? lead.received_at, lead.received_by_name)],
    ['Tracking', lead.tracking_number],
    ['Carrier', lead.carrier],
  ];
  return (
    <CollapseItem>
      <dl data-testid="receipt-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-[13px]">
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

export const CartonCard = memo(function CartonCard({
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
}: TriageCardSlotProps<ReceivingLineRow, CartonCardModel>) {
  const platformMeta = usePlatformMeta();
  const record = useMemo(() => {
    const meta = model.platform ? platformMeta(model.platform) : null;
    return {
      ...cartonRecordCard(model),
      // Same face as the outbound cards: brand dot + the catalog's platform name.
      channel: meta?.value
        ? { label: meta.label, tooltip: meta.label, dot: <BrandIdentityDot {...platformMetaBrandDot(meta)} />, badge: null }
        : null,
    };
  }, [model, platformMeta]);
  return (
    <RecordCard
      model={record}
      factColumns={INCOMING_DOCKED_VIEW.facts}
      testIdPrefix={INCOMING_DOCKED_VIEW.testIdPrefix}
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
      quickLook={<CartonCardPeek key="peek" model={model} />}
      onOpenLine={(lineId, event) => {
        const row = model.rows.find((candidate) => candidate.id === lineId);
        if (row) onOpen(row, event);
      }}
      openLineId={open ? openId : null}
    />
  );
});
