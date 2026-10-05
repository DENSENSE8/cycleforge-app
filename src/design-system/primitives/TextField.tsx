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

/**
 * `default` — the card field: a hairline box with the sign-in floating label
 * notched into its top edge (accent-blue on focus).
 * `flush` — joined bar cell (`rounded-none`, no outer border); host owns the
 * shared hairline. Same label.
 */
type TextFieldAppearance = 'default' | 'flush';

/**
 * THE floating field label — the one on sign-in (owner 2026-10-04: one
 * floating label everywhere, blue, never the old in-field black one). Muted
 * caption type that turns accent-blue while the field it labels has focus:
 * put it AFTER a `peer` control inside a `relative` box.
 *
 * It never leaves its host's box, so no `overflow-hidden` parent can clip it:
 * - `notch` (a boxed field) — sits on the field's top hairline; the host box
 *   carries `FLOATING_LABEL_NOTCH_ROOM` (pt-2) so the notch is inside it.
 * - `inset` (a flush joined-bar cell, which has no hairline of its own and
 *   abuts its neighbours) — sits inside the cell's top edge.
 */
export function FloatingFieldLabel({
  htmlFor,
  id,
  placement = 'notch',
  children,
}: {
  htmlFor?: string;
  id?: string;
  placement?: 'notch' | 'inset';
  children: ReactNode;
}) {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <Tag
      {...(htmlFor ? { htmlFor } : {})}
      id={id}
      className={cn(
        'pointer-events-none absolute text-role-caption font-semibold leading-4 text-text-muted transition-colors duration-150 peer-focus:text-blue-600 peer-focus-visible:text-blue-600',
        placement === 'notch' ? 'left-3 top-0 bg-surface-card px-1.5' : 'left-3.5 top-1',
      )}
    >
      {children}
    </Tag>
  );
}

/** The room a notched label needs above its field, inside the host box (half the label's 16px line). */
export const FLOATING_LABEL_NOTCH_ROOM = 'pt-2';

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  /** Floating label. */
  label: string;
  /** Controlled value. */
  value: string;
  /** Receives the next raw string value. */
  onChange: (value: string) => void;
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

/** Floating-label text field — the house "Floating-label field". */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      value,
      onChange,
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
    const flush = appearance === 'flush';

    // Shared chrome — flush joins a host bar (no own radius/border); default keeps the sign-in field box.
    const sharedClass = cn(
      'peer block w-full bg-surface-card text-sm text-text-default outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-transparent focus:ring-2 disabled:cursor-not-allowed disabled:bg-surface-canvas disabled:text-text-faint',
      flush
        ? cn(cornerClass('flush'), 'border-0 px-3.5 focus:ring-inset focus:ring-blue-600/20')
        : 'rounded-mode-control border border-border-soft px-4 hover:border-blue-300 focus:border-blue-600 focus:ring-blue-600/20',
      mono && 'font-mono',
      inputClassName,
    );

    return (
      <div className={cn('relative w-full min-w-0', flush ? 'h-11' : FLOATING_LABEL_NOTCH_ROOM, className)}>
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
            className={cn(sharedClass, flush ? 'resize-none pb-2 pt-5 leading-snug' : 'resize-none pb-3 pt-4 leading-snug')}
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
            className={cn(sharedClass, flush ? 'h-11 pb-1 pt-5' : 'h-12 py-3', trailing && 'pr-12')}
            {...inputProps}
          />
        )}
        <FloatingFieldLabel htmlFor={fieldId} placement={flush ? 'inset' : 'notch'}>{label}</FloatingFieldLabel>
        {trailing && !multiline ? (
          <div className={cn('absolute bottom-0 right-1.5 flex items-center', flush ? 'top-0' : 'top-2')}>{trailing}</div>
        ) : null}
      </div>
    );
  },
);
