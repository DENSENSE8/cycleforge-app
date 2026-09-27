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

export type KeyboardKeySize = 'xs' | 'sm' | 'md';

/**
 * Which ground the cap is sitting on.
 *
 * `default` — page chrome: gray sunken face, black letter, soft lift.
 * `inverse` — an inverse surface (the hover tooltip chip). The cap must READ
 * as a hint, not as a target: it is darker than the chip it sits on, outlined
 * with a light hairline, and carries no lift. A light face here (the default
 * tone) grabs the eye harder than the sentence it is explaining
 * (operator 2026-09-05).
 */
export type KeyboardKeyTone = 'default' | 'inverse';

const SIZE_CLASS: Record<KeyboardKeySize, string> = {
  /** Inline inside a tooltip chip — the smallest cap there is. */
  xs: 'h-4 min-w-4 px-1',
  /** Selection CTA overlay — square face inside the Button. */
  sm: 'h-5 min-w-5 px-1',
  /** Cheat-sheet / hint row — slightly wider reading chip. */
  md: 'min-h-5 min-w-[1.5rem] px-1.5 py-0.5',
};

/**
 * Geometry every cap shares. Case, weight and tracking are TONE decisions, not
 * shared ones: a teaching key on page chrome shouts (uppercase, tracked out), a
 * hint on a tooltip does not.
 */
const KEYBOARD_KEY_STRUCTURE = cn(
  'inline-flex shrink-0 items-center justify-center',
  'text-role-micro font-mono tabular-nums',
  SEGMENTED_CONTROL_FACE_CORNER,
);

const TONE_CLASS: Record<KeyboardKeyTone, string> = {
  default: cn(
    'border border-border-soft bg-surface-sunken',
    'ring-1 ring-inset ring-border-hairline',
    'font-semibold uppercase tracking-widest text-text-default',
    elevationClass('raised', 'soft'),
  ),
  // Darker than the chip, light hairline, dimmed letter, no shadow. Sentence
  // case and normal tracking: the cap is read, not announced.
  inverse: cn(
    'border border-glass/20 bg-scrim/40',
    'font-medium normal-case tracking-normal text-text-inverse-soft',
  ),
};

/**
 * Shared face classes — import this (or {@link KeyboardKey}) instead of
 * hand-rolling another gray/black kbd.
 */
export const KEYBOARD_KEY_FACE_CLASS = cn(KEYBOARD_KEY_STRUCTURE, TONE_CLASS.default);

export type KeyboardKeyProps = {
  children: ReactNode;
  size?: KeyboardKeySize;
  tone?: KeyboardKeyTone;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>;

export function KeyboardKey({
  children,
  size = 'md',
  tone = 'default',
  className,
  ...rest
}: KeyboardKeyProps) {
  return (
    <kbd
      data-testid="keyboard-key"
      data-keyboard-key-tone={tone}
      className={cn(KEYBOARD_KEY_STRUCTURE, TONE_CLASS[tone], SIZE_CLASS[size], className)}
      {...rest}
    >
      {children}
    </kbd>
  );
}

/**
 * Split a written chord into its caps: `'Shift + Tab'` → `['Shift', 'Tab']`.
 *
 * Chords are authored as ONE display string next to the behaviour that owns
 * them (e.g. `STATION_COMPOSER_CYCLE_CHORD`), so a hint and a cheat sheet can
 * never drift. This is the single place that turns that string into keycaps.
 */
export function chordKeys(chord: string): string[] {
  return chord
    .split('+')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/**
 * A whole chord as keycaps — one {@link KeyboardKey} per key, never a single
 * cap reading "Shift + Tab". Used by the hover tooltip (cursor chip and
 * anchored bubble both) so a taught chord looks the same wherever it lands.
 *
 * Defaults are the tooltip's: `sm` on the `inverse` ground. The cap is sized
 * to sit beside a 13px `role-nav` sentence without looking stranded under it —
 * `xs` reads as a speck next to readable text. Tone, not size, is what keeps a
 * cap from out-shouting the sentence it explains.
 */
export function KeyboardChord({
  chord,
  size = 'sm',
  tone = 'inverse',
  className,
}: {
  chord: string;
  size?: KeyboardKeySize;
  tone?: KeyboardKeyTone;
  className?: string;
}) {
  const keys = chordKeys(chord);
  if (keys.length === 0) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)} aria-hidden>
      {keys.map((key) => (
        <KeyboardKey key={key} size={size} tone={tone}>
          {key}
        </KeyboardKey>
      ))}
    </span>
  );
}
