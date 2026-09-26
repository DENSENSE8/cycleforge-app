'use client';

/**
 * Controls of the receiving-order composer — the vocabulary every composer
 * section is written in. Deliberately not the shared form primitives: the
 * composer is one fixed-width industrial sheet (`ReceivingOrderSheet`), so each
 * field is a flush recessed box on its ruled grid — label above, mono value,
 * 32px hit — and nothing floats, animates or rounds.
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { RECORD_LABEL_CLASS, RECORD_RECESS_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const BOX_CLASS = cn(
  'w-full min-w-0 bg-mode-canvas px-2 font-mono text-role-data text-mode-ink placeholder:text-mode-faint',
  'disabled:cursor-not-allowed disabled:text-mode-faint',
  RECORD_RECESS_CLASS,
  focusRing('field'),
);

/** One titled band of the sheet: mono caption over a 1px ink rule. */
export function ComposerSection({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-mode-ink" aria-label={label}>
      <header className="flex h-8 items-center gap-2 border-b border-mode-rule bg-mode-bar px-4">
        <h3 className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>{label}</h3>
        {trailing}
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
    </section>
  );
}

/** Label-over-box field. `required` marks the caption, never the colour alone. */
export function ComposerField({
  label,
  required = false,
  missing = false,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  missing?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={cn(RECORD_LABEL_CLASS, missing ? 'text-mode-warn' : 'text-mode-muted')}>
        {label}
        {required ? <span aria-hidden> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </span>
      {children}
    </label>
  );
}

export const ComposerInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function ComposerInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(BOX_CLASS, 'h-8', className)} {...props} />;
  },
);

export function ComposerTextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BOX_CLASS, 'min-h-20 resize-y py-1.5', className)} {...props} />;
}

export function ComposerSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={cn(BOX_CLASS, 'h-8 cursor-pointer')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type ComposerButtonTone = 'primary' | 'quiet' | 'ghost';

const BUTTON_TONE: Record<ComposerButtonTone, string> = {
  primary: 'border border-mode-ink bg-mode-ink text-mode-bar hover:opacity-90',
  quiet: 'border border-mode-ink bg-mode-panel text-mode-ink hover:bg-mode-hover',
  ghost: 'border border-transparent text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
};

export function ComposerButton({
  tone = 'quiet',
  icon,
  busy = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ComposerButtonTone;
  icon?: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 px-3',
        RECORD_LABEL_CLASS,
        BUTTON_TONE[tone],
        'disabled:cursor-not-allowed disabled:opacity-40',
        focusRing('control'),
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Square glyph-only control (close, remove). `label` is its accessible name. */
export function ComposerIconButton({
  label,
  icon,
  className,
  type = 'button',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
        'disabled:cursor-not-allowed disabled:opacity-30',
        focusRing('control'),
        className,
      )}
      {...props}
    >
      <span aria-hidden className="inline-flex">{icon}</span>
    </button>
  );
}

/** Two-way kind switch on the sheet head — a pressed square, not a tab strip. */
export function ComposerKindSwitch<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K;
  options: readonly { value: K; label: string; icon: ReactNode }[];
  onChange: (value: K) => void;
}) {
  return (
    <div role="group" aria-label="Order kind" className="flex border border-mode-ink">
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 px-3',
              RECORD_LABEL_CLASS,
              pressed ? 'bg-mode-ink text-mode-bar' : 'bg-mode-panel text-mode-muted hover:bg-mode-hover',
              focusRing('control'),
            )}
          >
            <span aria-hidden className="inline-flex">{option.icon}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Status line at the sheet foot: what still blocks the submit, in words. */
export function ComposerStatus({ tone, children }: { tone: 'ready' | 'blocked' | 'error'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'min-w-0 flex-1 text-role-caption',
        tone === 'ready' ? 'text-mode-muted' : 'text-mode-warn',
      )}
    >
      {children}
    </p>
  );
}
