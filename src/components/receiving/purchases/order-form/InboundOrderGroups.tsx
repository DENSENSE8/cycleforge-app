'use client';

/**
 * The left two thirds of the inbound-order form, top to bottom: Order (type,
 * platform, number, vendor, buyer account, dates, priority, notes — and the
 * "Fill from screenshot or text" action), Return facts on a return, Tracking
 * (`InboundTrackingGroup`), and Items.
 */

import { useState } from 'react';
import { Plus, Sparkles } from '@/components/Icons';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, TextField } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import {
  formatInboundMoney,
  inboundAutoPriorityLabel,
  inboundOrderCostTotal,
  inboundPriorityChoices,
  INBOUND_FORM_TYPES,
  orderNumberLabel,
  RETURN_REASON_CHOICES,
  type InboundFormType,
} from '@/lib/inbound/inbound-order-compose';
import {
  assignInboundLineKeys,
  composeInboundReturnReason,
  INBOUND_ORDER_TYPE_LABELS,
  parseInboundReturnReason,
  type InboundOrderDraft,
  type InboundReturnReason,
} from '@/lib/inbound/inbound-order-draft';
import { useInboundPlatformChoices } from '@/lib/inbound/use-inbound-platform-choices';
import type { InboundOrderFormModel } from '@/lib/inbound/use-inbound-order-form';
import { cn } from '@/utils/_cn';
import { InboundItemLine } from './InboundItemLine';
import { OrderDocumentFill } from './OrderDocumentFill';
import { InboundDateField } from './order-form-fields';

const TYPE_TABS = INBOUND_FORM_TYPES.map((type) => ({ id: type, label: INBOUND_ORDER_TYPE_LABELS[type], testId: `inbound-type-${type}` }));

