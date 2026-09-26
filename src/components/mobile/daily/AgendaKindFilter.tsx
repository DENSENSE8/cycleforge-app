'use client';

/**
 * AgendaKindFilter — the KIND control of the one task list:
 * checkmark rows (operator 2026-09-23). SELECTION lives here; ARRANGEMENT
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { Popover } from '@/design-system/primitives/Popover';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { DailyAgendaType } from '@/lib/daily/daily-agenda-row';
import {
  AGENDA_KINDS,
  AGENDA_KIND_LABEL,
  DEFAULT_AGENDA_KIND_PREFS,
  parseAgendaKindPrefs,
  toggleAgendaKind,
  type AgendaKindPrefs,
} from '@/lib/daily/agenda-kind-filter';

const PREFS_KEY = 'cf-agenda-kind-prefs';

/**
 * The shared prefs state — band ORDER + which kinds are off, persisted to
 * localStorage. Both the phone and the desk mount this hook: the dropdown
 * writes `off`, the draggable band titles write `order`.
 */
export function useAgendaKindPrefs() {
  const [prefs, setPrefs] = useState<AgendaKindPrefs>(DEFAULT_AGENDA_KIND_PREFS);

  const update = useRef((next: AgendaKindPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* private mode / quota — the session still filters, it just forgets */
    }
  }).current;

  // Hydrate from storage on mount — SSR paints the default, the stored truth
  // lands one commit later without a hydration mismatch.

  useEffect(() => {
    const stored = window.localStorage.getItem(PREFS_KEY);
    if (stored) setPrefs(parseAgendaKindPrefs(stored));
  }, []);

  const toggle = (kind: DailyAgendaType) => update(toggleAgendaKind(prefs, kind));
  const reorder = (order: readonly DailyAgendaType[]) =>
    update({ ...prefs, order });

  return { prefs, toggle, reorder };
}

export function AgendaKindFilter({
  prefs,
  onToggle,
  className,
}: {
  prefs: AgendaKindPrefs;
  onToggle: (kind: DailyAgendaType) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const showingCount = AGENDA_KINDS.length - prefs.off.length;

  return (
    <div className={cn('flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className={cn(
          'ds-raw-button flex h-8 items-center gap-1.5 border border-border-soft bg-surface-card px-2.5',
          'text-role-caption font-semibold text-text-soft hover:text-text-default',
          cornerClass('flush'),
          focusRing('control'),
        )}
      >
        Kinds
        <span className="tabular-nums text-text-faint">
          {showingCount}/{AGENDA_KINDS.length}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        role="menu"
        aria-label="Filter the list by kind"
        className="min-w-56 p-1"
      >
        {prefs.order.map((kind) => {
          const showing = !prefs.off.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              role="menuitemcheckbox"
              aria-checked={showing}
              onClick={() => onToggle(kind)}
              className={cn(
                'ds-raw-button flex min-h-11 w-full items-center gap-2.5 px-3 text-left',
                'text-role-caption font-semibold text-text-default hover:bg-surface-hover',
                focusRing('control'),
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center border',
                  cornerClass('flush'),
                  showing ? 'border-border-strong bg-surface-inverse text-text-inverse' : 'border-border-soft',
                )}
              >
                {showing ? <Check className="h-3 w-3" /> : null}
              </span>
              {AGENDA_KIND_LABEL[kind]}
            </button>
          );
        })}
      </Popover>
    </div>
  );
}
