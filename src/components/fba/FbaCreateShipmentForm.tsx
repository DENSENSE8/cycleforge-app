'use client';

/**
 * Despite the filename, this form creates an FBA **plan** (the prep-queue
 * record shown on UpNextOrder for techs), not an outbound shipment. The
 * shipment phase — with Amazon FBA IDs pairing 1..N UPS tracking numbers —
 * is added later via FbaShipmentEditorForm.
 */
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef } from 'react';
import { Loader2, Package, Plus, Trash2 } from '@/components/Icons';
import { Button, DeferredQtyInput, IconButton, TextField } from '@/design-system/primitives';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { buildFbaPlanRefFromIsoDate } from '@/lib/fba/plan-ref';
import type { StationTheme } from '@/utils/staff-colors';
import { fbaSidebarThemeChrome } from '@/utils/staff-colors';
import {
  FormField,
  SidebarIntakeFormShell,
} from '@/design-system/components';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

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

export interface FbaCreateShipmentFormProps {
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
            <p className="font-mono text-role-micro text-emerald-700">
              Auto: {derivedRef}
            </p>
          ) : null}
          {!isAutoRef ? (
            /* ds-raw-button: inline micro underlined text-link inside a hint stack, not a CTA */
            <button
              type="button"
              className="text-role-micro text-blue-600 underline"
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
            <p className="text-role-micro text-amber-600">
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
          value={dateKeyToLocalDate(form.due_date)}
          onChange={(day) =>
            setForm((f) => ({ ...f, due_date: localDateToDateKey(day) ?? '' }))
          }
        />
      </FormField>

      <FormField label="Tech (created by)" required>
        <select
          value={form.assigned_tech_id}
          onChange={(e) => setForm((f) => ({ ...f, assigned_tech_id: e.target.value }))}
          className={chrome.input}
        >
          <option value="">Select</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Packer" optionalHint="optional">
        <select
          value={form.assigned_packer_id}
          onChange={(e) => setForm((f) => ({ ...f, assigned_packer_id: e.target.value }))}
          className={chrome.input}
        >
          <option value="">Select</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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
                    className="rounded-lg p-1.5 hover:bg-surface-strong"
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

      {submitError ? <p className="text-sm font-semibold text-red-600">{submitError}</p> : null}
    </SidebarIntakeFormShell>
  );
}