export function InboundOrderGroup({ form, onTypeChange }: { form: InboundOrderFormModel; onTypeChange: (type: InboundFormType) => void }) {
  const { draft, missing, record } = form;
  const platforms = useInboundPlatformChoices();
  const [filling, setFilling] = useState(false);
  const fixing = record != null;
  const isReturn = draft.type === 'RETURN';
  const formType = (INBOUND_FORM_TYPES as readonly string[]).includes(draft.type);
  const platformLabel = platforms.find((p) => p.value === draft.platform)?.label ?? null;
  const priorityChoices = inboundPriorityChoices(inboundAutoPriorityLabel(draft.platform, platformLabel));
  const needs = (field: string) => missing.some((m) => m.field === field);

  return (
    <RecordGroup
      title="Order"
      testId="inbound-order-group"
      action={
        fixing ? null : (
          <Button variant="ghost" size="sm" icon={<Sparkles />} aria-expanded={filling} onClick={() => setFilling((open) => !open)}>
            Fill from screenshot or text
          </Button>
        )
      }
    >
      {filling ? (
        <OrderDocumentFill
          type={draft.type}
          onFilled={(next) => {
            form.replace(next);
            setFilling(false);
          }}
        />
      ) : null}
      <div className="flex flex-col gap-4 px-4 pb-4 pt-2">
        {formType ? (
          <TabSwitch tabs={TYPE_TABS} activeTab={draft.type} onTabChange={(id) => onTypeChange(id as InboundFormType)} fit="hug" size="sm" />
        ) : (
          <p className="text-role-caption text-text-muted">{INBOUND_ORDER_TYPE_LABELS[draft.type]}</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SearchableSelectField
            label={isReturn ? 'Sold on *' : 'Platform *'}
            value={draft.platform || null}
            onChange={(value) => form.patch({ platform: value == null ? '' : String(value) })}
            options={platforms}
            placeholder={isReturn ? 'Where the buyer bought it' : 'Who sold it'}
            ariaLabel="Platform"
            disabled={fixing}
            className={cn((needs('platform') || needs('zoho_source')) && 'ring-1 ring-border-warning')}
            testId="inbound-platform"
          />
          <TextField
            label={`${orderNumberLabel(draft.type, draft.platform)} *`}
            value={draft.orderNumber}
            onChange={(orderNumber) => form.patch({ orderNumber })}
            mono
            disabled={fixing}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={needs('order_number') || undefined}
            data-testid="inbound-order-number"
          />
          <TextField label={isReturn ? 'Buyer' : 'Vendor / seller'} value={draft.vendor} onChange={(vendor) => form.patch({ vendor })} />
          <TextField label="Buyer account" value={draft.accountName} onChange={(accountName) => form.patch({ accountName })} />
          <InboundDateField label="Order date" value={draft.orderDate} onChange={(orderDate) => form.patch({ orderDate })} />
          <InboundDateField label="Expected arrival" value={draft.expectedDate} onChange={(expectedDate) => form.patch({ expectedDate })} />
          <SearchableSelectField
            label="Priority"
            value={draft.priority}
            onChange={(value) => form.patch({ priority: (value == null ? 'auto' : String(value)) as InboundOrderDraft['priority'] })}
            options={priorityChoices}
            ariaLabel="Priority"
            testId="inbound-priority"
          />
        </div>
        <TextField label="Notes for receiving" value={draft.notes} multiline rows={2} onChange={(notes) => form.patch({ notes })} />
      </div>
    </RecordGroup>
  );
}

export function InboundReturnGroup({ form }: { form: InboundOrderFormModel }) {
  const { draft, missing } = form;
  // One stored string, two controls: the picked reason and the buyer's own words.
  const reason = parseInboundReturnReason(draft.returnReason);
  const unboxerChecks = draft.returnReason.trim();
  return (
    <RecordGroup title="Return" testId="inbound-return-group">
      <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[16rem_minmax(0,1fr)]">
          <SearchableSelectField
            label="Return reason *"
            value={reason.reason}
            onChange={(value) =>
              form.patch({ returnReason: composeInboundReturnReason(value == null ? null : (String(value) as InboundReturnReason), reason.detail) })
            }
            options={RETURN_REASON_CHOICES}
            placeholder="Why it came back"
            ariaLabel="Return reason"
            className={cn(missing.some((m) => m.field === 'return_reason') && 'ring-1 ring-border-warning')}
          />
          <TextField
            label="Detail — what the buyer said"
            value={reason.detail}
            onChange={(detail) => form.patch({ returnReason: composeInboundReturnReason(reason.reason, detail) })}
          />
          <TextField label="RMA #" value={draft.rmaId} mono onChange={(rmaId) => form.patch({ rmaId })} />
          <InboundDateField
            label="Return requested"
            value={draft.returnRequestDate ?? null}
            onChange={(returnRequestDate) => form.patch({ returnRequestDate })}
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
      </div>
    </RecordGroup>
  );
}

export function InboundItemsGroup({ form }: { form: InboundOrderFormModel }) {
  const { draft, preview } = form;
  const keys = assignInboundLineKeys(draft.lines);
  const isReturn = draft.type === 'RETURN';
  const cost = inboundOrderCostTotal(draft);
  return (
    <RecordGroup title={isReturn ? 'Returned item' : `Items · ${draft.lines.length}`} testId="inbound-items-group">
      <ol className="flex flex-col">
        {draft.lines.map((_line, index) => (
          <InboundItemLine
            key={index}
            form={form}
            index={index}
            lineKey={keys[index]!}
            action={preview?.lines.find((l) => l.index === index)?.action ?? null}
          />
        ))}
      </ol>
      <div className="flex items-center gap-3 border-t border-mode-divide px-4 py-3">
        {/* A return is exactly one item — the claim ticket and the unboxer both read one listing. */}
        {isReturn ? null : (
          <Button variant="ghost" size="sm" icon={<Plus />} disabled={draft.lines.length >= 200} onClick={form.addLine}>
            Add item
          </Button>
        )}
        <span className="flex-1" />
        <p className="flex items-baseline gap-2 text-role-caption" data-testid="inbound-order-subtotal">
          <span className="text-text-muted">Order total</span>
          <span className={cn(RECORD_ID_CLASS, 'text-text-default')}>{formatInboundMoney(cost.subtotalCents, draft.currency)}</span>
          {cost.missingCost ? (
            <span className="text-text-warning">
              · {cost.missingCost} item{cost.missingCost === 1 ? '' : 's'} without a price
            </span>
          ) : null}
        </p>
      </div>
    </RecordGroup>
  );
}
