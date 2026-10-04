'use client';

/**
 * The body blocks of the phone inbound-order form: the order facts (platform,
 * number, vendor, urgency), items (each a `MobileRecordCard` that opens the
 * line sheet), tracking (scan or type), the "still needed" checklist that
 * names why the commit is disabled, and the landed screen.
 */

import { Check, Plus, ScanBarcode, Truck, X } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { IconButton, TextField } from '@/design-system/primitives';
import {
  formatInboundMoney,
  inboundLineName,
  inboundOrderCostTotal,
  inboundPriorityChoices,
  orderNumberLabel,
} from '@/lib/inbound/inbound-order-compose';
import { filledInboundLines, type InboundOrderDraft, type InboundOrderNeed } from '@/lib/inbound/inbound-order-draft';
import { InboundPickerRow, InboundRowButton, InboundRowText, InboundSectionHeading, INBOUND_ROW_CLASS } from './MobileV2InboundParts';

export const INBOUND_PRIORITY_CHOICES = inboundPriorityChoices();

export function InboundOrderFactsSection({
  draft,
  missing,
  platformLabel,
  identityLocked,
  onChange,
  onPick,
}: {
  draft: InboundOrderDraft;
  missing: readonly InboundOrderNeed[];
  platformLabel: string | null;
  /** Fixing a landed order: platform + number are its identity, shown not changed. */
  identityLocked: boolean;
  onChange: (patch: Partial<InboundOrderDraft>) => void;
  onPick: (picker: 'platform' | 'priority') => void;
}) {
  const needs = new Set(missing.map((m) => m.field));
  return (
    <>
      <InboundSectionHeading>Order</InboundSectionHeading>
      <InboundPickerRow
        label="Platform"
        value={platformLabel}
        placeholder="Who sold it"
        flagged={needs.has('platform') || needs.has('zoho_source')}
        locked={identityLocked}
        onOpen={() => onPick('platform')}
        testId="m-inbound-platform"
      />
      <div className="flex flex-col gap-3 border-b border-mode-rule px-mode-page py-3">
        <TextField
          label={`${orderNumberLabel(draft.type, draft.platform)} *`}
          value={draft.orderNumber}
          onChange={(orderNumber) => onChange({ orderNumber })}
          mono
          readOnly={identityLocked}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={needs.has('order_number') || undefined}
          data-testid="m-inbound-order-number"
        />
        <TextField label="Vendor / seller" value={draft.vendor} onChange={(vendor) => onChange({ vendor })} data-testid="m-inbound-vendor" />
      </div>
      <InboundPickerRow
        label="Urgency"
        value={INBOUND_PRIORITY_CHOICES.find((c) => c.value === draft.priority)?.label ?? draft.priority}
        placeholder="Auto"
        onOpen={() => onPick('priority')}
        testId="m-inbound-priority"
      />
    </>
  );
}

export function InboundItemsSection({
  draft,
  missing,
  onOpenLine,
}: {
  draft: InboundOrderDraft;
  missing: readonly InboundOrderNeed[];
  /** Index of the line to edit; null = a new line. */
  onOpenLine: (index: number | null) => void;
}) {
  const filled = new Set(filledInboundLines(draft));
  const lines = draft.lines.map((line, index) => ({ line, index })).filter(({ line }) => filled.has(line));
  const cost = inboundOrderCostTotal(draft);
  return (
    <>
      <InboundSectionHeading>{`Items · ${lines.length}`}</InboundSectionHeading>
      {lines.length ? (
        <div data-testid="m-inbound-items">
          <MobileRecordCardList>
            {lines.map(({ line, index }) => {
              const flagged = missing.some((m) => (m.field === 'line_identity' || m.field === 'quantity') && m.lines?.includes(index));
              const each = line.quantity != null && line.quantity > 1 ? ' each' : '';
              return (
                <MobileRecordCard
                  key={index}
                  identity={`Item ${index + 1}`}
                  title={inboundLineName(line)}
                  facts={line.sku.trim() && line.title.trim() ? [{ label: 'SKU', value: line.sku.trim() }] : undefined}
                  count={line.quantity == null ? 'Qty needed' : `Qty ${line.quantity}`}
                  amount={line.unitCostCents != null ? `${formatInboundMoney(line.unitCostCents, draft.currency)}${each}` : null}
                  status={flagged ? 'Needs fix' : null}
                  tone={flagged ? 'warn' : 'neutral'}
                  onOpen={() => onOpenLine(index)}
                  testId={`m-inbound-item-${index}`}
                />
              );
            })}
          </MobileRecordCardList>
        </div>
      ) : null}
      <ul aria-label="Item actions">
        <li>
          <InboundRowButton
            icon={<Plus />}
            onClick={() => onOpenLine(null)}
            testId="m-inbound-add-item"
            trailing={
              lines.length ? (
                <span className="shrink-0 font-mono text-role-caption text-mode-muted">
                  {formatInboundMoney(cost.subtotalCents, draft.currency)}
                  {cost.missingCost ? ` · ${cost.missingCost} uncosted` : ''}
                </span>
              ) : null
            }
          >
            <InboundRowText title="Add item" metaTone="warning" meta={missing.some((m) => m.field === 'lines') ? 'At least one item' : null} />
          </InboundRowButton>
        </li>
      </ul>
    </>
  );
}

