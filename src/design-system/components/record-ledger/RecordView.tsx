'use client';

/**
 * The RECORD — ONE record view for every desk record (owner 2026-09-29):
 * inbound deliveries and cartons, local pickups, repair tickets, QC units.
 * Built on the outbound order record's anatomy (`OrderRecordView`):
 *
 *   main  — the band FIRST (`internalLabel`: ONE orange current-status pill;
 *           External (carrier scans, or the domain's own node) · Internal
 *           step ladder · Both; each rail pinned to its newest step) → Items
 *           (`RecordItem` + price footer) → Serial numbers → Staff notes.
 *   aside — the evidence door → alerts → party → hairline → movement.
 *
 * Verbs live in the record header (`RecordActionStrip face="header"`); a verb's
 * secondary evidence swaps this body for its panel with Back — never an
 * inline disclosure. Test ids derive from `testId` (`<prefix>-items`, …).
 */

import { useState, type ReactNode } from 'react';
import { Calendar, ExternalLink, Tag } from '@/components/Icons';
import { SerialChip } from '@/components/ui/CopyChip';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { ExternalLinkActionIcon } from '@/design-system/components/ExternalLinkActionIcon';
import { RecordFlowFacts, RecordFlowSection, recordFlowLabels } from '@/design-system/components/RecordFlowFacts';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { CarrierEventsRail } from '@/design-system/components/record-ledger/CarrierEventsRail';
import { DeliveryPromise } from '@/design-system/components/record-ledger/DeliveryPromise';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { InlineStageAssign } from '@/design-system/components/record-ledger/InlineStageAssign';
import { LatestEdgeScroller } from '@/design-system/components/record-ledger/LatestEdgeScroller';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordFulfillmentSources } from '@/design-system/components/record-ledger/RecordFulfillmentSources';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RecordItem, RecordItemCost, RecordItemValue } from '@/design-system/components/record-ledger/RecordItem';
import { RecordPriceBreakdown } from '@/design-system/components/record-ledger/RecordPriceBreakdown';
import { RecordSerials } from '@/design-system/components/record-ledger/RecordSerials';
import { StepRail, type RailStep, type StepState } from '@/design-system/components/record-ledger/StepRail';
import {
  recordMoney,
  type RecordFact,
  type RecordModel,
  type RecordModelItem,
  type RecordPanel,
  type RecordStep,
  type RecordStepState,
} from '@/design-system/components/record-ledger/record-model';
import { Button } from '@/design-system/primitives';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  RECORD_CONDITION_CHIP_CLASS,
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_TRAILING_ACTION_CLASS,
} from '@/design-system/tokens/record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { conditionGradeTone } from '@/lib/condition-tone';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import { formatDateKeyShort, formatMonthDayTimePST, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

const dot = <span className="size-1 shrink-0 rounded-mode-pill bg-mode-edge" aria-hidden />;

/**
 * The record header's title — `number · platform or channel · date` (+ the
 * ticket chip), like `OrderRecordTitle`.
 * An exception is a state (status pill, alerts), never a header word.
 */
