'use client';

/**
 * KeyboardKey — ONE physical keycap face for teaching chords.
 *
 * It must read as a KEY you can press, not a letter in a sentence
 * (operator 2026-09-27): a square white cap with a hairline edge and a
 * bottom lip — the shadow a real keycap casts — and dark, sentence-case
 * letters. Overlay it on a Button (absolute right) or place it inline in a
 * hint, a menu or a cheat sheet — same paint everywhere. Do not fork a
 * second `<kbd>` recipe for hotkey teaching.
 */

import type { HTMLAttributes, ReactNode } from 'react';
import { SEGMENTED_CONTROL_FACE_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { platformKeyFace, useApplePlatform } from '@/lib/keyboard/chord-keys';

export type KeyboardKeySize = 'xs' | 'sm' | 'md';

/**
 * Which ground the cap is sitting on. Both tones are the SAME keycap —
 * square face, hairline edge, 1px bottom lip — and both are theme-agnostic:
 * the lip is mixed from the cap's own ink (`currentColor`), so it reads in
 * light, dark and every palette theme without a per-theme value.
 *
 * `default` — page chrome: card face, soft border, default ink.
 * `inverse` — a tooltip chip or any inverse surface: the face, edge and lip
 * are all mixed from the chip's ink, so the cap follows whatever colour the
 * chip paints its sentence in.
 */
export type KeyboardKeyTone = 'default' | 'inverse';

const SIZE_CLASS: Record<KeyboardKeySize, string> = {
  /** Inline in a search well, a menu row or a tooltip — square, readable at 32px. */
  xs: 'h-[18px] min-w-[18px] px-1',
  /** Selection CTA overlay — square face inside the Button. */
  sm: 'h-5 min-w-5 px-1',
  /** Cheat-sheet / hint row — slightly wider reading chip. */
  md: 'min-h-6 min-w-6 px-1.5 py-0.5',
};

/**
 * Geometry every cap shares: sans, sentence case ("Ctrl", "Shift", "Alt"; a
 * letter key reads as printed), normal tracking — a key is READ, never
 * announced (operator 2026-09-27: "softer, not all caps, not loud"). The
 * cap is at least as wide as it is tall, so a single letter is a SQUARE key.
 */
const KEYBOARD_KEY_STRUCTURE = cn(
  'inline-flex shrink-0 items-center justify-center leading-none',
  'text-role-micro font-sans font-semibold normal-case tracking-normal tabular-nums',
  SEGMENTED_CONTROL_FACE_CORNER,
);

const TONE_CLASS: Record<KeyboardKeyTone, string> = {
  default: cn(
    'border border-border-soft bg-surface-card text-text-default',
    'shadow-[0_1px_0_0_color-mix(in_oklab,currentColor_22%,transparent)]',
  ),
  // The face lifts only 5%: at 12% it pulled white ink on a solid AA fill (amber-700 / emerald-700 /
  // blue-600, 5.0–5.5:1) down to 4.1–4.3:1 on the cap. The edge and lip still carve the key.
  inverse: cn(
    'border border-current/30 bg-current/5 text-current',
    'shadow-[0_1px_0_0_color-mix(in_oklab,currentColor_40%,transparent)]',
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
  // Every cap names the key THIS device has (⌘ vs Ctrl, ⇧ vs Shift) — never "⌘/Ctrl".
  const apple = useApplePlatform();
  return (
    <kbd
      data-testid="keyboard-key"
      data-keyboard-key-tone={tone}
      className={cn(KEYBOARD_KEY_STRUCTURE, TONE_CLASS[tone], SIZE_CLASS[size], className)}
      {...rest}
    >
      {typeof children === 'string' ? platformKeyFace(children, apple) : children}
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
 * Alternatives are written ` or `-separated (`'\ or / or Ctrl + \'`) and
 * paint as cap groups with a quiet "or" between them — a key is never left
 * as plain text inside the sentence.
 *
 * Defaults are the tooltip's: `sm` on the `inverse` ground. The cap is sized
 * to sit beside a 13px `role-nav` sentence without looking stranded under it.
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
  const groups = chord
    .split(/\s+or\s+/)
    .map(chordKeys)
    .filter((keys) => keys.length > 0);
  if (groups.length === 0) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)} aria-hidden>
      {groups.map((keys, group) => (
        <span key={group} className="inline-flex items-center gap-1">
          {group > 0 ? <span className="px-0.5 text-role-micro opacity-70">or</span> : null}
          {keys.map((key) => (
            <KeyboardKey key={key} size={size} tone={tone}>
              {key}
            </KeyboardKey>
          ))}
        </span>
      ))}
    </span>
  );
}
