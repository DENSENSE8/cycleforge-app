'use client';

/** Evidence-column facts that disclose in ledger rows or softer triage-record cards. */
import { useState, type ReactNode } from 'react';
import { Minus, Plus } from '@/components/Icons';
import {
  RECORD_LABEL_CLASS,
  RECORD_TRAILING_CELL_CLASS,
  type RecordStateFace,
} from '@/design-system/tokens/record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Desk hit floor for a disclosure row (32px). */
const HIT_CLASS = 'min-h-mode-hit';

const SUMMARY_CLASS = cn(
  'flex min-w-0 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden',
  focusRing('control'),
);

/** One fact row: mono label beside (or over, `wide`) its value, ruled underneath. */
export function EvidenceFactRow({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 border-b border-mode-fact', wide ? 'flex-col py-2' : 'items-center')}>
      <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted', !wide && 'py-2')}>{label}</span>
      <div className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</div>
    </div>
  );
}

/**
 * A collapsible block of the evidence column: label, summary, then + collapsed
 * / − expanded on the trailing axis. The body owns its own content; the header
 * is never repeated inside.
 */
export function EvidenceDisclosure({
  label,
  summary,
  testId,
  lazy = false,
  defaultOpen = false,
  variant = 'ledger',
  tone = 'neutral',
  icon,
  children,
}: {
  label: string;
  summary?: ReactNode;
  testId?: string;
  /** Mount the body on first open — a collapsed section costs no fetch. */
  lazy?: boolean;
  /** Start expanded (the section is the work still to do); the operator's toggle wins after mount. */
  defaultOpen?: boolean;
  /** `card` is the softer, semantic-colour face used inside triage records. */
  variant?: 'ledger' | 'card';
  /** Semantic colour for the card icon and border; ignored by the ledger face. */
  tone?: RecordStateFace['tone'];
  /** Optional section glyph. The card face gives it the tone's pill treatment. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(defaultOpen);
  const [open, setOpen] = useState(defaultOpen);
  const card = variant === 'card';
  const toneClass = STATE_TONE_CLASSES[tone];
  return (
    <details
      data-testid={testId}
      open={open}
      className={cn(
        'group/section',
        card
          ? cn('overflow-hidden rounded-mode border bg-surface-card shadow-elev-soft', toneClass.border)
          : 'border-b border-mode-fact',
      )}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        if (lazy && next) setOpened(true);
      }}
    >
      <summary
        className={cn(
          SUMMARY_CLASS,
          HIT_CLASS,
          card
            ? 'min-h-14 gap-3 px-3 py-2 transition-colors hover:bg-mode-hover'
            : 'px-4',
        )}
      >
        {/* One left edge for every value in the panel (owner 2026-09-26):
            the label column is the fact rows' w-24, the summary starts after it. */}
        {card && icon ? (
          <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-mode-pill', toneClass.pill, '[&_svg]:size-4')}>
            {icon}
          </span>
        ) : null}
        {card ? (
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className={cn('truncate text-role-data font-semibold', toneClass.text)}>{label}</span>
            {summary ? (
              <span className="truncate text-role-caption text-mode-muted group-open/section:hidden">{summary}</span>
            ) : null}
          </span>
        ) : (
          <>
            <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted')}>{label}</span>
            <span className="flex min-w-0 flex-1 items-center justify-start truncate">{summary}</span>
          </>
        )}
        <span aria-hidden className={cn(RECORD_TRAILING_CELL_CLASS, 'text-mode-muted')}>
          <Plus className="h-3.5 w-3.5 group-open/section:hidden" />
          <Minus className="hidden h-3.5 w-3.5 group-open/section:block" />
        </span>
      </summary>
      <div className={cn('border-t', card ? toneClass.border : 'border-mode-fact')}>
        {!lazy || opened ? children : null}
      </div>
    </details>
  );
}

/**
 * A fact that stays ONE row (label · value · +/−) and expands in place for its
 * details and editor. The expanded body never repeats the value.
 */
export function EvidenceFactDisclosure({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <details data-testid={testId} className="group/fact border-b border-mode-fact">
      <summary className={cn(SUMMARY_CLASS, HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 py-2 text-mode-muted')}>{label}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-role-data text-mode-ink">{value}</span>
        <span aria-hidden className={cn(RECORD_TRAILING_CELL_CLASS, 'text-mode-muted')}>
          <Plus className="h-3.5 w-3.5 group-open/fact:hidden" />
          <Minus className="hidden h-3.5 w-3.5 group-open/fact:block" />
        </span>
      </summary>
      <div className="flex flex-col gap-1 pb-2 pl-24">{children}</div>
    </details>
  );
}
