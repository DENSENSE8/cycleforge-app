'use client';

/**
 * Segmented one-time-code field — one box per character (desk pairing code,
 * OTP, authenticator code). The native pattern every auth app uses: the
 * keyboard comes up already capitalised, a keystroke advances, Backspace
 * retreats, and a paste / SMS autofill of the whole code spreads across boxes.
 *
 * Why a primitive and not a `TextField`: a free-text field makes the operator
 * hold Shift (or hunt for Caps Lock) for a code that is uppercase by
 * definition, gives no per-character target, and needs a second line of chrome
 * to echo what was typed. The boxes ARE the echo.
 *
 * `transform` owns the alphabet: it runs on every candidate string, so
 * lowercase input is uppercased on the way in and characters outside the
 * alphabet never reach state (default: uppercase alphanumerics).
 *
 * Callers: `SignInQrScanDialog` (desk→phone pairing code, length 4).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { MOBILE_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Default alphabet: uppercase alphanumerics — the OTP / pairing-code norm. */
export function uppercaseAlphanumeric(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** The code after an edit plus the box that should now hold the caret. */
export interface CodeEdit {
  value: string;
  focusIndex: number;
}

/**
 * Write `typed` at box `index`, overwriting that box and spilling rightward —
 * so one character advances one box and a full-code paste lands whole from
 * wherever it was dropped. Empty `typed` clears the box.
 *
 * `typed` MUST already be normalized by the field's `transform`.
 */
export function writeCodeChars(
  code: string,
  index: number,
  typed: string,
  length: number,
): CodeEdit {
  const head = code.slice(0, index);
  const tail = code.slice(index + 1);
  if (!typed) {
    return { value: head + tail, focusIndex: index };
  }
  const next = (head.padEnd(index, '') + typed + tail.slice(typed.length - 1)).slice(0, length);
  return { value: next, focusIndex: Math.min(index + typed.length, length - 1) };
}

/**
 * Backspace semantics operators expect: clear this box if it holds a
 * character, otherwise eat the character to the left and step back.
 */
export function backspaceCode(code: string, index: number): CodeEdit {
  if (code[index]) {
    return { value: code.slice(0, index) + code.slice(index + 1), focusIndex: index };
  }
  if (index === 0) return { value: code, focusIndex: 0 };
  return { value: code.slice(0, index - 1) + code.slice(index), focusIndex: index - 1 };
}

export interface OneTimeCodeInputProps {
  /** Current code — shorter than `length` while it is being typed. */
  value: string;
  /** Receives the normalized code after every edit (already `transform`ed). */
  onChange: (next: string) => void;
  /** Fires on the edit that fills the last box — wire submit here (OTP behaviour). */
  onComplete?: (code: string) => void;
  /** Number of boxes. */
  length?: number;
  /** Accessible group label; each box announces "<label>, character N of M". */
  label: string;
  /**
   * Normalizer for typed / pasted text. MUST be idempotent and MUST NOT
   * lengthen its input. Defaults to {@link uppercaseAlphanumeric}.
   */
  transform?: (raw: string) => string;
  /** Digit-only codes pass `numeric` so phones raise the number pad. */
  inputMode?: 'text' | 'numeric';
  disabled?: boolean;
  /** Paints the danger edge — the code was rejected. */
  invalid?: boolean;
  /** Focus the first unfilled box on mount. */
  autoFocus?: boolean;
  className?: string;
}

const BOX_CLASS =
  'h-14 border bg-surface-card text-center font-mono text-xl font-semibold uppercase text-text-default transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:bg-surface-canvas disabled:text-text-faint';

/** Six boxes still have to fit a 320px phone dialog — tighten past four. */
const WIDE_BOX = 'w-12';
const NARROW_BOX = 'w-10';

export function OneTimeCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  transform = uppercaseAlphanumeric,
  inputMode = 'text',
  disabled,
  invalid,
  autoFocus,
  className,
}: OneTimeCodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  /** `onComplete` fires on the EDIT that completes the code, never on re-render. */
  const completedRef = useRef(false);

  const chars = useMemo(
    () => Array.from({ length }, (_, i) => value[i] ?? ''),
    [value, length],
  );

  const focusBox = useCallback((index: number) => {
    const el = refs.current[Math.max(0, Math.min(index, refs.current.length - 1))];
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    focusBox(Math.min(value.length, length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only autofocus
  }, [autoFocus, disabled]);

  const commit = useCallback(
    (edit: CodeEdit) => {
      const normalized = transform(edit.value).slice(0, length);
      onChange(normalized);
      focusBox(edit.focusIndex);
      if (normalized.length < length) {
        completedRef.current = false;
        return;
      }
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete?.(normalized);
    },
    [focusBox, length, onChange, onComplete, transform],
  );

  const handleChange = useCallback(
    (index: number, raw: string) => {
      const prev = chars[index];
      let incoming = raw;
      // A controlled one-char box reports "old+new" (or "new+old") depending on
      // caret position — drop one instance of what was already there.
      if (prev && incoming.length > 1) {
        const at = incoming.indexOf(prev);
        if (at >= 0) incoming = incoming.slice(0, at) + incoming.slice(at + 1);
      }
      commit(writeCodeChars(value, index, transform(incoming), length));
    },
    [chars, commit, length, transform, value],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        commit(backspaceCode(value, index));
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        commit(writeCodeChars(value, index, '', length));
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        focusBox(index - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusBox(index + 1);
      }
    },
    [commit, focusBox, length, value],
  );

  const handlePaste = useCallback(
    (index: number, e: ClipboardEvent<HTMLInputElement>) => {
      const pasted = transform(e.clipboardData.getData('text'));
      if (!pasted) return;
      e.preventDefault();
      // A full-length paste always means "this is the code", wherever it landed.
      commit(
        pasted.length >= length
          ? { value: pasted, focusIndex: length - 1 }
          : writeCodeChars(value, index, pasted, length),
      );
    },
    [commit, length, transform, value],
  );

  const numeric = inputMode === 'numeric';

  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex justify-center', length > 4 ? 'gap-1.5' : 'gap-2', className)}
    >
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          value={char}
          disabled={disabled}
          inputMode={inputMode}
          // iOS raises its number pad off `pattern`, not `inputMode` alone.
          pattern={numeric ? '[0-9]*' : undefined}
          autoCapitalize={numeric ? 'off' : 'characters'}
          autoCorrect="off"
          spellCheck={false}
          // Only the first box claims the autofill target; the rest must not
          // compete for the SMS / authenticator suggestion.
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label}, character ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            BOX_CLASS,
            length > 4 ? NARROW_BOX : WIDE_BOX,
            MOBILE_CONTROL_CORNER,
            focusRing('field', invalid ? 'danger' : 'accent'),
            invalid ? 'border-border-danger' : char ? 'border-border-strong' : 'border-border-soft',
          )}
        />
      ))}
    </div>
  );
}
