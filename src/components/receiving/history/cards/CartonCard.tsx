'use client';

/**
 * One RECEIPT CARD on Inbound › History — the receiving-history family's
 * adapter over the shared {@link RecordCard}: one carton, its lines as
 * "+N items", each line opening on its own in the carton record.
 */

import { memo, useMemo, type ReactNode } from 'react';
import { StaffCell } from '@/components/identity/StaffCell';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { CollapseItem } from '@/design-system/components/Collapse';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { INCOMING_UNBOXED_VIEW } from '@/lib/triage/views';
import { cartonRecordCard, type CartonCardModel, type CartonCardView } from './carton-card-model';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';

/** Quick look (Space): only what the face leaves out — who did each step and when, the carton, full tracking. */
export function CartonCardPeek({ model }: { model: CartonCardModel }) {
  const lead = model.lead;
  // Who did a step, in their colour: the stamp's staff id + name (`StaffCell`).
  const stamp = (at: string | null | undefined, staffId: number | null | undefined, name: string | null | undefined): ReactNode =>
    at ? (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{fmtDate(at)}</span>
        <StaffCell staffId={staffId} name={name} />
      </span>
    ) : null;
  const carton = lead.receiving_id != null ? String(lead.receiving_id) : null;
  const facts: [string, ReactNode][] = [
    // Carton remains useful whether the face leads with an order or tracking.
    ['Carton', carton],
    ['Scanned', stamp(lead.scanned_at, lead.scanned_by_id, lead.scanned_by_name)],
    ['Unboxed', stamp(lead.unboxed_at, lead.unboxed_by_id, lead.unboxed_by_name)],
    ['Received', stamp(lead.received_done_at ?? lead.received_at, lead.received_by_id, lead.received_by_name)],
    ['Tracking', lead.tracking_number],
    ['Carrier', lead.carrier],
  ];
  return (
    <CollapseItem>
      <dl data-testid="receipt-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-role-data">
        {facts
          .filter(([, value]) => Boolean(value))
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

type ReceivingCartonCardProps = TriageCardSlotProps<ReceivingLineRow, CartonCardModel> & {
  view?: CartonCardView;
};

/** Shared multi-height carton face. The view supplies only its semantic contract/test ids. */
export const ReceivingCartonCard = memo(function ReceivingCartonCard({
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
  view = INCOMING_UNBOXED_VIEW,
}: ReceivingCartonCardProps) {
  const platformMeta = usePlatformMeta();
  const record = useMemo(() => {
    const meta = model.platform ? platformMeta(model.platform) : null;
    // Same face as the outbound cards: brand dot + the catalog's platform name.
    const channel = meta?.value
      ? { label: meta.label, tooltip: meta.label, dot: <BrandIdentityDot {...platformMetaBrandDot(meta)} />, badge: null }
      : null;
    return cartonRecordCard(model, channel);
  }, [model, platformMeta]);
  return (
    <RecordCard
      view={view}
      model={record}
      factColumns={view.facts}
      testIdPrefix={view.testIdPrefix}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(model.lead, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{
        role: 'identity',
        content: (
          <span className="flex min-w-0 items-center gap-1">
            {model.identityKind === 'order' ? (
              <OrderIdChip
                value={model.identity}
                dense
                plain
                truncateDisplay={false}
                fitDisplayWidth
              />
            ) : model.identityKind === 'tracking' && model.tracking ? (
              <span data-testid={`${view.testIdPrefix}-tracking`}>
                <TrackingChip value={model.tracking} carrierHint={model.lead.carrier} dense />
              </span>
            ) : (
              <span className="shrink-0 font-mono text-xs font-medium text-text-muted">Carton {model.identity}</span>
            )}
            {model.identityKind === 'order' && model.tracking ? (
              <span data-testid={`${view.testIdPrefix}-tracking`}>
                <TrackingChip value={model.tracking} carrierHint={model.lead.carrier} dense />
              </span>
            ) : null}
            {model.identityKind !== 'order' && model.orderId ? (
              <OrderIdChip
                value={model.orderId}
                dense
                plain
                truncateDisplay={false}
                fitDisplayWidth
              />
            ) : null}
          </span>
        ),
      }}
      trailing={
        model.topRight
          ? {
              role: 'trailing',
              content: (
                <span data-testid={`${view.testIdPrefix}-unboxed-by`} className="flex min-w-0 items-center gap-1.5 text-role-caption text-text-muted">
                  <span className="shrink-0">{model.topRight.label}</span>
                  {model.topRight.staffId != null || model.unboxedBy ? (
                    <StaffCell staffId={model.topRight.staffId} name={model.unboxedBy?.name} />
                  ) : (
                    model.topRight.value
                  )}
                </span>
              ),
            }
          : null
      }
      quickLook={<CartonCardPeek key="peek" model={model} />}
      onOpenLine={(lineId, event) => {
        const row = model.rows.find((candidate) => candidate.id === lineId);
        if (row) onOpen(row, event);
      }}
      openLineId={open ? openId : null}
    />
  );
});

/** Deliveries › Unboxed adapter over the shared carton face. */
export const CartonCard = memo(function CartonCard(
  props: TriageCardSlotProps<ReceivingLineRow, CartonCardModel>,
) {
  return <ReceivingCartonCard {...props} view={INCOMING_UNBOXED_VIEW} />;
});
