'use client';

/**
 * The phone checkout's single-choice controls, both real radiogroups (one tab
 * stop, arrows move and select), in the form's TRIAGE voice (owner
 * 2026-09-27: the phone form reads like the desk form):
 * - {@link MobileChoiceRows} — a job's big fork (how it ships, how it's paid):
 *   touch rows, a rule under each, the pick washed in accent with a check.
 * - {@link MobileChoiceGrid} — a small fact pick (tender, brand, entry):
 *   rounded touch cells in a gapped grid, the pick washed in accent.
 * Press washes (`active:bg-mode-hover`), never inverts — inversion is the
 * industrial floor's feedback, not a form's.
 */

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export interface MobileChoiceOption<T extends string> {
  value: T;
  label: string;
  /** One quiet line under the label (rows only). */
  hint?: ReactNode;
}

interface ChoiceProps<T extends string> {
  label: string;
  options: ReadonlyArray<MobileChoiceOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Each option gets `${testId}-${value}`. */
  testId: string;
}

/** Roving radiogroup keyboard: arrows move and select; the pick (or the first) holds the tab stop. */
function useRadioKeys<T extends string>({ options, value, onChange }: Pick<ChoiceProps<T>, 'options' | 'value' | 'onChange'>) {
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || options.length === 0) return;
    event.preventDefault();
    const at = options.findIndex((o) => o.value === value);
    const next = (at + step + options.length) % options.length;
    onChange(options[next]!.value);
    radios.current[next]?.focus();
  };
  const focusable = options.some((o) => o.value === value) ? value : options[0]?.value;
  const bind = (index: number) => (node: HTMLButtonElement | null) => {
    radios.current[index] = node;
  };
  return { onKeyDown, focusable, bind };
}

export function MobileChoiceRows<T extends string>({ label, options, value, onChange, testId }: ChoiceProps<T>) {
  const keys = useRadioKeys({ options, value, onChange });
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={keys.onKeyDown} className="flex flex-col" data-testid={testId}>
      {options.map((o, index) => {
        const on = value === o.value;
        return (
          // ds-raw-button: full-bleed radio row (label + hint + trailing check), not an action button
          <button
            key={o.value}
            ref={keys.bind(index)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={keys.focusable === o.value ? 0 : -1}
            onClick={() => onChange(o.value)}
            data-testid={`${testId}-${o.value}`}
            className={cn(
              'group flex min-h-mode-hit-cta w-full items-center gap-3 border-b border-mode-rule px-mode-page py-2.5 text-left last:border-b-0',
              on ? 'bg-surface-accent' : 'bg-mode-panel active:bg-mode-hover',
              focusRing('field', 'accent'),
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-mode-body font-semibold text-mode-ink">
                {o.label}
              </span>
              {o.hint ? (
                <span className="block text-role-caption text-mode-muted">
                  {o.hint}
                </span>
              ) : null}
            </span>
            {on ? <Check className="h-5 w-5 shrink-0 text-text-accent" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function MobileChoiceGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
  columns = 3,
}: ChoiceProps<T> & { columns?: 2 | 3 | 4 }) {
  const keys = useRadioKeys({ options, value, onChange });
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={keys.onKeyDown}
      className={cn('grid gap-2 px-mode-page py-2', columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}
      data-testid={testId}
    >
      {options.map((o, index) => {
        const on = value === o.value;
        return (
          // ds-raw-button: flush radio cell (selected state + role=radio), not an action button
          <button
            key={o.value}
            ref={keys.bind(index)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={keys.focusable === o.value ? 0 : -1}
            onClick={() => onChange(o.value)}
            data-testid={`${testId}-${o.value}`}
            className={cn(
              'min-h-mode-hit rounded-mode-control border px-2 text-role-caption font-semibold leading-tight text-mode-ink',
              on ? 'border-border-accent bg-surface-accent' : 'border-mode-rule bg-mode-panel active:bg-mode-hover',
              focusRing('field', 'accent'),
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
