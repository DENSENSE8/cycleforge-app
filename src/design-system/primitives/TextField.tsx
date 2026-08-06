'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export type TextFieldTone = 'blue' | 'amber' | 'emerald' | 'neutral';

/**
 * `default` — soft card field (`rounded-xl` + border).
 * `flush` — joined industrial bar cell (`rounded-none`, no outer border); host
 * owns the shared hairline. Floating label stays inside the field cell width.
 */
type TextFieldAppearance = 'default' | 'flush';

const toneClass: Record<
  TextFieldTone,
  { input: string; floatLabel: string; focusLabel: string }
> = {
  blue: {
    input: 'border-border-soft focus:border-blue-500 focus:ring-blue-500/20',
    floatLabel: 'text-blue-600',
    focusLabel: 'peer-focus:text-blue-600',
  },
  amber: {
    input: 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/25',
    floatLabel: 'text-amber-600',
    focusLabel: 'peer-focus:text-amber-600',
  },
  emerald: {
    input: 'border-emerald-500 focus:border-emerald-600 focus:ring-emerald-500/25',
    floatLabel: 'text-emerald-600',
    focusLabel: 'peer-focus:text-emerald-600',
  },
  neutral: {
    input: 'border-border-soft focus:border-border-strong focus:ring-border-strong/10',
    floatLabel: 'text-text-soft',
    focusLabel: 'peer-focus:text-text-default',
  },
};

/** Flush cell — no own border; inset ring on focus so the join seam stays. */
const flushToneClass: Record<TextFieldTone, { input: string; floatLabel: string; focusLabel: string }> = {
  blue: {
    input: 'border-0 focus:ring-inset focus:ring-blue-500/30',
    floatLabel: 'text-blue-600',
    focusLabel: 'peer-focus:text-blue-600',
  },
  amber: {
    input: 'border-0 focus:ring-inset focus:ring-amber-500/30',
    floatLabel: 'text-amber-600',
    focusLabel: 'peer-focus:text-amber-600',
  },
  emerald: {
    input: 'border-0 focus:ring-inset focus:ring-emerald-500/30',
    floatLabel: 'text-emerald-600',
    focusLabel: 'peer-focus:text-emerald-600',
  },
  neutral: {
    input: 'border-0 focus:ring-inset focus:ring-border-strong/15',
    floatLabel: 'text-text-soft',
    focusLabel: 'peer-focus:text-text-default',
  },
};

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  /**
   * Floating label. Sits centered inside the field as the placeholder while the
   * input is empty and unfocused, then animates up into the top border on focus
   * — or stays up whenever the field holds a value. So the label doubles as the
   * placeholder and the header, with no separate placeholder text.
   */
  label: string;
  /** Controlled value. */
  value: string;
  /** Receives the next raw string value. */
  onChange: (value: string) => void;
  /** Accent for the focused border + floated label. */
  tone?: TextFieldTone;
  /**
   * `flush` = joined scan-bar cell (square, borderless); host owns the outer
   * hairline. Label + fill stay inside the field width — no L/R bleed.
   */
  appearance?: TextFieldAppearance;
  /** Render the input value in a monospace font (serial / tracking scans). */
  mono?: boolean;
  /** Control pinned to the right edge inside the field (e.g. a clear button). */
  trailing?: ReactNode;
  /** Classes for the outer wrapper. */
  className?: string;
  /** Extra classes appended to the <input> / <textarea>. */
  inputClassName?: string;
  /** Render a multi-line <textarea> instead of a single-line <input>. */
  multiline?: boolean;
  /** Row count for the multiline variant. Default 2. */
  rows?: number;
}

/**
 * Floating-label text field — the real implementation of the `/design-demo`
 * "Floating-label field" (03 · Inputs). Replaces the static label-above-input
 * forms: the label animates into the border on focus/fill.
 *
 * The float state is derived from `value` (so it stays up when filled), while
 * the `peer-focus:` variants raise the label on focus even when empty. No
 * leading icon — the motion is the affordance.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      value,
      onChange,
      tone = 'blue',
      appearance = 'default',
      mono = false,
      trailing,
      className = '',
      inputClassName = '',
      multiline = false,
      rows = 2,
      id,
      disabled,
      ...inputProps
    },
    ref,
  ) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const float = value.length > 0;
    const flush = appearance === 'flush';
    const t = flush ? flushToneClass[tone] : toneClass[tone];

    // Shared chrome — flush joins a host bar (no own radius/border); default keeps soft card.
    const sharedClass = cn(
      'peer block w-full bg-surface-card px-3.5 text-sm text-text-default outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-transparent focus:ring-2 disabled:cursor-not-allowed disabled:bg-surface-canvas disabled:text-text-faint',
      flush ? cornerClass('flush') : 'rounded-xl border',
      mono && 'font-mono',
      t.input,
      inputClassName,
    );

    return (
      <div className={cn('relative w-full min-w-0', flush && 'h-11', className)}>
        {multiline ? (
          <textarea
            id={fieldId}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            // A single space keeps the native placeholder empty while the
            // floating <label> owns the empty-state text.
            placeholder=" "
            rows={rows}
            className={cn(sharedClass, 'resize-none pb-2 pt-5 leading-snug')}
            {...(inputProps as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref}
            id={fieldId}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder=" "
            className={cn(sharedClass, 'h-11 pb-1 pt-5', trailing && 'pr-9')}
            {...inputProps}
          />
        )}
        <label
          htmlFor={fieldId}
          className={cn(
            'pointer-events-none absolute left-3.5 origin-left transition-all duration-150',
            float
              ? cn('top-1.5 text-role-micro font-semibold uppercase tracking-wide', t.floatLabel)
              : cn(multiline ? 'top-5' : 'top-3', 'text-sm text-text-faint'),
            'peer-focus:top-1.5 peer-focus:text-role-micro peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wide',
            t.focusLabel,
          )}
        >
          {label}
        </label>
        {trailing && !multiline ? (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>
        ) : null}
      </div>
    );
  },
);
