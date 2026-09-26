'use client';

import { useEffect, useState } from 'react';
import { BottomSheet, ConfirmSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import {
  repairInfoDraft,
  repairInfoPlan,
  withCustomerIntent,
  type CustomerIntent,
  type RepairInfoDraft,
  type RepairInfoSource,
} from '@/lib/repair/repair-info-edit';
import { RepairCustomerPickerSheet } from './RepairCustomerPickerSheet';

/** Edit verb of the hub "Information" panel. */
export function RepairInfoEditSheet({
  open,
  repairId,
  repair,
  saving,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  repairId: number;
  repair: RepairInfoSource;
  saving: boolean;
  error: string | null;
  onSave: (draft: RepairInfoDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<RepairInfoDraft>(() => repairInfoDraft(repair));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Re-seed on open so a cancelled edit never survives a close.
  useEffect(() => {
    if (open) setDraft(repairInfoDraft(repair));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed on open only; a background re-read must not wipe typing
  }, [open]);

  const set = (key: keyof Omit<RepairInfoDraft, 'customer'>) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const stage = (intent: CustomerIntent) => setDraft((d) => withCustomerIntent(repair, d, intent));
  const { writes, problem } = repairInfoPlan(repairId, repair, draft);
  const changed = writes.map((w) => w.label);
  const unlinking = writes.some((w) => w.method === 'DELETE');
  const linkedName = repair.customer_name?.trim() || 'this customer';

  const intent = draft.customer;
  const linked = repair.customer_id != null;
  const caption =
    intent.kind === 'link'
      ? `Changing to ${intent.customer.name}`
      : intent.kind === 'create'
        ? 'New customer record'
        : intent.kind === 'unlink'
          ? `Unlinking ${linkedName} — the intake contact shows instead`
          : linked
            ? 'Customer record — an edit updates it everywhere'
            : 'No customer record — saved on this repair';

  return (
    <>
      <BottomSheet
        open={open}
        onClose={saving ? () => {} : onClose}
        forceVariant="sheet"
        title="Edit information"
        scrollBody
        // A long form scrolls; a drag-to-dismiss parent would fight that scroll. The scrim still closes it.
        dragDisabled
      >
        {/* BottomSheet portals out of the page's ModeRegion; re-declare triage. */}
        <ModeRegion mode="triage" className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2 pt-2">
          <TextField label="Device" value={draft.productTitle} onChange={set('productTitle')} disabled={saving} />
          <TextField label="Issue" value={draft.issue} onChange={set('issue')} multiline rows={2} disabled={saving} />
          <TextField
            label="Serial"
            value={draft.serialNumber}
            onChange={set('serialNumber')}
            mono
            autoComplete="off"
            spellCheck={false}
            disabled={saving}
          />

          <section aria-label="Customer" className="flex flex-col gap-3 rounded-mode border border-mode-edge p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-role-caption font-semibold text-mode-muted">{caption}</p>
              <div className="flex shrink-0 gap-2">
                {intent.kind !== 'keep' ? (
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => stage({ kind: 'keep' })}>
                    Undo
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" disabled={saving} onClick={() => setPickerOpen(true)}>
                      {linked ? 'Change' : 'Link customer'}
                    </Button>
                    {linked ? (
                      <Button variant="dangerSoft" size="sm" disabled={saving} onClick={() => stage({ kind: 'unlink' })}>
                        Unlink
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <TextField label="Customer name" value={draft.contactName} onChange={set('contactName')} disabled={saving} />
            <TextField
              label="Customer phone"
              value={draft.contactPhone}
              onChange={set('contactPhone')}
              type="tel"
              inputMode="tel"
              disabled={saving}
            />
            <TextField
              label="Customer email"
              value={draft.contactEmail}
              onChange={set('contactEmail')}
              type="email"
              inputMode="email"
              disabled={saving}
            />
          </section>

          <TextField label="Price" value={draft.price} onChange={set('price')} inputMode="decimal" disabled={saving} />
          <TextField label="Notes" value={draft.notes} onChange={set('notes')} multiline rows={3} disabled={saving} />

          {error || problem ? (
            <p
              role="alert"
              className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700"
            >
              {error ?? problem}
            </p>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            className="w-full rounded-mode"
            disabled={changed.length === 0 || problem != null}
            loading={saving}
            onClick={() => (unlinking ? setConfirmUnlink(true) : onSave(draft))}
          >
            {saving ? 'Saving' : changed.length ? `Save — ${changed.join(', ')}` : 'No changes'}
          </Button>
        </ModeRegion>
      </BottomSheet>

      <RepairCustomerPickerSheet
        open={open && pickerOpen}
        linkedCustomerId={repair.customer_id ?? null}
        onPick={(customer) => {
          stage({ kind: 'link', customer });
          setPickerOpen(false);
        }}
        onCreate={() => {
          stage({ kind: 'create' });
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      {/* Level 1 — above the edit sheet. The customer row is kept; only this repair's link goes. */}
      <ConfirmSheet
        open={open && confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        level={1}
        destructive
        title={`Unlink ${linkedName}?`}
        message={`RS-${repairId} will no longer point at this customer record. The record itself is kept, with its other repairs and orders.`}
        confirmLabel="Unlink and save"
        onConfirm={() => onSave(draft)}
      />
    </>
  );
}
