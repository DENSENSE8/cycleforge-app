'use client';

/**
 * Edit information — the repair's facts and its linked customer in the
 * centered verb dialog (operator 2026-10-08): one scrolling column, Save on
 * the bar under it, the done face once every write landed. Change / Link
 * customer swaps the dialog body for the customer search (never a popover);
 * a pick or Back returns to the form with the choice staged.
 */

import { useMemo, useState } from 'react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCustomerSearch, CUSTOMER_SEARCH_MIN_CHARS } from '@/hooks/useRepairCustomerSearch';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  repairInfoDraft,
  repairInfoPlan,
  withCustomerIntent,
  type CustomerIntent,
  type RepairInfoDraft,
  type PickedCustomer,
} from '@/lib/repair/repair-info-edit';
import { cn } from '@/utils/_cn';

/** The repair facts and the linked customer record, saved together. */
export function RepairInfoEditor({ repair, onSaved, onDone }: { repair: RSRecord; onSaved: () => void; onDone: () => void }) {
  const [draft, setDraft] = useState<RepairInfoDraft>(() => repairInfoDraft(repair));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLabels, setSavedLabels] = useState<string[] | null>(null);
  const plan = useMemo(() => repairInfoPlan(repair.id, repair, draft), [draft, repair]);
  const changed = [...new Set(plan.writes.map((write) => write.label))];
  const set = (key: keyof Omit<RepairInfoDraft, 'customer'>) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const stage = (intent: CustomerIntent) => setDraft((current) => withCustomerIntent(repair, current, intent));
  const linked = repair.customer_id != null;
  const intent = draft.customer;

  const save = async () => {
    if (saving || plan.problem || plan.writes.length === 0) return;
    setSaving(true);
    setError(null);
    const saved: string[] = [];
    try {
      for (const write of plan.writes) {
        const response = await fetch(write.url, {
          method: write.method,
          headers: write.body ? { 'Content-Type': 'application/json' } : undefined,
          body: write.body ? JSON.stringify(write.body) : undefined,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(`${write.label}: ${body?.error || `HTTP ${response.status}`}`);
        }
        saved.push(write.label);
      }
      onSaved();
      setSavedLabels([...new Set(saved)]);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'Save failed';
      setError(saved.length ? `Not all saved — ${reason}. Saved first: ${[...new Set(saved)].join(', ')}.` : `Not saved — ${reason}.`);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (savedLabels) {
    return <VerbDoneState title="Information saved" detail={savedLabels.join(', ')} onDone={onDone} testId="repair-record-edit-info-done" />;
  }

  if (pickerOpen) {
    return (
      <CustomerSearch
        linkedCustomerId={repair.customer_id ?? null}
        onPick={(customer) => { stage({ kind: 'link', customer }); setPickerOpen(false); }}
        onCreate={() => { stage({ kind: 'create' }); setPickerOpen(false); }}
        onBack={() => setPickerOpen(false)}
      />
    );
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      data-testid="repair-record-edit-info"
      onSubmit={(event) => { event.preventDefault(); void save(); }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1">
        <section aria-labelledby="repair-device-fields" className="flex flex-col gap-3 rounded-mode border border-mode-edge p-4">
          <h3 id="repair-device-fields" className="text-role-label font-semibold text-mode-ink">Repair information</h3>
          <TextField label="Device" value={draft.productTitle} onChange={set('productTitle')} disabled={saving} autoFocus />
          <TextField label="Issue" value={draft.issue} onChange={set('issue')} multiline rows={3} disabled={saving} />
          <TextField label="Serial" value={draft.serialNumber} onChange={set('serialNumber')} mono autoComplete="off" spellCheck={false} disabled={saving} />
          <TextField label="Price" value={draft.price} onChange={set('price')} inputMode="decimal" disabled={saving} />
          <TextField label="Notes" value={draft.notes} onChange={set('notes')} multiline rows={4} disabled={saving} />
        </section>

        <section aria-labelledby="repair-customer-fields" className="flex flex-col gap-3 rounded-mode border border-mode-edge p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="repair-customer-fields" className="text-role-label font-semibold text-mode-ink">Customer</h3>
              <p className="text-role-caption text-mode-muted">
                {intent.kind === 'link' ? `Changing to ${intent.customer.name}` : intent.kind === 'create' ? 'Creating and linking a customer' : intent.kind === 'unlink' ? 'Unlinking on save' : linked ? 'Edits update the linked customer everywhere' : 'Contact is stored on this repair'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {intent.kind !== 'keep' ? (
                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => stage({ kind: 'keep' })}>Undo</Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => setPickerOpen(true)}>{linked ? 'Change' : 'Link'}</Button>
                  {linked ? <Button type="button" variant="dangerSoft" size="sm" disabled={saving} onClick={() => stage({ kind: 'unlink' })}>Unlink</Button> : null}
                </>
              )}
            </div>
          </div>
          <TextField label="Customer name" value={draft.contactName} onChange={set('contactName')} disabled={saving} />
          <TextField label="Customer phone" value={draft.contactPhone} onChange={set('contactPhone')} type="tel" inputMode="tel" disabled={saving} />
          <TextField label="Customer email" value={draft.contactEmail} onChange={set('contactEmail')} type="email" inputMode="email" disabled={saving} />
        </section>

        <section aria-labelledby="repair-source-fields" className="flex flex-col gap-3 rounded-mode border border-mode-edge p-4">
          <h3 id="repair-source-fields" className="text-role-label font-semibold text-mode-ink">Source and ingress</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ingress channel">
            {(['shipment', 'dropoff'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={draft.intakeChannel === value ? 'primary' : 'secondary'}
                size="sm"
                disabled={saving}
                onClick={() => set('intakeChannel')(value)}
                className={cn('justify-center', draft.intakeChannel === value && 'pointer-events-none')}
              >
                {value === 'shipment' ? 'Shipped in' : 'Dropped off'}
              </Button>
            ))}
          </div>
          <TextField label="Source system" value={draft.sourceSystem} onChange={set('sourceSystem')} disabled={saving} />
          <TextField label="Source order" value={draft.sourceOrderId} onChange={set('sourceOrderId')} mono disabled={saving} />
          <TextField label="Tracking" value={draft.sourceTrackingNumber} onChange={set('sourceTrackingNumber')} mono disabled={saving} />
          <TextField label="SKU" value={draft.sourceSku} onChange={set('sourceSku')} mono disabled={saving} />
        </section>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border-soft pt-3">
        {error || plan.problem ? <p role="alert" className="rounded-mode border border-rose-200 bg-rose-50 px-3 py-2 text-role-caption font-semibold text-rose-700">{error ?? plan.problem}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={changed.length === 0 || plan.problem != null}>
            {saving ? 'Saving' : changed.length ? `Save — ${changed.join(', ')}` : 'No changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The customer search, in the dialog's body while Change / Link is open. */
function CustomerSearch({
  linkedCustomerId,
  onPick,
  onCreate,
  onBack,
}: {
  linkedCustomerId: number | null;
  onPick: (customer: PickedCustomer) => void;
  onCreate: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const search = useCustomerSearch(true, query);
  const status = !search.active
    ? `Type at least ${CUSTOMER_SEARCH_MIN_CHARS} characters of a name, phone or email.`
    : search.loading
      ? 'Searching…'
      : search.error
        ? `Search failed — ${search.error}`
        : null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="repair-record-customer-search" aria-label="Change customer">
      <Command shouldFilter={false} className="min-h-0 flex-1 rounded-mode border border-mode-edge">
        <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder="Name, phone or email" aria-label="Search customers" />
        <CommandList className="max-h-none min-h-0 flex-1">
          {status ? <p role={search.error ? 'alert' : 'status'} className="px-3 py-3 text-center text-role-caption text-mode-muted">{status}</p> : <CommandEmpty>No customer matches “{query.trim()}”.</CommandEmpty>}
          {search.results.map((customer) => {
            const linked = customer.id === linkedCustomerId;
            return (
              <CommandItem key={customer.id} value={String(customer.id)} disabled={linked} onSelect={() => onPick(customer)} className="min-h-14">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-mode-ink">{customer.name}</span>
                  <span className="truncate text-role-caption text-mode-muted">{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No phone or email'}</span>
                </span>
                {linked ? <span className="text-role-caption text-mode-muted">Linked now</span> : null}
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>
      <div className="flex shrink-0 justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="button" variant="secondary" onClick={onCreate}>New customer</Button>
      </div>
    </div>
  );
}
