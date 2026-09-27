'use client';

/** The left two thirds of the inbound-order form — its triage sections, top to bottom. */

import { useMemo } from 'react';
import { Plus, Trash2 } from '@/components/Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { FormField } from '@/design-system/components/FormField';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import type { TriageSectionSpec } from '@/design-system/components/TriageSections';
import { triagePanelControl, TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/triage-panel';
import {
  INBOUND_ORDER_TYPES,
  INBOUND_ORDER_TYPE_LABELS,
  type InboundOrderDraft,
  type InboundOrderNeed,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { cn } from '@/utils/_cn';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { orderNumberLabel, usePlatformChoices, usePriorityChoices } from './composer-choices';
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

export function useInboundOrderSections({ draft, missing, preview, onChange, onReplace }: SectionsArgs): TriageSectionSpec[] {
  const platforms = usePlatformChoices();
  const priorities = usePriorityChoices();
  // Zoho orders arrive by sync; a hand-entered order names the seller platform.
  const platformOptions = useMemo(() => platforms.filter((p) => p.value !== 'zoho'), [platforms]);

  const order: TriageSectionSpec = {
    id: 'inbound-order',
    label: 'Order',
    children: (
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Order type" className="grid grid-cols-4 gap-1">
          {INBOUND_ORDER_TYPES.map((type) => {
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Platform" required>
            <SearchableSelectField
              value={draft.platform || null}
              onChange={(value) => onChange({ platform: value == null ? '' : String(value) })}
              options={platformOptions}
              placeholder="Who sold it"
              ariaLabel="Platform"
              className={cn(needs(missing, 'platform') && 'ring-1 ring-amber-400', TRIAGE_PANEL_INNER_CORNER)}
            />
          </FormField>
          <TextField
            label={`${orderNumberLabel(draft.platform)} *`}
            value={draft.orderNumber}
            onChange={(orderNumber) => onChange({ orderNumber })}
            mono
            aria-invalid={needs(missing, 'order_number') || undefined}
          />
          <TextField label="Vendor / seller" value={draft.vendor} onChange={(vendor) => onChange({ vendor })} />
          <TextField label="Buyer account" value={draft.accountName} onChange={(accountName) => onChange({ accountName })} />
          <FormField label="Priority">
            <SearchableSelectField
              value={draft.priority}
              onChange={(value) => onChange({ priority: (value == null ? 'auto' : String(value)) as InboundOrderDraft['priority'] })}
              options={priorities}
              ariaLabel="Priority"
              className={TRIAGE_PANEL_INNER_CORNER}
            />
          </FormField>
          <TextField
            label="Currency"
            value={draft.currency}
            maxLength={3}
            onChange={(currency) => onChange({ currency: currency.toUpperCase() })}
            mono
          />
          <DateField label="Order date" value={draft.orderDate} onChange={(orderDate) => onChange({ orderDate })} />
          <DateField label="Expected" value={draft.expectedDate} onChange={(expectedDate) => onChange({ expectedDate })} />
        </div>
      </div>
    ),
  };

  const shipment: TriageSectionSpec = {
    id: 'inbound-shipment',
    label: draft.tracking.length > 1 ? `Shipment · ${draft.tracking.length} tracking numbers` : 'Shipment',
    children: (
      <div className="flex flex-col gap-3">
        {draft.tracking.map((t, index) => (
          <div key={index} className="grid grid-cols-[1fr_12rem_2.25rem] items-center gap-2">
            <TextField
              label={index === 0 ? `Tracking number${draft.type === 'RETURN' ? ' *' : ''}` : `Tracking number ${index + 1}`}
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
    label: `Items · ${draft.lines.length}`,
    children: <InboundOrderLines draft={draft} missing={missing} preview={preview} onChange={(lines) => onChange({ lines })} />,
  };

  const returnFacts: TriageSectionSpec | null =
    draft.type === 'RETURN'
      ? {
          id: 'inbound-return',
          label: 'Return',
          children: (
            <div className="grid grid-cols-[1fr_12rem] gap-3">
              <TextField label="Return reason" value={draft.returnReason} onChange={(returnReason) => onChange({ returnReason })} />
              <TextField label="RMA #" value={draft.rmaId} mono onChange={(rmaId) => onChange({ rmaId })} />
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

  return [order, shipment, items, ...(returnFacts ? [returnFacts] : []), notes, fill];
}