export function RecordTitle({ title, testId = 'record-title' }: { title: RecordModel['title']; testId?: string }) {
  const meta = sourcePlatformMeta(title.platform);
  const channel = meta.value ? meta.label : (title.channel ?? null);
  return (
    <span className="flex min-w-max flex-nowrap items-center gap-1 whitespace-nowrap" data-testid={testId}>
      <span className="shrink-0 select-all">{title.ref}</span>
      {channel ? (
        <>
          {dot}
          <span className="shrink-0 text-role-data font-medium normal-case tracking-normal text-mode-muted" data-testid={`${testId}-platform`}>
            {channel}
          </span>
        </>
      ) : null}
      {title.date ? (
        <>
          {dot}
          <span className="shrink-0 text-role-data font-medium tabular-nums text-mode-muted" title={title.date.tip}>
            {title.date.label}
          </span>
        </>
      ) : null}
      {title.ticket ? (
        <>
          {dot}
          {title.ticket.href ? (
            <a
              href={title.ticket.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex shrink-0 items-center gap-1 text-role-data font-medium normal-case text-mode-ink hover:underline', focusRing('control'))}
              data-testid={`${testId}-ticket`}
            >
              {title.ticket.label}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="shrink-0 text-role-data font-medium text-mode-ink" data-testid={`${testId}-ticket`}>
              {title.ticket.label}
            </span>
          )}
        </>
      ) : null}
    </span>
  );
}

/** A step that was never stamped, but the record is past it. */
const UNSTAMPED_META: Readonly<Record<Exclude<RecordStepState, 'done' | 'partial'>, string>> = {
  todo: 'Not yet',
  unrecorded: 'Not recorded',
};

/** `By <who> · <date, time>` — a calendar-day stamp paints no time. */
function stepStamp(step: RecordStep): string {
  const at = step.at ? (step.dateOnly ? formatDateKeyShort(toPSTDateKey(step.at)) : formatMonthDayTimePST(step.at)) : null;
  return [step.who ? `By ${step.who}` : null, at].filter(Boolean).join(' · ');
}

/**
 * The ladder as rail steps. "Now" is the first step after the furthest one
 * stamped (a partly done step is itself "now"); a skipped step behind it stays
 * dashed, never ringed.
 */
function internalRailSteps(steps: readonly RecordStep[], assign: { stepKey: string; control: ReactNode } | null, prefix: string): RailStep[] {
  const lastDone = steps.reduce((last, step, i) => (step.state === 'done' || step.state === 'partial' ? i : last), -1);
  const partialAt = steps.findIndex((step) => step.state === 'partial');
  const currentIndex = partialAt >= 0 ? partialAt : lastDone + 1;
  return steps.map((step, i): RailStep => {
    const state: StepState = step.state === 'done' ? 'done' : i === currentIndex ? 'current' : 'pending';
    const stamped = stepStamp(step);
    // A done step with no stamp reads its detail alone, never "Done · …".
    const meta =
      step.state === 'done' || step.state === 'partial'
        ? [stamped || (step.detail ? null : step.state === 'done' ? 'Done' : 'Partly done'), step.detail].filter(Boolean).join(' · ')
        : [UNSTAMPED_META[step.state], step.detail].filter(Boolean).join(' · ');
    return {
      id: step.key,
      icon: step.icon,
      state,
      tone: step.tone,
      title: step.label,
      meta: assign && step.key === assign.stepKey && step.state !== 'done' ? assign.control : meta,
      testId: `${prefix}-step-${step.key}`,
    };
  });
}

function InternalRail({ model, prefix }: { model: RecordModel; prefix: string }) {
  const { getStaffName } = useStaffNameMap();
  const assign = model.stepAssign;
  // A commit reads at once until the refreshed read carries it.
  const [pending, setPending] = useState<{ key: string; staffId: number | null } | null>(null);
  const staffId = pending && pending.key === model.key ? pending.staffId : (assign?.staffId ?? null);
  const control = assign ? (
    <InlineStageAssign
      label={assign.label}
      role={assign.role}
      selectedStaffId={staffId}
      assignedName={staffId ? getStaffName(staffId) : null}
      onCommit={(next) => {
        setPending({ key: model.key, staffId: next });
        assign.onCommit(next).catch((error: unknown) => {
          setPending(null);
          toast.error(error instanceof Error ? error.message : `Could not assign the ${assign.label}`);
        });
      }}
      testId={`${prefix}-assign-${assign.stepKey}`}
    />
  ) : null;
  if (model.internal.length === 0) {
    return <p className="px-4 py-3 text-role-caption text-mode-muted">Nothing on the floor yet.</p>;
  }
  const rail = internalRailSteps(model.internal, assign ? { stepKey: assign.stepKey, control } : null, prefix);
  // Pinned to the newest step started — the rail's latest edge.
  const latest = rail.findLast((step) => step.state !== 'pending') ?? rail.at(-1);
  return (
    <div className="min-w-0 px-4 py-3" data-testid={`${prefix}-internal`}>
      <LatestEdgeScroller latestKey={latest?.id ?? null} testId={`${prefix}-internal-scroll`}>
        <StepRail steps={rail} size="lg" label={`${model.internalLabel} steps`} orientation="horizontal" horizontalScroll />
      </LatestEdgeScroller>
    </div>
  );
}

export function RecordFacts({ facts }: { facts: readonly RecordFact[] }) {
  return (
    <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
      {facts.map((fact, index) => (
        <EvidenceFactRow key={`${fact.label}:${index}`} label={fact.label} wide={fact.wide}>
          {fact.wide ? <p className="whitespace-pre-wrap break-words">{fact.value}</p> : fact.value}
        </EvidenceFactRow>
      ))}
    </div>
  );
}

/** One item on the shared {@link RecordItem} ruler: SKU | Item #, Cond | Qty, Serial | Cost. */
function ModelItem({ item, model, prefix }: { item: RecordModelItem; model: RecordModel; prefix: string }) {
  const { currency, refresh } = model;
  return (
    <RecordItem
      testId={`${prefix}-item`}
      title={item.title}
      current={item.current}
      count={
        item.received != null || item.expected != null ? (
          <span className={item.short ? 'text-mode-warn' : 'text-mode-ink'} title="Received / expected" data-testid={`${prefix}-item-qty`}>
            {item.received ?? 0}/{item.expected ?? '?'}
          </span>
        ) : undefined
      }
      photo={{
        src: item.photoUrl,
        upload: item.skuCatalogId
          ? { skuCatalogId: item.skuCatalogId, onUploaded: refresh ?? undefined, capture: model.capturePhotos }
          : null,
      }}
      sku={item.sku}
      item={{
        value: <RecordItemValue value={item.listing?.itemNumber} historyKind="Item number" />,
        actions: item.listing?.href ? (
          <ExternalLinkActionIcon
            href={item.listing.href}
            ariaLabel="Open listing"
            title="Open listing"
            radius="control"
            className={cn(RECORD_TRAILING_ACTION_CLASS, focusRing('control'))}
          />
        ) : null,
        testId: `${prefix}-item-number`,
      }}
      left={[
        ...(item.condition
          ? [
              {
                label: 'Cond',
                testId: `${prefix}-item-condition`,
                value: (
                  <span className={cn(RECORD_CONDITION_CHIP_CLASS, 'w-auto', conditionGradeTone(item.conditionGrade).text)}>
                    <Tag className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{item.condition}</span>
                  </span>
                ),
              },
            ]
          : []),
        ...(item.serials.length > 0
          ? [
              {
                label: item.serials.length === 1 ? 'Serial' : 'Serials',
                testId: `${prefix}-item-serials`,
                wrap: true,
                value: item.serials.map((serial) => <SerialChip key={serial} value={serial} dense width="w-auto max-w-full" />),
              },
            ]
          : []),
      ]}
      right={[
        ...(item.expected != null || item.received != null
          ? [{ label: 'Qty', value: <span className={cn(RECORD_ID_CLASS, 'text-mode-ink')}>{item.expected ?? item.received}</span> }]
          : []),
        ...(item.cost
          ? [
              {
                label: 'Cost',
                value: (
                  <RecordItemCost
                    unit={item.cost.unit}
                    qty={item.cost.qty}
                    total={item.cost.total}
                    format={(value) => recordMoney(value, currency)}
                    testId={`${prefix}-item-price`}
                  />
                ),
              },
            ]
          : []),
      ]}
    >
      {item.extra}
      {item.serialNote ? (
        <p role="status" className="text-role-caption text-mode-warn">
          {item.serialNote}
        </p>
      ) : null}
      {item.facts.length > 0 ? (
        <div className="pb-2 [&>div]:px-0" data-testid={`${prefix}-item-facts`}>
          <RecordFacts facts={item.facts} />
        </div>
      ) : null}
    </RecordItem>
  );
}

export function RecordView({ model, panel, testId = 'record' }: { model: RecordModel; panel: RecordPanel | null; testId?: string }) {
  const prefix = testId;
  const flow = recordFlowLabels(model.flow);
  const statusTone = STATE_TONE_CLASSES[model.status.tone ?? 'warning'];

  if (panel) {
    return (
      <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid={`${prefix}-view`} data-panel="">
        <DeskRecordLayout
          main={
            <RecordGroup
              title={panel.title}
              testId={`${prefix}-panel`}
              action={
                <Button type="button" variant="ghost" size="sm" onClick={panel.onBack} data-testid={`${prefix}-panel-back`}>
                  Back
                </Button>
              }
            >
              <div className="px-4 pb-4 pt-1">{panel.body}</div>
            </RecordGroup>
          }
        />
      </div>
    );
  }

  const external = model.external
    ? 'node' in model.external
      ? model.external.node
      : (
          <CarrierEventsRail
            events={model.external.events}
            carrier={model.external.carrier}
            loading={model.external.loading}
            error={model.external.error}
            testId={`${prefix}-carrier-events`}
          />
        )
    : null;

  const band = (
    <RecordGroup
      title={model.internalLabel}
      titleAccessory={
        // One state face in the work band; the domain selects its lifecycle tone.
        <span
          className={cn('inline-flex h-6 min-w-0 items-center gap-1.5 rounded-mode-pill px-2 text-role-data font-semibold', statusTone.pill)}
          title={model.status.detail ?? `Current status: ${model.status.label}`}
          aria-label={`Current status: ${model.status.label}`}
          data-testid={`${prefix}-current-status`}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', statusTone.dot)} aria-hidden />
          <span className="truncate">{model.status.label}</span>
        </span>
      }
      action={
        model.dates.length > 0 || model.promise?.estimatedDeliveryAt ? (
          <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap" data-testid={`${prefix}-dates`}>
            {model.dates.map((date, index) => (
              <span key={date.label} className="inline-flex min-w-0 items-center gap-1.5 text-mode-muted" title={date.tip}>
                {index > 0 ? <span className="size-1 shrink-0 rounded-full bg-mode-edge" aria-hidden /> : null}
                {index === 0 ? <Calendar className="size-3.5 shrink-0" aria-hidden /> : null}
                <span className={cn(RECORD_LABEL_CLASS, 'hidden shrink-0 @sm:inline')}>{date.label}</span>
                <span className="text-role-caption tabular-nums text-mode-ink">{date.value}</span>
              </span>
            ))}
            {model.promise?.estimatedDeliveryAt ? (
              <>
                {model.dates.length > 0 ? <span className="size-1 shrink-0 rounded-full bg-mode-edge" aria-hidden /> : null}
                <DeliveryPromise promise={model.promise} testId={`${prefix}-promise`} />
              </>
            ) : null}
          </span>
        ) : undefined
      }
      testId={`${prefix}-band`}
      singleLineHeader
    >
      <RecordFulfillmentSources key={model.key} flow={model.flow} internal={<InternalRail model={model} prefix={prefix} />} external={external} />
    </RecordGroup>
  );

  const items = model.items;
  const alerts =
    model.loadFailed || model.exception || model.alerts.length > 0 ? (
      <div className={DESK_RECORD_COLUMN_CARD_CLASS} data-testid={`${prefix}-alerts`}>
        {model.loadFailed ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <EvidenceNotice tone="warn">{model.loadFailed.message}</EvidenceNotice>
            </div>
            <Button variant="secondary" size="sm" className="mr-3" onClick={model.loadFailed.retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {model.exception ? (
          <EvidenceNotice tone="warn">
            <span data-testid={`${prefix}-exception`}>
              <b className="font-semibold">{model.exception.why}</b> → {model.exception.next}
            </span>
          </EvidenceNotice>
        ) : null}
        {model.alerts.map((alert) => (
          <EvidenceNotice key={alert.key} tone="warn">
            <span data-alert={alert.key}>{alert.label}</span>
          </EvidenceNotice>
        ))}
      </div>
    ) : null;

  const main = (
    <div className="flex flex-col gap-4">
      {band}
      <RecordGroup
        title={[`Items${items && items.length > 1 ? ` · ${items.length}` : ''}`, model.itemsSummary].filter(Boolean).join(' · ')}
        action={model.itemsHeader}
        testId={`${prefix}-items`}
      >
        {items == null ? (
          <div className="p-3">
            <SkeletonList count={3} type="row" />
          </div>
        ) : (
          items.map((item) => <ModelItem key={item.key} item={item} model={model} prefix={prefix} />)
        )}
        {model.itemsNotice ? <EvidenceNotice>{model.itemsNotice}</EvidenceNotice> : null}
        {model.price ? (
          <RecordPriceBreakdown rows={model.price.rows} format={(value) => recordMoney(value, model.currency)} testId={`${prefix}-price`} />
        ) : null}
      </RecordGroup>
      <RecordSerials rows={model.serials} expected={model.expectedUnits} testId={`${prefix}-serials`} />
      {model.activity && model.activity.length > 0 ? (
        <RecordGroup title={model.activityTitle ?? 'Activity'} testId={`${prefix}-activity`}>
          <RecordFacts facts={model.activity} />
        </RecordGroup>
      ) : null}
      {model.staffNote || model.notes.length > 0 ? (
        <RecordGroup title="Staff notes" testId={`${prefix}-notes`}>
          {model.notes.length > 0 ? <RecordFacts facts={model.notes} /> : null}
          {model.staffNote ? <div className="px-4 pb-3">{model.staffNote}</div> : null}
        </RecordGroup>
      ) : null}
    </div>
  );

  const aside = (
    <div className="flex flex-col gap-4">
      {/* The evidence door — always here, above the facts, so it is learnt. */}
      {model.photos}
      {alerts}
      <RecordFlowFacts
        direction={model.flow}
        testId={`${prefix}-flow`}
        party={
          model.party.length > 0 ? (
            <RecordFlowSection title={model.partyTitle ?? flow.party} testId={`${prefix}-party`}>
              <RecordFacts facts={model.party} />
            </RecordFlowSection>
          ) : undefined
        }
        movement={
          <RecordFlowSection title={model.movementTitle ?? flow.movement} testId={`${prefix}-movement`}>
            <RecordFacts facts={model.movement} />
          </RecordFlowSection>
        }
      />
    </div>
  );

  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid={`${prefix}-view`}>
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}
