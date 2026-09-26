'use client';

import { useState } from 'react';
import { useBodyScrollLock } from '@/design-system/hooks';
import { Button, Checkbox } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { Check, ChevronLeft, Clock, RefreshCw, Tool, Wrench, X } from '@/components/Icons';
import type { RepairActionType } from '@/lib/repair-action-type-tone';
import {
  canConsumeStock,
  REPAIR_ACTION_COPY,
  REPAIR_DONOR_SOURCE_COPY,
  REPAIR_DONOR_SOURCES,
  type RepairActionRecord,
  type RepairDonorSource,
} from '@/lib/repair/repair-actions';
import { RepairBenchPhotoField } from './RepairBenchPhotoField';
import { RepairPartField, type RepairPartValue } from './RepairPartField';
import { RepairStockBinPicker } from './RepairStockBinPicker';
import { ScanValueField } from './ScanValueField';

// Bench order: the physical fix first, the waiting states last.
const TYPES: { id: RepairActionType; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'repaired', icon: Wrench },
  { id: 'replaced', icon: RefreshCw },
  { id: 'cleaned', icon: Tool },
  { id: 'tested', icon: Check },
  { id: 'awaiting_part', icon: Clock },
  { id: 'no_fix', icon: X },
];

interface Draft {
  /** repaired: the part worked on · replaced: the part taken out · cleaned/tested: the assembly. */
  partA: RepairPartValue | null;
  serialA: string;
  /** replaced: the part put in · awaiting_part: the part needed. */
  partB: RepairPartValue | null;
  serialB: string;
  /** repaired: board reference designator (C12), its value (470µF 16V), how many. */
  componentRef: string;
  componentValue: string;
  componentQty: string;
  /** replaced: where the installed part came from, and the donor unit when it came from one. */
  donorSource: RepairDonorSource | null;
  donorRef: string;
  /** replaced from new stock: take one out of a bin — the bin count and the stock ledger move together. */
  consumeStock: boolean;
  /** The bin (`locations.id`) it is taken from; required when `consumeStock`. */
  stockLocationId: number | null;
  notes: string;
}

const EMPTY: Draft = {
  partA: null,
  serialA: '',
  partB: null,
  serialB: '',
  componentRef: '',
  componentValue: '',
  componentQty: '',
  donorSource: null,
  donorRef: '',
  consumeStock: false,
  stockLocationId: null,
  notes: '',
};

/** Map the bench draft onto `repair_actions` — no second event store, no client-clock date or typed duration (`created_at` is the server's;… */
function toActionBody(type: RepairActionType, d: Draft, sessionId: number | null) {
  const baseTitle = type === 'replaced' || type === 'awaiting_part' ? d.partB?.title ?? d.partA?.title : d.partA?.title;
  const repaired = type === 'repaired';
  const replaced = type === 'replaced';
  const donorSource = replaced ? d.donorSource : null;
  const newSku = d.partB?.sku ?? null;
  return {
    actionType: type,
    partName: baseTitle?.trim() || null,
    oldSku: d.partA?.sku ?? null,
    newSku,
    oldSerial: d.serialA.trim() || null,
    newSerial: d.serialB.trim() || null,
    notes: d.notes.trim() || null,
    sessionId,
    donorSource,
    donorRef: donorSource === 'donor_unit' ? d.donorRef.trim() || null : null,
    componentRef: repaired ? d.componentRef.trim() || null : null,
    componentValue: repaired ? d.componentValue.trim() || null : null,
    componentQty: repaired && d.componentQty ? Number(d.componentQty) : null,
    ...(d.consumeStock && canConsumeStock({ actionType: type, donorSource, newSku })
      ? { consumeStock: true, stockLocationId: d.stockLocationId }
      : { consumeStock: false, stockLocationId: null }),
  };
}

