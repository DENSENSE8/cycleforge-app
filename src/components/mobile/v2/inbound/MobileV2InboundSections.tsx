'use client';

/**
 * The body blocks of the phone inbound-order form: the order (type, platform,
 * number, priority — what Auto resolves to — a return's reason, and a row to
 * the optional details), items (each a `MobileRecordCard` that opens the item
 * sheet), tracking (every box), the "Still needed" checklist the dock names,
 * and the landed screen.
 */

import { Check, Plus, ScanBarcode, Truck, X } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { IconButton, TextField } from '@/design-system/primitives';
import { conditionLabel } from '@/lib/conditions';
import {
  formatInboundMoney,
  inboundLineName,
  inboundOrderCostTotal,
  inboundTrackingCarrier,
  removeInboundTracking,
  INBOUND_FORM_TYPES,
  orderNumberLabel,
  type InboundFormType,
} from '@/lib/inbound/inbound-order-compose';
import {
  filledInboundLines,
  INBOUND_ORDER_TYPE_LABELS,
  parseInboundReturnReason,
  type InboundOrderNeed,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderFormModel, InboundOrderLanding } from '@/lib/inbound/use-inbound-order-form';
import { InboundPickerRow, InboundRowButton, InboundRowText, InboundSectionHeading, INBOUND_ROW_CLASS } from './MobileV2InboundParts';

export type InboundPicker = 'platform' | 'priority' | 'reason' | 'details';

const TYPE_TABS = INBOUND_FORM_TYPES.map((type) => ({ id: type, label: INBOUND_ORDER_TYPE_LABELS[type], testId: `m-inbound-type-${type}` }));

export function InboundOrderFactsSection({
  form,
  platformLabel,
  priorityLabel,
  onTypeChange,
  onPick,
}: {
  form: InboundOrderFormModel;
  platformLabel: string | null;
  /** The picked priority, Auto named by what it resolves to. */
  priorityLabel: string;
  onTypeChange: (type: InboundFormType) => void;
  onPick: (picker: InboundPicker) => void;
}) {
  const { draft, missing, record } = form;
  const needs = new Set(missing.map((m) => m.field));
  // Fixing a landed order: platform + number are its identity, shown not changed.
  const fixing = record != null;
  const isReturn = draft.type === 'RETURN';
  const reason = parseInboundReturnReason(draft.returnReason).reason;
  const extras = [draft.vendor, draft.accountName, draft.orderDate, draft.expectedDate, draft.notes, isReturn ? draft.rmaId : ''].filter((v) => v?.trim()).length;
  return (
    <>
      {fixing ? null : (
        <div className="border-b border-mode-rule px-mode-page py-3">
          <TabSwitch tabs={TYPE_TABS} activeTab={draft.type} onTabChange={(id) => onTypeChange(id as InboundFormType)} />
        </div>
      )}
      <InboundSectionHeading>Order</InboundSectionHeading>
      <InboundPickerRow
        label={isReturn ? 'Sold on' : 'Platform'}
        value={platformLabel}
        placeholder={isReturn ? 'Where the buyer bought it' : 'Who sold it'}
        flagged={needs.has('platform') || needs.has('zoho_source')}
        locked={fixing}
        onOpen={() => onPick('platform')}
        testId="m-inbound-platform"
      />
      <div className="border-b border-mode-rule px-mode-page py-3">
        <TextField
          label={`${orderNumberLabel(draft.type, draft.platform)} *`}
          value={draft.orderNumber}
          onChange={(orderNumber) => form.patch({ orderNumber })}
          mono
          readOnly={fixing}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={needs.has('order_number') || undefined}
          data-testid="m-inbound-order-number"
        />
      </div>
      {isReturn ? (
        <InboundPickerRow
          label="Reason"
          value={reason ?? (draft.returnReason.trim() || null)}
          placeholder="Why it came back"
          flagged={needs.has('return_reason')}
          onOpen={() => onPick('reason')}
          testId="m-inbound-reason"
        />
      ) : null}
      <InboundPickerRow label="Priority" value={priorityLabel} placeholder="Auto" onOpen={() => onPick('priority')} testId="m-inbound-priority" />
      <InboundPickerRow
        label="Details"
        value={extras ? `${extras} filled` : null}
        placeholder="Vendor, dates, notes — optional"
        onOpen={() => onPick('details')}
        testId="m-inbound-details"
      />
    </>
  );
}

