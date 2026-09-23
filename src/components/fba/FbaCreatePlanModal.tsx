'use client';

import { useEffect, useState } from 'react';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import type { StationTheme } from '@/utils/staff-colors';
import { fbaSidebarThemeChrome } from '@/utils/staff-colors';
import { useActiveStaffDirectory } from '@/components/sidebar/hooks';
import { FbaCreateShipmentForm, type FbaCreateShipmentFormState } from './FbaCreateShipmentForm';
import { fbaPaths } from '@/lib/fba/api-paths';
import { FBA_OPEN_CREATE_PLAN } from '@/lib/fba/events';

export const FBA_OPEN_CREATE_PLAN_EVENT = FBA_OPEN_CREATE_PLAN;

const INITIAL_FORM: FbaCreateShipmentFormState = {
  shipment_ref: '',
  destination_fc: '',
  due_date: '',
  notes: '',
  assigned_tech_id: '',
  assigned_packer_id: '',
  items: [{ fnsku: '', expected_qty: '1' }],
};

export function FbaCreatePlanModal({ stationTheme = 'blue' }: { stationTheme?: StationTheme }) {
  const chrome = fbaSidebarThemeChrome[stationTheme];
  const staffDirectory = useActiveStaffDirectory();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FbaCreateShipmentFormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      setForm(INITIAL_FORM);
      setSubmitError(null);
      setOpen(true);
    };
    window.addEventListener(FBA_OPEN_CREATE_PLAN_EVENT, handleOpen);
    return () => window.removeEventListener(FBA_OPEN_CREATE_PLAN_EVENT, handleOpen);
  }, []);

  const addItem = () => {
    setForm((f) => ({ ...f, items: [...f.items, { fnsku: '', expected_qty: '1' }] }));
  };

  const removeItem = (index: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  };

  const updateItem = (index: number, field: 'fnsku' | 'expected_qty', value: string) => {
    setForm((f) => {
      const next = [...f.items];
      next[index] = { ...next[index], [field]: value };
      return { ...f, items: next };
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(fbaPaths.plans(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipment_ref: form.shipment_ref.trim() || undefined,
          destination_fc: form.destination_fc.trim() || undefined,
          due_date: form.due_date || undefined,
          notes: form.notes.trim() || undefined,
          assigned_tech_id: form.assigned_tech_id || undefined,
          assigned_packer_id: form.assigned_packer_id || undefined,
          items: form.items
            .filter((i) => i.fnsku.trim())
            .map((i) => ({ fnsku: i.fnsku.trim(), expected_qty: Math.max(1, Number(i.expected_qty) || 1) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create plan');
      window.dispatchEvent(new Event('fba-plan-created'));
      setOpen(false);
      setForm(INITIAL_FORM);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) setOpen(false);
      }}
    >
      <DialogContent
        hideClose
        className="flex max-h-[90dvh] max-w-lg flex-col overflow-hidden gap-0 p-0"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-border-soft px-4 py-3">
          <div>
            <p className={`text-role-micro uppercase tracking-[0.16em] ${chrome.sectionLabel}`}>
              New plan
            </p>
            <DialogTitle className="mt-1 text-sm font-semibold">
              Create FBA shipment plan
            </DialogTitle>
            <DialogDescription className="sr-only">
              Fill in destination, due date, assignees, and FNSKU line items for a new FBA plan.
            </DialogDescription>
          </div>
          <IconButton
            icon={<X className="h-4 w-4" />}
            onClick={() => setOpen(false)}
            disabled={submitting}
            ariaLabel="Close create plan"
            size="md"
            radius="flush"
            className="border border-border-soft bg-surface-card hover:border-border-default hover:bg-surface-hover"
          />
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FbaCreateShipmentForm
            staff={staffDirectory}
            form={form}
            setForm={setForm}
            addItem={addItem}
            removeItem={removeItem}
            updateItem={updateItem}
            onClose={() => setOpen(false)}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
            stationTheme={stationTheme}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
