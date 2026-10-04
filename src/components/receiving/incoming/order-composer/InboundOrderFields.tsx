'use client';

/**
 * The left two thirds of the inbound-order form — its triage sections, top to
 * bottom. A purchase order reads as a PO (vendor, PO #, dates, costed items);
 * a return opens on its own Return section — the reason the unboxer checks
 * for, RMA, the original sale — then the one returned item and its listing.
 */

import { useState } from 'react';
import { Plus, Trash2 } from '@/components/Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { FormField } from '@/design-system/components/FormField';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import type { TriageSectionSpec } from '@/design-system/components/TriageSections';
import { triagePanelControl, TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/triage-panel';
import {
  composeInboundReturnReason,
  AUTHORED_INBOUND_ORDER_TYPES,
  INBOUND_ORDER_TYPE_LABELS,
  parseInboundReturnReason,
  type InboundOrderDraft,
  type InboundOrderNeed,
  type InboundReturnReason,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { cn } from '@/utils/_cn';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { centsToInputText, inputTextToCents } from '@/utils/money';
import { inboundPriorityChoices, orderNumberLabel, RETURN_REASON_CHOICES } from '@/lib/inbound/inbound-order-compose';
import { useInboundPlatformChoices } from '@/lib/inbound/use-inbound-platform-choices';
import { InboundOrderLines } from './InboundOrderLines';
import { OrderDocumentFill } from './OrderDocumentFill';

interface SectionsArgs {
  draft: InboundOrderDraft;
  missing: readonly InboundOrderNeed[];
  preview: InboundOrderPreview | null;
  onChange: (patch: Partial<InboundOrderDraft>) => void;
  onReplace: (draft: InboundOrderDraft) => void;
}

function needs(missing: readonly InboundOrderNeed[], field: InboundOrderNeed['field']): boolean {
  return missing.some((m) => m.field === field);
}

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (next: string | null) => void }) {
  return (
    <FormField label={label}>
      <div className="flex items-center gap-1">
        <DateRangePickerField
          variant="compact"
          ariaLabel={label}
          value={value ? dateKeyToLocalDate(value) : undefined}
          onChange={(day: Date) => onChange(localDateToDateKey(day))}
          className={triagePanelControl('flex-1')}
        />
        {value ? (
          <IconButton size="lg" icon={<Trash2 className="h-3.5 w-3.5" />} ariaLabel={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)} />
        ) : null}
      </div>
    </FormField>
  );
}

const PRIORITY_CHOICES = inboundPriorityChoices();

