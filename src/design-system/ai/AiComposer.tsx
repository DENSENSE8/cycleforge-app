'use client';

import {
  useLayoutEffect,
  useRef,
  type ClipboardEventHandler,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/utils/_cn';
import { AI_COMPOSER_SHELL_CLASS } from './classes';

/** Rows the field grows through before it scrolls (≈ 8 lines of prose). */
const MAX_FIELD_HEIGHT_PX = 208;

export interface AiComposerProps {
  value: string;
  onChange: (next: string) => void;
  /** Enter (without Shift, outside an IME composition). Empty drafts never submit. */
  onSubmit: () => void;
  placeholder?: string;
  /** Accessible name of the field. */
  ariaLabel?: string;
  /** Bottom-left actions — the `+` menu. */
  leading?: ReactNode;
  /** Bottom-right actions — send / dictate. */
  trailing?: ReactNode;
  /** The field, for callers that focus it (seeds, suggestions). */
  textareaRef?: RefObject<HTMLTextAreaElement>;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  /**
   * Runs before the Enter contract. Call `preventDefault()` to consume the key
   * (a mention list picking with Enter, ↑ recalling the last message).
   */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Floats above the field (mention list, editing chip) — anchor with `bottom-full`. */
  overlay?: ReactNode;
  className?: string;
}

/**
 * AiComposer — the AI surface's one input.
 *
 * A soft shell (the roundest object on screen) holding an auto-growing field
 * over one action row. It is deliberately NOT `StationComposerHost`: no mode
 * row, no presence avatar, no ticket faces — an AI conversation has exactly one
 * destination. The surface owns the draft; this owns the field's geometry and
 * the Enter / Shift+Enter contract.
 */
export function AiComposer({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask anything…',
  ariaLabel = 'Message',
  leading,
  trailing,
  textareaRef,
  onPaste,
  onKeyDown: onFieldKeyDown,
  overlay,
  className,
}: AiComposerProps) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = textareaRef ?? ownRef;

  // Grow with the draft: one write-read-write per value change, capped so a
  // pasted essay scrolls inside the field instead of pushing the page.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = '0px';
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD_HEIGHT_PX)}px`;
  }, [fieldRef, value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onFieldKeyDown?.(e);
    if (e.defaultPrevented || e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (value.trim()) onSubmit();
  };

  return (
    <div className={cn(AI_COMPOSER_SHELL_CLASS, 'relative flex flex-col', className)} data-ai-composer>
      {overlay}
      <textarea
        ref={fieldRef}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="block w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-ai-prose text-ai-ink outline-none placeholder:text-ai-faint"
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex min-w-0 items-center gap-1">{leading}</div>
        <div className="flex shrink-0 items-center gap-1">{trailing}</div>
      </div>
    </div>
  );
}
