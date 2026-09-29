'use client';

/**
 * Evidence column parts — the open record read as a TRIAGE evidence stack
 * (BRIEF §4 triage): what it is → evidence → decision bar.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Plus } from '@/components/Icons';
import { STATE_TONE_CLASSES } from '../../tokens/lifecycle';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, recordStateCodeClass, type RecordStateFace } from '../../tokens/industrial-record';
import { focusRing } from '../../tokens/focus-ring';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { RECORD_HIT_CLASS } from './record-ledger-geometry';
import { EvidenceDisclosure } from './EvidenceDisclosure';

/** A verb button in the evidence column. `tone` uses semantic triage colour; otherwise `primary` = ink fill. */
export function evidenceVerbClass(primary = false, tone?: RecordStateFace['tone']): string {
  const toneClass = tone ? STATE_TONE_CLASSES[tone] : null;
  return cn(
    'ds-raw-button inline-flex items-center justify-center gap-2 rounded-mode border px-3',
    'disabled:cursor-not-allowed disabled:opacity-40',
    RECORD_HIT_CLASS,
    RECORD_LABEL_CLASS,
    focusRing('control'),
    toneClass
      ? cn(toneClass.pill, toneClass.border, 'enabled:hover:brightness-[0.98]')
      : primary
        ? 'border-mode-ink bg-mode-ink text-mode-bar'
        : 'border-mode-control bg-mode-panel text-mode-ink enabled:hover:bg-mode-hover',
  );
}

/** A text / number control in the evidence column. */
export const EVIDENCE_CONTROL_CLASS = cn(
  'rounded-mode border border-mode-control bg-mode-panel px-2 text-role-data text-mode-ink',
  'placeholder:text-mode-faint',
  RECORD_HIT_CLASS,
  focusRing('control'),
);

/** The record's handle, large and selectable. */
export function EvidenceTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-b-2 border-mode-divide px-4 py-3">
      <h2 className="select-all break-all font-mono text-role-title font-black tracking-tight text-mode-ink">
        {children}
      </h2>
      {sub ? <p className="mt-1 text-role-data text-mode-muted">{sub}</p> : null}
    </div>
  );
}

/** `HLD · On hold ··· → Photo` — state and the next step, one strip. */
export function EvidenceStateStrip({ state, next }: { state: RecordStateFace; next?: string | null }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-mode-divide px-4',
        RECORD_HIT_CLASS,
      )}
    >
      <span aria-hidden className={cn('h-2 w-2 shrink-0', STATE_TONE_CLASSES[state.tone].dot)} />
      <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(state))}>
        {state.code} · {state.label}
      </span>
      {next ? <span className={cn(RECORD_LABEL_CLASS, 'ml-auto text-mode-ink')}>→ {next}</span> : null}
    </div>
  );
}

