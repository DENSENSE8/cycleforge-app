'use client';

/** Despite the filename, this form creates an FBA **plan** (the prep-queue record shown on UpNextOrder for techs), not an outbound shipment. */
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Package, Plus, Trash2 } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { Button, DeferredQtyInput, IconButton, TextField } from '@/design-system/primitives';
import { buildFbaPlanRefFromIsoDate } from '@/lib/fba/plan-ref';
import type { StationTheme } from '@/utils/staff-colors';
import { fbaSidebarThemeChrome } from '@/utils/staff-colors';
import {
  FormField,
  SidebarIntakeFormShell,
} from '@/design-system/components';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

export interface FbaCreateShipmentFormState {
  shipment_ref: string;
  destination_fc: string;
  due_date: string;
  notes: string;
  assigned_tech_id: string;
  assigned_packer_id: string;
  items: Array<{ fnsku: string; expected_qty: string }>;
}

interface StaffMember {
  id: number;
  name: string;
  role: string;
}

interface FbaCreateShipmentFormProps {
  staff: StaffMember[];
  form: FbaCreateShipmentFormState;
  setForm: Dispatch<SetStateAction<FbaCreateShipmentFormState>>;
  addItem: () => void;
  removeItem: (index: number) => void;
  updateItem: (index: number, field: 'fnsku' | 'expected_qty', value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  stationTheme?: StationTheme;
}

export function FbaCreateShipmentForm({
  staff,
  form,
  setForm,
  addItem,
  removeItem,
  updateItem,
  onClose,
  onSubmit,
  submitting,
  submitError,
  stationTheme = 'blue',
}: FbaCreateShipmentFormProps) {
  const chrome = fbaSidebarThemeChrome[stationTheme];
  const techAnchorRef = useRef<HTMLButtonElement>(null);
  const packerAnchorRef = useRef<HTMLButtonElement>(null);
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [packerPickerOpen, setPackerPickerOpen] = useState(false);
  const selectedTechId = Number(form.assigned_tech_id) || null;
  const selectedPackerId = Number(form.assigned_packer_id) || null;
  const selectedTech = staff.find((member) => member.id === selectedTechId) ?? null;
  const selectedPacker = staff.find((member) => member.id === selectedPackerId) ?? null;

  // Auto-derive plan ref from due_date using buildFbaPlanRefFromIsoDate.
  // Tracks the last auto-derived value so user overrides are preserved.
  const lastAutoRefRef = useRef<string>('');
  const derivedRef = useMemo(
    () => (form.due_date ? buildFbaPlanRefFromIsoDate(form.due_date) : ''),
    [form.due_date],
  );
  const isAutoRef =
    form.shipment_ref === '' || form.shipment_ref === lastAutoRefRef.current;
  const refIsInvalid = form.shipment_ref === 'FBA-00/00/00';

  useEffect(() => {
    if (!derivedRef || derivedRef === 'FBA-00/00/00') return;
    if (isAutoRef) {
      lastAutoRefRef.current = derivedRef;
      setForm((f) => ({ ...f, shipment_ref: derivedRef }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedRef]);

  const canSubmit = Boolean(
    form.shipment_ref.trim() &&
    !refIsInvalid &&
    Number(form.assigned_tech_id),
  );

  return (
    <SidebarIntakeFormShell
      title="New FBA plan"
      subtitle="Plan mode"
      subtitleAccent={stationTheme}
      onClose={onClose}
      footer={
        /* ds-raw-button: themed gradient solid CTA (blue→sky / emerald→teal) via chrome.primaryButton */
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
          className={chrome.primaryButton}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Package className="h-4 w-4" />
              Create plan
            </span>
          )}
        </button>
      }
    >
      <div className="space-y-2">
        <TextField
          label="Plan ID"
          value={form.shipment_ref}
          onChange={(next) => {
            lastAutoRefRef.current = '';
            setForm((f) => ({ ...f, shipment_ref: next }));
          }}
          required
          mono
        />
        <div className="space-y-1">
          {derivedRef && derivedRef !== 'FBA-00/00/00' ? (
            <p className="font-mono text-role-micro text-text-success">
              Auto: {derivedRef}
            </p>
          ) : null}
          {!isAutoRef ? (
            /* ds-raw-button: inline micro underlined text-link inside a hint stack, not a CTA */
            <button
              type="button"
              className="text-role-micro text-text-accent underline"
              onClick={() => {
                if (!derivedRef || derivedRef === 'FBA-00/00/00') return;
                lastAutoRefRef.current = derivedRef;
                setForm((f) => ({ ...f, shipment_ref: derivedRef }));
              }}
            >
              Reset to auto
            </button>
          ) : null}
          {refIsInvalid ? (
            <p className="text-role-micro text-text-warning">
              Invalid plan ref. Set a valid due date or type a custom ref.
            </p>
          ) : null}
          <p className="text-role-micro leading-snug text-text-soft">
            Stored as shipment_ref — not the internal DB row id or Amazon&apos;s FBA shipment id.
          </p>
        </div>
      </div>

      <TextField
        label="FC code"
        value={form.destination_fc}
        onChange={(next) => setForm((f) => ({ ...f, destination_fc: next }))}
      />

      <FormField label="Due date">
        <DateRangePickerField
          variant="compact"
          ariaLabel="FBA plan due date"
          value={dateKeyToLocalDate(form.due_date)}
          onChange={(day: Date) => {
            const dueDate = localDateToDateKey(day);
            if (dueDate) setForm((f) => ({ ...f, due_date: dueDate }));
          }}
        />
      </FormField>

      <FormField label="Tech (created by)" required>
        <Button
          ref={techAnchorRef}
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          aria-haspopup="listbox"
          aria-expanded={techPickerOpen}
          ariaLabel="Select FBA plan technician"
          onClick={() => setTechPickerOpen(true)}
        >
          {selectedTech ? (
            <span className="flex min-w-0 items-center gap-2">
              <StaffAvatar staffId={selectedTech.id} name={selectedTech.name} size="sm" colorRing alt="" />
              <span className="truncate">{selectedTech.name}</span>
            </span>
          ) : (
            'Select technician…'
          )}
        </Button>
        <StageStaffAssignPopover
          open={techPickerOpen}
          onClose={() => setTechPickerOpen(false)}
          anchorRef={techAnchorRef}
          label="Select FBA plan technician"
          role="technician"
          selectedStaffId={selectedTechId}
          onCommit={(staffId) => setForm((f) => ({ ...f, assigned_tech_id: staffId == null ? '' : String(staffId) }))}
        />
      </FormField>

      <FormField label="Packer" optionalHint="optional">
        <Button
          ref={packerAnchorRef}
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          aria-haspopup="listbox"
          aria-expanded={packerPickerOpen}
          ariaLabel="Select FBA plan packer"
          onClick={() => setPackerPickerOpen(true)}
        >
          {selectedPacker ? (
            <span className="flex min-w-0 items-center gap-2">
              <StaffAvatar staffId={selectedPacker.id} name={selectedPacker.name} size="sm" colorRing alt="" />
              <span className="truncate">{selectedPacker.name}</span>
            </span>
          ) : (
            'Select packer…'
          )}
        </Button>
        <StageStaffAssignPopover
          open={packerPickerOpen}
          onClose={() => setPackerPickerOpen(false)}
          anchorRef={packerAnchorRef}
          label="Select FBA plan packer"
          role="packer"
          selectedStaffId={selectedPackerId}
          onCommit={(staffId) => setForm((f) => ({ ...f, assigned_packer_id: staffId == null ? '' : String(staffId) }))}
        />
      </FormField>

      <TextField
        label="Notes (optional)"
        value={form.notes}
        onChange={(next) => setForm((f) => ({ ...f, notes: next }))}
      />

      <div className="space-y-3 border-t border-border-hairline pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className={chrome.lineItemLabel}>FBA line items</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addItem}
            icon={<Plus />}
            className={chrome.secondaryButton}
          >
            Add line
          </Button>
        </div>

        {form.items.map((item, i) => (
          <div key={i} className={chrome.lineItemShell}>
            <div className="flex items-center justify-between gap-2">
              <span className={chrome.lineItemLabel}>Line {i + 1}</span>
              {form.items.length > 1 ? (
                <HoverTooltip label="Remove line" asChild>
                  <IconButton
                    type="button"
                    onClick={() => removeItem(i)}
                    ariaLabel="Remove line"
                    icon={<Trash2 className="h-4 w-4" />}
                    size="sm"
                    radius="flush"
                    className="hover:bg-surface-strong"
                  />
                </HoverTooltip>
              ) : null}
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  label="FNSKU"
                  value={item.fnsku}
                  onChange={(next) => updateItem(i, 'fnsku', next)}
                  mono
                />
              </div>
              <div className="w-14 shrink-0">
                <FormField label="Qty">
                  <DeferredQtyInput
                    value={Math.max(0, parseInt(item.expected_qty, 10) || 0)}
                    onChange={(v) => updateItem(i, 'expected_qty', String(v))}
                    min={0}
                    className={`${chrome.input} text-center`}
                  />
                </FormField>
              </div>
            </div>
          </div>
        ))}
      </div>

      {submitError ? <p className="text-sm font-semibold text-text-danger">{submitError}</p> : null}
    </SidebarIntakeFormShell>
  );
}