export function useInboundOrderSections({ draft, missing, preview, onChange, onReplace }: SectionsArgs): TriageSectionSpec[] {
  // Zoho orders arrive by sync; a hand-entered order names the seller platform.
  const platformOptions = useInboundPlatformChoices();
  const isReturn = draft.type === 'RETURN';
  const isPo = draft.type === 'PO';
  const isPickup = draft.type === 'PICKUP';
  const draftPaidCents = draft.pickup?.paidCents ?? null;
  const [paidText, setPaidText] = useState(() => centsToInputText(draftPaidCents));
  // The draft owns the amount; the text only keeps what the operator typed while it still reads as that amount.
  const shownPaidText = inputTextToCents(paidText) === draftPaidCents ? paidText : centsToInputText(draftPaidCents);

  const typeSwitch = (
    <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      {AUTHORED_INBOUND_ORDER_TYPES.map((type) => {
        const selected = draft.type === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange({ type })}
            className={triagePanelControl(
              'border px-3 text-role-caption',
              selected ? 'border-border-strong bg-surface-selected text-text-default' : 'border-border-soft text-text-muted hover:bg-surface-canvas',
            )}
          >
            {INBOUND_ORDER_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );

  const platformField = (
    <FormField label={isReturn ? 'Sold on' : 'Platform'} required>
      <SearchableSelectField
        value={draft.platform || null}
        onChange={(value) => onChange({ platform: value == null ? '' : String(value) })}
        options={platformOptions}
        placeholder={isReturn ? 'Where the buyer bought it' : 'Who sold it'}
        ariaLabel="Platform"
        className={cn(needs(missing, 'platform') && 'ring-1 ring-amber-400', TRIAGE_PANEL_INNER_CORNER)}
      />
    </FormField>
  );
  const orderNumberField = (
    <TextField
      label={`${orderNumberLabel(draft.type, draft.platform)} *`}
      value={draft.orderNumber}
      onChange={(orderNumber) => onChange({ orderNumber })}
      mono
      aria-invalid={needs(missing, 'order_number') || undefined}
    />
  );
  const accountField = (
    <TextField label={isReturn ? 'Buyer / account' : 'Buyer account'} value={draft.accountName} onChange={(accountName) => onChange({ accountName })} />
  );
  const priorityField = (
    <FormField label="Priority">
      <SearchableSelectField
        value={draft.priority}
        onChange={(value) => onChange({ priority: (value == null ? 'auto' : String(value)) as InboundOrderDraft['priority'] })}
        options={PRIORITY_CHOICES}
        ariaLabel="Priority"
        className={TRIAGE_PANEL_INNER_CORNER}
      />
    </FormField>
  );
  const expectedField = (
    <DateField label={isPo || isReturn ? 'Expected arrival' : 'Expected'} value={draft.expectedDate} onChange={(expectedDate) => onChange({ expectedDate })} />
  );

  const order: TriageSectionSpec = {
    id: 'inbound-order',
    label: 'Order',
    children: isReturn ? (
      typeSwitch
    ) : (
      <div className="flex flex-col gap-4">
        {typeSwitch}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {platformField}
          {orderNumberField}
          <TextField label="Vendor / seller" value={draft.vendor} onChange={(vendor) => onChange({ vendor })} />
          {accountField}
          {priorityField}
          <TextField
            label="Currency"
            value={draft.currency}
            maxLength={3}
            onChange={(currency) => onChange({ currency: currency.toUpperCase() })}
            mono
          />
          <DateField label={isPickup ? 'Pickup date' : 'Order date'} value={draft.orderDate} onChange={(orderDate) => onChange({ orderDate })} />
          {isPickup ? null : expectedField}
        </div>
      </div>
    ),
  };

  // One stored string, two controls: the picked reason and the buyer's own words.
  const reason = parseInboundReturnReason(draft.returnReason);
  const unboxerChecks = draft.returnReason.trim();
  const returnFacts: TriageSectionSpec | null = isReturn
    ? {
        id: 'inbound-return',
        label: 'Return',
        children: (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[16rem_1fr]">
              <FormField label="Return reason" required>
                <SearchableSelectField
                  value={reason.reason}
                  onChange={(value) =>
                    onChange({ returnReason: composeInboundReturnReason(value == null ? null : (String(value) as InboundReturnReason), reason.detail) })
                  }
                  options={RETURN_REASON_CHOICES}
                  placeholder="Why it came back"
                  ariaLabel="Return reason"
                  className={cn(needs(missing, 'return_reason') && 'ring-1 ring-amber-400', TRIAGE_PANEL_INNER_CORNER)}
                />
              </FormField>
              <TextField
                label="Detail — what the buyer said"
                value={reason.detail}
                onChange={(detail) => onChange({ returnReason: composeInboundReturnReason(reason.reason, detail) })}
              />
            </div>
            <p className="text-role-caption text-text-muted" data-testid="inbound-return-unboxer-checks">
              {unboxerChecks ? (
                <>
                  Unboxer checks: <span className="text-text-default">{unboxerChecks}</span>
                </>
              ) : (
                'Pick the reason — the unboxer sees it when the box is opened.'
              )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {platformField}
              {orderNumberField}
              <TextField label="RMA #" value={draft.rmaId} mono onChange={(rmaId) => onChange({ rmaId })} />
              {accountField}
              {priorityField}
              {expectedField}
            </div>
          </div>
        ),
      }
    : null;

  const shipment: TriageSectionSpec = {
    id: 'inbound-shipment',
    label: draft.tracking.length > 1 ? `Shipment · ${draft.tracking.length} tracking numbers` : 'Shipment',
    children: (
      <div className="flex flex-col gap-3">
        {draft.tracking.map((t, index) => (
          <div key={index} className="grid grid-cols-[1fr_2.25rem] items-center gap-2 sm:grid-cols-[1fr_12rem_2.25rem]">
            <TextField
              label={index === 0 ? (isReturn ? 'Return tracking number *' : 'Tracking number') : `Tracking number ${index + 1}`}
              value={t.number}
              mono
              aria-invalid={(index === 0 && needs(missing, 'tracking')) || undefined}
              onChange={(number) => onChange({ tracking: draft.tracking.map((x, i) => (i === index ? { ...x, number } : x)) })}
            />
            <TextField
              label="Carrier"
              value={t.carrier}
              placeholder="Detected"
              onChange={(carrier) => onChange({ tracking: draft.tracking.map((x, i) => (i === index ? { ...x, carrier } : x)) })}
            />
            <IconButton
              size="lg"
              icon={<Trash2 className="h-4 w-4" />}
              ariaLabel={`Remove tracking ${index + 1}`}
              disabled={draft.tracking.length === 1}
              onClick={() => onChange({ tracking: draft.tracking.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus />}
            disabled={draft.tracking.length >= 10}
            onClick={() => onChange({ tracking: [...draft.tracking, { number: '', carrier: '' }] })}
          >
            Add tracking number
          </Button>
        </div>
      </div>
    ),
  };

  const items: TriageSectionSpec = {
    id: 'inbound-items',
    label: isReturn ? 'Returned item' : `Items · ${draft.lines.length}`,
    children: <InboundOrderLines draft={draft} missing={missing} preview={preview} onChange={(lines) => onChange({ lines })} />,
  };

  const pickupReceipt: TriageSectionSpec | null = isPickup
    ? {
        id: 'inbound-pickup-receipt',
        label: 'Pickup receipt',
        children: (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Payment method"
              placeholder="Cash, Zelle, Venmo…"
              value={draft.pickup?.paymentMethod ?? ''}
              onChange={(paymentMethod) => onChange({ pickup: { paymentMethod, paidCents: draft.pickup?.paidCents ?? null } })}
            />
            <TextField
              label="Amount paid"
              inputMode="decimal"
              value={shownPaidText}
              onChange={(raw) => {
                setPaidText(raw);
                onChange({
                  pickup: {
                    paymentMethod: draft.pickup?.paymentMethod ?? '',
                    paidCents: inputTextToCents(raw),
                  },
                });
              }}
            />
          </div>
        ),
      }
    : null;

  const notes: TriageSectionSpec = {
    id: 'inbound-notes',
    label: 'Notes',
    children: <TextField label="Notes for receiving" value={draft.notes} multiline rows={3} onChange={(notesText) => onChange({ notes: notesText })} />,
  };

  const fill: TriageSectionSpec = {
    id: 'inbound-fill',
    label: 'Fill from a document',
    children: <OrderDocumentFill currentType={draft.type} onFilled={onReplace} />,
  };

  // A return leads with its own facts. Pickup paperwork has receipt facts and no parcel/tracking section.
  if (returnFacts) return [order, returnFacts, items, shipment, notes, fill];
  if (pickupReceipt) return [fill, order, pickupReceipt, items, notes];
  return [order, shipment, items, notes, fill];
}