export function InboundItemsSection({ form, onOpenLine }: { form: InboundOrderFormModel; onOpenLine: (index: number | null) => void }) {
  const { draft, missing } = form;
  const filled = new Set(filledInboundLines(draft));
  const lines = draft.lines.map((line, index) => ({ line, index })).filter(({ line }) => filled.has(line));
  const cost = inboundOrderCostTotal(draft);
  const isReturn = draft.type === 'RETURN';
  return (
    <>
      <InboundSectionHeading>{isReturn ? 'Returned item' : `Items · ${lines.length}`}</InboundSectionHeading>
      {lines.length ? (
        <div data-testid="m-inbound-items">
          <MobileRecordCardList>
            {lines.map(({ line, index }) => {
              const flagged = missing.some((m) => m.lines?.includes(index)) || (isReturn && missing.some((m) => m.field === 'return_item'));
              const photos = (form.photos[index]?.length ?? 0) + form.landedPhotos(line).length;
              const serials = line.listingSerials?.length ?? 0;
              const each = line.quantity != null && line.quantity > 1 ? ' each' : '';
              const facts = [
                ...(line.sku.trim() && line.title.trim() ? [{ label: 'SKU', value: line.sku.trim() }] : []),
                ...(line.conditionGrade ? [{ label: 'Bought', value: conditionLabel(line.conditionGrade, 'option') }] : []),
                ...(photos ? [{ label: 'Photos', value: String(photos) }] : []),
                ...(serials ? [{ label: 'Serials', value: String(serials) }] : []),
              ];
              return (
                <MobileRecordCard
                  key={index}
                  identity={`Item ${index + 1}`}
                  title={inboundLineName(line)}
                  facts={facts.length ? facts : undefined}
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
      {isReturn && lines.length ? null : (
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
                    {cost.missingCost ? ` · ${cost.missingCost} unpriced` : ''}
                  </span>
                ) : null
              }
            >
              <InboundRowText title="Add item" metaTone="warning" meta={missing.some((m) => m.field === 'lines') ? 'At least one item' : null} />
            </InboundRowButton>
          </li>
        </ul>
      )}
    </>
  );
}

export function InboundTrackingSection({ form, onAdd }: { form: InboundOrderFormModel; onAdd: () => void }) {
  const { draft, missing } = form;
  const tracking = draft.tracking.map((t, index) => ({ ...t, index })).filter((t) => t.number.trim());
  const flagged = missing.some((m) => m.field === 'tracking');
  return (
    <>
      <InboundSectionHeading>{tracking.length ? `Tracking · ${tracking.length}` : 'Tracking'}</InboundSectionHeading>
      <ul aria-label="Tracking numbers" data-testid="m-inbound-tracking">
        {tracking.map((t) => {
          const carrier = inboundTrackingCarrier(t);
          return (
            <li key={t.index} className={`${INBOUND_ROW_CLASS} py-1`}>
              <Truck aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
              <span className="min-w-0 flex-1">
                <InboundRowText title={<span className="break-all font-mono">{t.number}</span>} meta={carrier} />
              </span>
              <IconButton
                size="touch"
                icon={<X className="h-4 w-4" />}
                ariaLabel={`Remove tracking ${t.number}`}
                onClick={() => form.patch({ tracking: removeInboundTracking(draft, t.index).tracking })}
              />
            </li>
          );
        })}
        <li>
          <InboundRowButton icon={<ScanBarcode />} onClick={onAdd} testId="m-inbound-scan-tracking">
            <InboundRowText
              title={tracking.length ? 'Add another box' : 'Scan or paste tracking'}
              metaTone="warning"
              meta={flagged ? 'A return needs its tracking number' : null}
            />
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

/** What the writer did with the order, and the next job (another order, or back). */
export function InboundLandedView({
  landing,
  fixing,
  back,
  onNext,
  onBack,
}: {
  landing: InboundOrderLanding;
  fixing: boolean;
  back: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const { result, photos } = landing;
  const orderNumber = result.identity.externalOrderId;
  const verdict = result.unchanged ? 'already on file — nothing changed' : result.created ? 'landed' : 'updated';
  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-inbound-done">
      <MobileV2DetailTopBar title={orderNumber} subtitle={INBOUND_ORDER_TYPE_LABELS[landing.type]} mono backHref={back} close />
      <div className="flex flex-1 flex-col items-center gap-3 px-mode-page py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-mode-pill bg-surface-success text-text-success">
          <Check className="size-6" />
        </span>
        <p className="text-role-title font-semibold text-text-default">
          <span className="font-mono">{orderNumber}</span> {verdict}
        </p>
        <p className="text-role-body text-text-muted">
          {result.lines.length} line{result.lines.length === 1 ? '' : 's'}
          {photos.uploaded ? ` · ${photos.uploaded} listing photo${photos.uploaded === 1 ? '' : 's'}` : ''}
          {photos.failed ? ` · ${photos.failed} photo${photos.failed === 1 ? '' : 's'} failed` : ''}
        </p>
      </div>
      <DetailDock
        label="Next"
        verbs={[
          { id: 'back', label: fixing ? 'Back' : 'Done', icon: <X /> },
          ...(fixing ? [] : [{ id: 'next' as const, label: 'Add another', icon: <Plus />, primary: true, testId: 'm-inbound-next' }]),
        ]}
        onVerb={(id) => (id === 'next' ? onNext() : onBack())}
      />
    </div>
  );
}