export function InboundTrackingSection({
  draft,
  onScan,
  onRemove,
}: {
  draft: InboundOrderDraft;
  onScan: () => void;
  onRemove: (index: number) => void;
}) {
  const tracking = draft.tracking.map((t, index) => ({ ...t, index })).filter((t) => t.number.trim());
  return (
    <>
      <InboundSectionHeading>Tracking</InboundSectionHeading>
      <ul aria-label="Tracking numbers" data-testid="m-inbound-tracking">
        {tracking.map((t) => (
          <li key={t.index} className={`${INBOUND_ROW_CLASS} py-1`}>
            <Truck aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
            <span className="min-w-0 flex-1 break-all font-mono text-mode-body text-mode-ink">{t.number}</span>
            <IconButton size="touch" icon={<X className="h-4 w-4" />} ariaLabel={`Remove tracking ${t.number}`} onClick={() => onRemove(t.index)} />
          </li>
        ))}
        <li>
          <InboundRowButton icon={<ScanBarcode />} onClick={onScan} disabled={tracking.length >= 10} testId="m-inbound-scan-tracking">
            <InboundRowText title={tracking.length ? 'Scan another' : 'Scan or type tracking'} />
          </InboundRowButton>
        </li>
      </ul>
    </>
  );
}

export function InboundStillNeeded({ missing }: { missing: readonly InboundOrderNeed[] }) {
  if (missing.length === 0) return null;
  return (
    <ul className="space-y-1 px-mode-page py-3" aria-label="Still needed" data-testid="m-inbound-missing">
      {missing.map((need) => (
        <li key={need.field} className="flex items-center gap-2 text-role-caption text-text-muted">
          <span className="size-1.5 shrink-0 bg-text-warning" aria-hidden />
          {need.label}
        </li>
      ))}
    </ul>
  );
}

export interface InboundLanded {
  orderNumber: string;
  lineCount: number;
  created: boolean;
  unchanged: boolean;
}

/** What the writer did with the order, and the next job (another order, or back). */
export function InboundLandedView({
  landed,
  fixing,
  back,
  onNext,
  onBack,
}: {
  landed: InboundLanded;
  fixing: boolean;
  back: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const verdict = landed.unchanged ? 'already on Incoming — nothing changed' : landed.created ? 'is on Incoming' : 'updated on Incoming';
  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-inbound-done">
      <MobileV2DetailTopBar title={landed.orderNumber} subtitle="Purchase order" mono backHref={back} close />
      <div className="flex flex-1 flex-col items-center gap-3 px-mode-page py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-mode-pill bg-surface-success text-text-success">
          <Check className="size-6" />
        </span>
        <p className="text-role-title font-semibold text-text-default">
          <span className="font-mono">{landed.orderNumber}</span> {verdict}
        </p>
        <p className="text-role-body text-text-muted">
          {landed.lineCount} line{landed.lineCount === 1 ? '' : 's'}
        </p>
      </div>
      <DetailDock
        label="Next"
        verbs={[
          { id: 'back', label: fixing ? 'Back' : 'Done', icon: <X /> },
          ...(fixing ? [] : [{ id: 'next' as const, label: 'Next order', icon: <Plus />, primary: true, testId: 'm-inbound-next' }]),
        ]}
        onVerb={(id) => (id === 'next' ? onNext() : onBack())}
      />
    </div>
  );
}
