/** Sheet-band create-form faces for flush push columns (claim compose golden). */

import {
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/utils/_cn';

const denseComposeLabelClass =
  'mb-1 block text-role-eyebrow text-text-faint';

/** Underline Subject face — short identity on a single scanning axis. */
const denseComposeSubjectInputClass = cn(
  'block h-8 w-full border-0 border-b-2 border-border-soft bg-transparent px-0 pb-0.5 pt-0',
  'text-role-caption font-semibold text-text-default outline-none',
  'placeholder:font-medium placeholder:text-text-faint',
  'focus:border-border-emphasis',
);

/**
 * Underline search face — flush like Subject, but body weight and a search
 * register. For rail / compose pickers ("Pick the existing ticket") that must
 * share the Subject/Body scanning axis instead of sitting in a rounded card.
 */
const denseComposeSearchInputClass = cn(
  'block h-9 w-full border-0 border-b-2 border-border-soft bg-transparent px-0 pb-0.5 pt-0',
  'text-role-caption font-medium text-text-default outline-none',
  'placeholder:font-medium placeholder:text-text-faint',
  'focus:border-border-emphasis',
);

/** Full-bleed sunken plane around the Body textarea (no radius / outer border). */
const denseComposeBodyBandClass = 'relative bg-surface-sunken';

/**
 * Borderless Body face inside the sunken band.
 * Hosts may append overlay pads (`pr-10` / `pb-8`) for insert rails.
 */
const denseComposeBodyTextareaClass = cn(
  'block min-h-[14rem] w-full resize-y border-0 bg-transparent inset-field',
  'text-role-caption font-medium leading-5 tracking-[0.01em] text-text-default outline-none',
  'placeholder:font-medium placeholder:text-text-faint',
);

export function DenseComposeLabel({
  className,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn(denseComposeLabelClass, className)} {...rest} />;
}

export function DenseComposeSubjectInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn(denseComposeSubjectInputClass, className)} {...rest} />;
}

export function DenseComposeSearchInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn(denseComposeSearchInputClass, className)} {...rest} />;
}

export function DenseComposeBodyBand({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(denseComposeBodyBandClass, className)} {...rest} />;
}

export const DenseComposeBodyTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function DenseComposeBodyTextarea({ className, ...rest }, ref) {
  return (
    <textarea ref={ref} className={cn(denseComposeBodyTextareaClass, className)} {...rest} />
  );
});
