'use client';

import { useState } from 'react';
import { useBodyScrollLock } from '@/design-system/hooks';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { Check, Clock, RefreshCw, Tool, Wrench, X } from '@/components/Icons';
import type { RepairActionType } from '@/lib/repair-action-type-tone';
import { REPAIR_ACTION_COPY, type RepairActionRecord } from '@/lib/repair/repair-actions';

interface Props {
  repairId: number;
  onClose: () => void;
  /** Receives the row the server stored — its `created_at` is the work stamp. */
  onSaved: (action: RepairActionRecord) => void;
}

// Bench order: the physical fix first, the waiting states last.
const TYPES: { id: RepairActionType; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'repaired', icon: Wrench },
  { id: 'replaced', icon: RefreshCw },
  { id: 'cleaned', icon: Tool },
  { id: 'tested', icon: Check },
  { id: 'awaiting_part', icon: Clock },
  { id: 'no_fix', icon: X },
];

interface FormState {
  partName: string;
  oldSku: string;
  newSku: string;
  oldSerial: string;
  newSerial: string;
  durationMin: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  partName: '',
  oldSku: '',
  newSku: '',
  oldSerial: '',
  newSerial: '',
  durationMin: '',
  notes: '',
};

export function AddRepairActionSheet({ repairId, onClose, onSaved }: Props) {
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [actionType, setActionType] = useState<RepairActionType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(true);

  const pick = (t: RepairActionType) => {
    setActionType(t);
    setStep('details');
  };

  const handleSave = async () => {
    if (!actionType || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/repair/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repairId,
          actionType,
          partName: form.partName || null,
          oldSku: form.oldSku || null,
          newSku: form.newSku || null,
          oldSerial: form.oldSerial || null,
          newSerial: form.newSerial || null,
          durationMin: form.durationMin ? Number(form.durationMin) : null,
          notes: form.notes || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(body?.details || body?.error || `HTTP ${res.status}`);
      }
      onSaved(body.action as RepairActionRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const showReplacement = actionType === 'replaced';
  const showPartName = actionType === 'replaced' || actionType === 'repaired';
  const showDuration =
    actionType === 'repaired' ||
    actionType === 'tested' ||
    actionType === 'cleaned' ||
    actionType === 'replaced';

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-mode-panel">
      <header className="flex shrink-0 items-center justify-between border-b border-mode-rule bg-mode-bar px-mode-page py-3">
        {step === 'type' ? (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-default">
              Log work
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep('type')}>
              ← Back
            </Button>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-default">
              {actionType && REPAIR_ACTION_COPY[actionType].label}
            </h2>
            {/* ds-raw-button: solid-orange repair-theme save CTA — no orange DS Button variant */}
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-role-caption font-semibold uppercase tracking-wide text-white shadow-sm active:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-mode-page py-mode-page">
        {step === 'type' && (
          <div className="grid grid-cols-2 gap-3">
            {TYPES.map((t) => (
              // ds-raw-button: multi-line text-left card tile (icon + label + sub), not a standard action button
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                className="flex min-h-mode-hit flex-col items-start gap-1 rounded-mode border border-mode-edge bg-mode-panel p-mode-page active:bg-mode-hover active:scale-[0.98] transition-transform"
              >
                <t.icon className="h-5 w-5 text-text-muted" aria-hidden />
                <p className="mt-1 text-sm font-semibold text-text-default">{REPAIR_ACTION_COPY[t.id].label}</p>
                <p className="text-role-micro font-semibold text-text-soft leading-snug">{REPAIR_ACTION_COPY[t.id].sub}</p>
              </button>
            ))}
          </div>
        )}

        {step === 'details' && actionType && (
          <div className="space-y-3">
            {showPartName && (
              <Field
                label="Part name"
                value={form.partName}
                onChange={(v) => setForm({ ...form, partName: v })}
                placeholder="Battery, USB-C port, speaker driver…"
                autoFocus
              />
            )}

            {showReplacement && (
              <>
                <Field
                  label="Old SKU (removed)"
                  value={form.oldSku}
                  onChange={(v) => setForm({ ...form, oldSku: v })}
                  placeholder="SKU of the defective part"
                  mono
                />
                <Field
                  label="New SKU (replacement)"
                  value={form.newSku}
                  onChange={(v) => setForm({ ...form, newSku: v })}
                  placeholder="SKU of the new part"
                  mono
                />
                <Field
                  label="Old serial (optional)"
                  value={form.oldSerial}
                  onChange={(v) => setForm({ ...form, oldSerial: v })}
                  placeholder="Serial removed"
                  mono
                />
                <Field
                  label="New serial (optional)"
                  value={form.newSerial}
                  onChange={(v) => setForm({ ...form, newSerial: v })}
                  placeholder="Serial installed"
                  mono
                />
              </>
            )}

            {showDuration && (
              <Field
                label="Duration (min)"
                value={form.durationMin}
                onChange={(v) => setForm({ ...form, durationMin: v.replace(/[^0-9]/g, '') })}
                placeholder="15"
                inputMode="numeric"
              />
            )}

            <FieldTextarea
              label="Notes"
              value={form.notes}
              onChange={(v) => setForm({ ...form, notes: v })}
              placeholder={
                actionType === 'no_fix'
                  ? 'Why this unit can\'t be repaired…'
                  : 'What you did, anything notable…'
              }
            />

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: 'text' | 'numeric';
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-role-micro uppercase tracking-[0.14em] text-text-soft mb-1">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={`min-h-mode-hit w-full rounded-mode border border-mode-control bg-mode-panel px-3 text-mode-body font-semibold text-mode-ink outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-role-micro uppercase tracking-[0.14em] text-text-soft mb-1">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className={cn("w-full rounded-mode border border-mode-control bg-mode-panel px-3 py-2.5 text-mode-body font-medium text-mode-ink resize-none", focusRing('field', 'warning'))}
      />
    </label>
  );
}