/** One evidence section: a mono label head (with an optional action) over its body. */
export function EvidenceSection({
  label,
  action,
  children,
  testId,
  card = false,
  collapsible = false,
  summary,
  icon,
  tone = 'neutral',
  defaultOpen = false,
  lazy = false,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
  /** Always-visible semantic card for primary overview content. */
  card?: boolean;
  /** Triage records disclose supporting sections just in time as soft cards. */
  collapsible?: boolean;
  summary?: ReactNode;
  icon?: ReactNode;
  tone?: RecordStateFace['tone'];
  defaultOpen?: boolean;
  /** Mount the expanded body only after the first open. */
  lazy?: boolean;
}) {
  const toneClass = STATE_TONE_CLASSES[tone];
  if (card) {
    return (
      <section
        aria-label={label}
        data-testid={testId}
        className={cn('overflow-hidden rounded-mode border bg-surface-card shadow-elev-soft', toneClass.border)}
      >
        <div className="flex min-h-14 items-center gap-3 px-3 py-2">
          {icon ? (
            <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-mode-pill', toneClass.pill, '[&_svg]:size-4')}>
              {icon}
            </span>
          ) : null}
          <h3 className={cn('min-w-0 flex-1 truncate text-role-data font-semibold', toneClass.text)}>{label}</h3>
          {action}
        </div>
        <div className={cn('border-t px-3 py-3', toneClass.border)}>{children}</div>
      </section>
    );
  }
  if (collapsible) {
    return (
      <EvidenceDisclosure
        label={label}
        summary={summary}
        testId={testId}
        variant="card"
        tone={tone}
        icon={icon}
        defaultOpen={defaultOpen}
        lazy={lazy}
      >
        <section aria-label={label} className="px-3 py-3">
          {action ? <div className="mb-3 flex min-h-7 items-center justify-end">{action}</div> : null}
          {children}
        </section>
      </EvidenceDisclosure>
    );
  }
  return (
    <section aria-label={label} data-testid={testId} className="border-b border-mode-rule px-4 py-3">
      <div className="mb-2 flex min-h-6 items-center gap-2">
        <h3 className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A fact list; pair with {@link EvidenceFact}. */
export function EvidenceFacts({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

/** One fact: mono label beside its value, ruled underneath. */
export function EvidenceFact({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-mode-rule py-1.5 last:border-b-0">
      <dt className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted')}>{label}</dt>
      <dd className={cn('min-w-0 flex-1 break-words text-mode-ink', mono ? RECORD_ID_CLASS : 'text-role-data')}>
        {children}
      </dd>
    </div>
  );
}

/** A notice at the head of the column (paired, missing, failed). */
export function EvidenceNotice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <div
      role="status"
      className={cn(
        'border-b border-mode-rule px-4 py-2 text-role-data',
        tone === 'warn' ? 'bg-mode-well text-mode-warn' : 'text-mode-ink',
      )}
    >
      {children}
    </div>
  );
}

export interface EvidenceVerb {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  testId?: string;
  /** Semantic action colour; the quiet tint matches triage state language. */
  tone?: RecordStateFace['tone'];
}

/**
 * The decision bar — at most four verbs at the foot of the column, keys 1–4
 * fire them (BRIEF §4 triage). Sticks to the column's bottom so the decision
 * is always one reach away from the evidence above it.
 */
export function EvidenceDecisionBar({ verbs }: { verbs: readonly EvidenceVerb[] }) {
  const shown = verbs.slice(0, 4);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyTarget(event.target)) return;
      const index = Number(event.key) - 1;
      const verb = Number.isInteger(index) ? shown[index] : undefined;
      if (!verb || verb.disabled) return;
      event.preventDefault();
      verb.onPress();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown]);

  return (
    <div
      role="group"
      aria-label="Decisions"
      className="sticky bottom-0 mt-auto grid gap-2 border-t border-mode-divide bg-mode-bar p-3"
      style={{ gridTemplateColumns: `repeat(${Math.min(shown.length, 2)}, minmax(0, 1fr))` }}
    >
      {shown.map((verb, index) => (
        <button
          key={verb.label}
          type="button"
          disabled={verb.disabled}
          onClick={verb.onPress}
          data-testid={verb.testId}
          aria-keyshortcuts={String(index + 1)}
          className={evidenceVerbClass(verb.primary, verb.tone)}
        >
          {verb.icon ? (
            <span aria-hidden className="flex shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
              {verb.icon}
            </span>
          ) : null}
          <span className="truncate">{verb.label}</span>
          <span aria-hidden className="opacity-60">
            {index + 1}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Keep digits only, with an optional leading minus — the amount is signed. */
function signedDraft(raw: string): string {
  const negative = raw.trim().startsWith('-');
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return negative ? `-${digits}` : digits;
}

/** − / signed amount / + / Apply — the ONE count control of every evidence column (SKU exception locations, a Stock record), so a count… */
export function EvidenceCountStepper({
  face,
  qty,
  onCommit,
  inputId,
}: {
  /** What the operator reads for this shelf (`C-04-09-2-00`). */
  face: string;
  /** What the shelf holds now. */
  qty: number;
  onCommit: (delta: number) => Promise<void>;
  inputId?: string;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = Number.parseInt(draft, 10);
  const floor = -qty;
  const delta = Number.isFinite(parsed) ? Math.max(parsed, floor) : 0;

  const apply = async () => {
    if (delta === 0 || busy) return;
    setBusy(true);
    try {
      await onCommit(delta);
      setDraft('');
      toast.success(`${face}: ${qty} → ${qty + delta}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not adjust the count.');
    } finally {
      setBusy(false);
    }
  };

  const stepClass = cn(evidenceVerbClass(false), 'w-8 px-0');
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Take one from ${face}`}
        className={stepClass}
        disabled={busy || delta <= floor}
        onClick={() => setDraft(String(Math.max(delta - 1, floor)))}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(signedDraft(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void apply();
        }}
        inputMode="numeric"
        placeholder="±0"
        aria-label={`Amount to adjust at ${face}`}
        className={cn(EVIDENCE_CONTROL_CLASS, 'w-12 text-center tabular-nums')}
      />
      <button
        type="button"
        aria-label={`Add one at ${face}`}
        className={stepClass}
        disabled={busy}
        onClick={() => setDraft(String(delta + 1))}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={evidenceVerbClass(delta !== 0)}
        disabled={delta === 0 || busy}
        onClick={() => void apply()}
      >
        {busy ? '…' : 'Apply'}
      </button>
    </div>
  );
}