/** The one reason Save is off, or null. Keeps the rule next to the fields it guards. */
function missingFor(type: RepairActionType, d: Draft): string | null {
  if (type === 'replaced' && !d.partA && !d.partB) return 'Pick the part you removed or the part you installed.';
  if (type === 'replaced' && !d.donorSource) return 'Say where the installed part came from.';
  if (type === 'replaced' && d.donorSource === 'donor_unit' && !d.donorRef.trim())
    return 'Scan the donor unit’s serial or SKU.';
  if (
    type === 'replaced' &&
    d.consumeStock &&
    d.stockLocationId == null &&
    canConsumeStock({ actionType: type, donorSource: d.donorSource, newSku: d.partB?.sku ?? null })
  )
    return 'Pick the bin you took it from.';
  if (type === 'repaired' && !d.partA && !d.componentRef.trim()) return 'Name the part or component you worked on.';
  if (type === 'awaiting_part' && !d.partB) return 'Pick the part you are waiting on.';
  if (type === 'no_fix' && !d.notes.trim()) return 'Say why it cannot be repaired.';
  return null;
}

/** Log work — the bench verb of the mobile repair workbench. */
export function RepairLogWorkSheet({
  repairId,
  sessionId,
  onClose,
  onSaved,
}: {
  repairId: number;
  /** The caller's running bench session — the entry is logged into it. */
  sessionId: number | null;
  onClose: () => void;
  /** Receives the row the server stored — its `created_at` is the work stamp. */
  onSaved: (action: RepairActionRecord) => void;
}) {
  const [type, setType] = useState<RepairActionType | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(true);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const missing = type ? missingFor(type, draft) : null;
  const stockEligible =
    type != null && canConsumeStock({ actionType: type, donorSource: draft.donorSource, newSku: draft.partB?.sku ?? null });

  const handleSave = async () => {
    if (!type || submitting || missing) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/repair/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairId, ...toActionBody(type, draft, sessionId) }),
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

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-mode-canvas">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-mode-rule bg-mode-bar px-2">
        <Button
          variant="ghost"
          size="sm"
          icon={type ? <ChevronLeft className="h-4 w-4" /> : undefined}
          onClick={() => (type ? setType(null) : onClose())}
          disabled={submitting}
        >
          {type ? 'Back' : 'Cancel'}
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-center text-role-body font-semibold text-mode-ink">
          {type ? REPAIR_ACTION_COPY[type].label : 'Log work'}
        </h2>
        <span className="w-16" aria-hidden />
      </header>

      <div className="flex-1 overflow-y-auto px-mode-page py-mode-page">
        {!type ? (
          <div className="grid grid-cols-2 gap-3">
            {TYPES.map((t) => (
              // ds-raw-button: multi-line text-left card tile (icon + label + sub), not a standard action button
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setType(t.id);
                  setDraft(EMPTY);
                  setError(null);
                }}
                className="flex min-h-mode-hit flex-col items-start gap-1 rounded-mode border border-mode-edge bg-mode-panel p-mode-page text-left transition-transform active:scale-[0.98] active:bg-mode-hover"
              >
                <t.icon className="h-5 w-5 text-mode-muted" aria-hidden />
                <p className="mt-1 text-role-body font-semibold text-mode-ink">{REPAIR_ACTION_COPY[t.id].label}</p>
                <p className="text-role-caption leading-snug text-mode-muted">{REPAIR_ACTION_COPY[t.id].sub}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {type === 'replaced' ? (
              <>
                <Group title="Taken out">
                  <RepairPartField
                    label="Part removed"
                    repairId={repairId}
                    value={draft.partA}
                    onChange={(partA) => patch({ partA })}
                    disabled={submitting}
                  />
                  <ScanValueField
                    id="rs-log-serial-removed"
                    label="Serial of the removed part"
                    value={draft.serialA}
                    onChange={(serialA) => patch({ serialA })}
                    placeholder="Scan or type"
                    mono
                    disabled={submitting}
                  />
                </Group>
                <Group title="Put in">
                  <RepairPartField
                    label="Part installed"
                    repairId={repairId}
                    value={draft.partB}
                    onChange={(partB) => patch({ partB, stockLocationId: null })}
                    disabled={submitting}
                  />
                  <ScanValueField
                    id="rs-log-serial-installed"
                    label="Serial of the installed part"
                    value={draft.serialB}
                    onChange={(serialB) => patch({ serialB })}
                    placeholder="Scan or type"
                    helper="Pulled from another unit? Scan that part's own serial here."
                    mono
                    disabled={submitting}
                  />
                </Group>
                <Group title="Where it came from">
                  <div role="radiogroup" aria-label="Part source" className="grid grid-cols-3 gap-2">
                    {REPAIR_DONOR_SOURCES.map((src) => (
                      <Choice
                        key={src}
                        selected={draft.donorSource === src}
                        onSelect={() => patch({ donorSource: src, consumeStock: false, stockLocationId: null })}
                        disabled={submitting}
                      >
                        {REPAIR_DONOR_SOURCE_COPY[src].label}
                      </Choice>
                    ))}
                  </div>
                  {draft.donorSource === 'donor_unit' ? (
                    <ScanValueField
                      id="rs-log-donor-ref"
                      label={REPAIR_DONOR_SOURCE_COPY.donor_unit.refLabel ?? 'Donor unit'}
                      value={draft.donorRef}
                      onChange={(donorRef) => patch({ donorRef })}
                      placeholder="Scan or type"
                      mono
                      disabled={submitting}
                    />
                  ) : null}
                  {stockEligible ? (
                    <>
                      <label className="flex min-h-mode-hit items-start gap-3">
                        <Checkbox
                          checked={draft.consumeStock}
                          onCheckedChange={(v) => patch({ consumeStock: v === true, stockLocationId: null })}
                          disabled={submitting}
                          className="mt-1 h-5 w-5"
                          aria-label="Take the installed part from stock"
                        />
                        <span>
                          <span className="block text-role-body font-semibold text-mode-ink">
                            Take 1 × {draft.partB?.sku} from stock
                          </span>
                          <span className="block text-role-caption text-mode-muted">
                            Takes 1 out of the bin you pick and off the stock ledger when you save. Deleting this
                            entry puts it back.
                          </span>
                        </span>
                      </label>
                      {draft.consumeStock && draft.partB?.sku ? (
                        <RepairStockBinPicker
                          sku={draft.partB.sku}
                          value={draft.stockLocationId}
                          onChange={(stockLocationId) => patch({ stockLocationId })}
                          disabled={submitting}
                        />
                      ) : null}
                    </>
                  ) : draft.donorSource === 'new_stock' && draft.partB ? (
                    <p className="text-role-caption text-mode-muted">
                      A temporary part has no stock to draw from — nothing leaves the shelf.
                    </p>
                  ) : null}
                </Group>
                <PhotoGroup repairId={repairId} disabled={submitting} />
              </>
            ) : null}

            {type === 'repaired' ? (
              <Group title="What you worked on">
                <RepairPartField
                  label="Part or board"
                  repairId={repairId}
                  value={draft.partA}
                  onChange={(partA) => patch({ partA })}
                  disabled={submitting}
                />
                <div className="grid grid-cols-[1fr_1.6fr_4.5rem] gap-2">
                  <TextField
                    label="Reference"
                    value={draft.componentRef}
                    onChange={(componentRef) => patch({ componentRef: componentRef.toUpperCase() })}
                    placeholder="C12"
                    disabled={submitting}
                  />
                  <TextField
                    label="Value"
                    value={draft.componentValue}
                    onChange={(componentValue) => patch({ componentValue })}
                    placeholder="470µF 16V"
                    disabled={submitting}
                  />
                  <TextField
                    label="Qty"
                    value={draft.componentQty}
                    onChange={(v) => patch({ componentQty: v.replace(/[^0-9]/g, '').slice(0, 3) })}
                    placeholder="1"
                    inputMode="numeric"
                    disabled={submitting}
                  />
                </div>
                <ScanValueField
                  id="rs-log-serial-part"
                  label="Part serial"
                  value={draft.serialA}
                  onChange={(serialA) => patch({ serialA })}
                  placeholder="Scan or type (optional)"
                  mono
                  disabled={submitting}
                />
              </Group>
            ) : null}

            {type === 'repaired' ? (
              <PhotoGroup repairId={repairId} disabled={submitting} />
            ) : null}

            {type === 'cleaned' || type === 'tested' ? (
              <Group title="Which part (optional)">
                <RepairPartField
                  label="Part or assembly"
                  repairId={repairId}
                  value={draft.partA}
                  onChange={(partA) => patch({ partA })}
                  disabled={submitting}
                />
              </Group>
            ) : null}

            {type === 'awaiting_part' ? (
              <Group title="Waiting on">
                <RepairPartField
                  label="Part needed"
                  repairId={repairId}
                  value={draft.partB}
                  onChange={(partB) => patch({ partB })}
                  disabled={submitting}
                />
              </Group>
            ) : null}

            <p className="text-role-caption text-mode-muted" data-testid="log-session-note">
              {sessionId != null
                ? 'Logged into your running bench timer — time comes from the timer.'
                : 'No bench timer running — this entry is logged without time.'}
            </p>

            <label className="block">
              <span className="mb-1 block text-role-caption font-semibold text-mode-muted">Notes</span>
              <textarea
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder={type === 'no_fix' ? "Why this unit can't be repaired…" : 'Anything the next person should know…'}
                rows={4}
                disabled={submitting}
                className={cn(
                  'w-full resize-none rounded-mode border border-mode-control bg-mode-panel px-3 py-2.5 text-role-field text-mode-ink',
                  focusRing('field', 'accent'),
                )}
              />
            </label>

            {error ? (
              <p role="alert" className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {type ? (
        <footer
          className="shrink-0 border-t border-mode-rule bg-mode-bar px-mode-page pt-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <Button
            variant="primary"
            size="lg"
            className="min-h-mode-hit-cta w-full rounded-mode"
            disabled={missing !== null}
            loading={submitting}
            onClick={() => void handleSave()}
          >
            {submitting ? 'Saving' : 'Save work'}
          </Button>
          {missing ? <p className="mt-1.5 text-center text-role-caption text-mode-muted">{missing}</p> : null}
        </footer>
      ) : null}
    </div>
  );
}

/**
 * Before / after shots of the work (the solder joint, the swapped board). They
 * go straight to the repair's photos; the log entry does not carry them.
 */
function PhotoGroup({ repairId, disabled }: { repairId: number; disabled: boolean }) {
  return (
    <Group title="Photos (optional)">
      <RepairBenchPhotoField repairId={repairId} side="before" disabled={disabled} />
      <RepairBenchPhotoField repairId={repairId} side="after" disabled={disabled} />
      <p className="text-role-caption text-mode-muted">Saved to this repair’s Photos as soon as you take them.</p>
    </Group>
  );
}

/** One option of a small single-choice row. */
function Choice({
  selected,
  onSelect,
  disabled,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    // ds-raw-button: radio-style segment (selected state + role=radio), not a standard action button
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'min-h-mode-hit rounded-mode border px-2 text-role-caption font-semibold leading-tight',
        selected
          ? 'border-mode-ink bg-mode-ink text-mode-bar'
          : 'border-mode-control bg-mode-panel text-mode-ink active:bg-mode-hover',
        focusRing('field', 'accent'),
      )}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-mode border border-mode-edge bg-mode-panel p-mode-page">
      <legend className="px-1 text-role-caption font-semibold uppercase tracking-[0.16em] text-mode-muted">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  inputMode,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  inputMode?: 'text' | 'numeric';
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-role-caption font-semibold text-mode-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'min-h-mode-hit w-full rounded-mode border border-mode-control bg-mode-panel px-3 text-role-field text-mode-ink',
          focusRing('field', 'accent'),
        )}
      />
      {helper ? <span className="mt-1 block text-role-caption text-mode-muted">{helper}</span> : null}
    </label>
  );
}
