'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';

const MARGIN = 8;
const BUBBLE_WIDTH = 264;

/**
 * Notion-style inline-edit bubble — a body-portaled popover with a caret pointing
 * up to its trigger, a single free-text entry, and a checkmark to commit.
 *
 * House pattern: like {@link HoverTooltip} it portals to `document.body` and
 * positions from the trigger's rect, so a scrolling / virtualized table row can
 * never clip it. Commits on the checkmark, on Enter, or on an outside click
 * (click-off); Esc cancels without saving. The parent owns the value + the save
 * mutation (e.g. `useOrderAssignment` writing `notes` / `outOfStock`).
 */
export interface RowInlineEditBubbleProps {
  /** The trigger element to anchor under. When null the bubble renders nothing. */
  anchor: HTMLElement | null;
  title: string;
  value: string;
  onChange: (value: string) => void;
  /** Commit — called on checkmark, Enter, and outside-click. */
  onSave: () => void;
  /** Dismiss without saving — Esc. */
  onClose: () => void;
  placeholder?: string;
  /** `danger` tints the header + caret red (out-of-stock); default is neutral. */
  tone?: 'default' | 'danger';
  saving?: boolean;
}

export function RowInlineEditBubble({
  anchor,
  title,
  value,
  onChange,
  onSave,
  onClose,
  placeholder,
  tone = 'default',
  saving = false,
}: RowInlineEditBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Keep the latest save callback in a ref so the outside-click listener never
  // captures a stale draft (mirrors OutOfStockEditorBlock's onSubmitRef).
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [pos, setPos] = useState<{ top: number; left: number; caret: number } | null>(null);

  // Position under the anchor; caret centered on the trigger, clamped to viewport.
  useLayoutEffect(() => {
    if (!anchor) return;
    const compute = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = bubbleRef.current?.offsetWidth || BUBBLE_WIDTH;
      const rawLeft = r.left + r.width / 2 - width / 2;
      const left = Math.min(Math.max(rawLeft, MARGIN), Math.max(MARGIN, vw - width - MARGIN));
      const top = r.bottom + MARGIN;
      const caret = Math.min(Math.max(r.left + r.width / 2 - left, 12), width - 12);
      setPos({ top, left, caret });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [anchor]);

  // Autofocus the entry once mounted.
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Click-off (outside both the bubble and its trigger) commits — Notion-style.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bubbleRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onSaveRef.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor]);

  if (typeof document === 'undefined' || !anchor) return null;

  const isDanger = tone === 'danger';

  return createPortal(
    <div
      ref={bubbleRef}
      role="dialog"
      onClick={(e) => e.stopPropagation()}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: BUBBLE_WIDTH,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="fixed z-panelPopover rounded-xl border border-border-soft bg-surface-card p-2.5 shadow-lg"
    >
      {/* Caret — a rotated square showing its top-left borders, pointing at the trigger. */}
      <span
        aria-hidden
        style={{ left: pos?.caret ?? BUBBLE_WIDTH / 2 }}
        className={cn(
          'absolute -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm border-l border-t bg-surface-card',
          isDanger ? 'border-red-200' : 'border-border-soft',
        )}
      />
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={cn(
            'text-eyebrow font-black uppercase tracking-widest leading-none',
            isDanger ? 'text-red-500' : 'text-text-soft',
          )}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-label="Save"
          className="ds-raw-button inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent text-caption text-text-default outline-none placeholder:text-text-faint"
      />
      <p className="mt-1 text-eyebrow font-bold uppercase tracking-widest text-text-faint">
        Enter to save · Esc to cancel
      </p>
    </div>,
    document.body,
  );
}
