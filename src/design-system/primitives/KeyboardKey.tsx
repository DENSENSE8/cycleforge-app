'use client';

/**
 * KeyboardKey — ONE physical keycap face for teaching chords.
 *
 * Gray sunken face + black letter. Overlay it on a Button (absolute right) or
 * place it inline in a cheat sheet — same paint either way. Do not fork a
 * second `<kbd>` recipe for hotkey teaching.
 */

import type { HTMLAttributes, ReactNode } from 'react';
import { SEGMENTED_CONTROL_FACE_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

export type KeyboardKeySize = 'sm' | 'md';

const SIZE_CLASS: Record<KeyboardKeySize, string> = {
  /** Selection CTA overlay — square face inside the Button. */
  sm: 'h-5 min-w-5 px-1',
  /** Cheat-sheet / hint row — slightly wider reading chip. */
  md: 'min-h-5 min-w-[1.5rem] px-1.5 py-0.5',
};

/**
 * Shared face classes — import this (or {@link KeyboardKey}) instead of
 * hand-rolling another gray/black kbd.
 */
export const KEYBOARD_KEY_FACE_CLASS = cn(
  'inline-flex shrink-0 items-center justify-center',
  'border border-border-soft bg-surface-sunken',
  'ring-1 ring-inset ring-border-hairline',
  'text-role-micro font-mono font-semibold uppercase tracking-widest tabular-nums text-text-default',
  SEGMENTED_CONTROL_FACE_CORNER,
  elevationClass('raised', 'soft'),
);

export type KeyboardKeyProps = {
  children: ReactNode;
  size?: KeyboardKeySize;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>;

export function KeyboardKey({
  children,
  size = 'md',
  className,
  ...rest
}: KeyboardKeyProps) {
  return (
    <kbd
      data-testid="keyboard-key"
      className={cn(KEYBOARD_KEY_FACE_CLASS, SIZE_CLASS[size], className)}
      {...rest}
    >
      {children}
    </kbd>
  );
}
