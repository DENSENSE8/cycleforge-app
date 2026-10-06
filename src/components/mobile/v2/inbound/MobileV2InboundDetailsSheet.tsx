'use client';

/**
 * The order's optional facts, a secondary edit off the form's main job:
 * vendor / seller, buyer account, order and expected dates, notes — and on a
 * return the buyer's own words, RMA # and the day the return was requested.
 * Edits land on the draft as they are typed; Done closes.
 */

import { Check } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { FormField } from '@/design-system/components/FormField';
import { TextField } from '@/design-system/primitives';
import { composeInboundReturnReason, parseInboundReturnReason, type InboundOrderDraft } from '@/lib/inbound/inbound-order-draft';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

function DateRow({ label, value, onChange }: { label: string; value: string | null; onChange: (next: string | null) => void }) {
  return (
    <FormField label={label}>
      <DateRangePickerField
        variant="compact"
        ariaLabel={label}
        value={value ? dateKeyToLocalDate(value) : undefined}
        onChange={(day: Date) => onChange(localDateToDateKey(day))}
        onClear={() => onChange(null)}
      />
    </FormField>
  );
}

export function MobileV2InboundDetailsSheet({
  open,
  draft,
  onChange,
  onClose,
}: {
  open: boolean;
  draft: InboundOrderDraft;
  onChange: (patch: Partial<InboundOrderDraft>) => void;
  onClose: () => void;
}) {
  const isReturn = draft.type === 'RETURN';
  const reason = parseInboundReturnReason(draft.returnReason);
  return (
    <MobileV2ActionSheet
      open={open}
      onClose={onClose}
      title="More details"
      description="Optional — what the paperwork says."
      verbs={[{ id: 'done', label: 'Done', icon: <Check />, primary: true, testId: 'm-inbound-details-done' }]}
      onVerb={onClose}
      dockLabel="Details actions"
      testId="m-inbound-details-sheet"
    >
      <div className="flex flex-col gap-3 px-mode-page py-3">
        <TextField label={isReturn ? 'Buyer' : 'Vendor / seller'} value={draft.vendor} onChange={(vendor) => onChange({ vendor })} data-testid="m-inbound-vendor" />
        <TextField label="Buyer account" value={draft.accountName} onChange={(accountName) => onChange({ accountName })} />
        <div className="grid grid-cols-2 gap-3">
          <DateRow label="Order date" value={draft.orderDate} onChange={(orderDate) => onChange({ orderDate })} />
          <DateRow label="Expected arrival" value={draft.expectedDate} onChange={(expectedDate) => onChange({ expectedDate })} />
        </div>
        {isReturn ? (
          <>
            <TextField
              label="Detail — what the buyer said"
              value={reason.detail}
              onChange={(detail) => onChange({ returnReason: composeInboundReturnReason(reason.reason, detail) })}
            />
            <TextField label="RMA #" value={draft.rmaId} mono autoCapitalize="characters" onChange={(rmaId) => onChange({ rmaId })} />
            <DateRow label="Return requested" value={draft.returnRequestDate ?? null} onChange={(returnRequestDate) => onChange({ returnRequestDate })} />
          </>
        ) : null}
        <TextField label="Notes for receiving" value={draft.notes} multiline rows={3} onChange={(notes) => onChange({ notes })} data-testid="m-inbound-notes" />
      </div>
    </MobileV2ActionSheet>
  );
}
