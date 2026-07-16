'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/_cn';

const MARGIN = 6;
const MAX_WIDTH = 248;

/**
 * Hover preview for a filled meta-row indicator (Notes / Out of stock).
 *
 * Unlike {@link HoverTooltip} (a dark, above, help-text bubble), this shows a
 * light card-surface **preview below** the trigger — a readable multi-line
 * snippet of the stored value. When `editable`, the trigger is a real button and
 * a click engages inline editing (the row opens its `RowInlineEditBubble`), so
 * the same icon both previews and edits. Body-portaled + viewport-clamped so a
 * scrolling / virtualized row never clips it.
 */
export interface RowFieldPreviewProps {
  label: string;
  value: string;
  tone?: 'default' | 'danger';
  /** When true the trigger is a button and clicking calls `onEdit`. */
  editable?: boolean;
  onEdit?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** The indicator icon. */
  children: ReactNode;
}

export function RowFieldPreview({
  label,
  value,
  tone = 'default',
  editable = false,
  onEdit,
  children,
}: RowFieldPreviewProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; caret: number } | null>(null);

  const show = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r && r.width >= 2 && r.height >= 2) {
      setAnchor(r);
      setPos(null);
    }
  };
  const hide = () => {
    setAnchor(null);
    setPos(null);
  };

  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rawLeft = anchor.left + anchor.width / 2 - b.width / 2;
    const left = Math.min(Math.max(rawLeft, MARGIN), Math.max(MARGIN, vw - b.width - MARGIN));
    // Prefer below the trigger; flip above only when there isn't room.
    let top = anchor.bottom + MARGIN;
    if (top + b.height > vh - MARGIN) top = Math.max(MARGIN, anchor.top - b.height - MARGIN);
    const caret = Math.min(Math.max(anchor.left + anchor.width / 2 - left, 10), b.width - 10);
    setPos({ top, left, caret });
  }, [anchor]);

  const isDanger = tone === 'danger';
  const flippedAbove = pos != null && anchor != null && pos.top < anchor.top;

  const bubble =
    anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              maxWidth: MAX_WIDTH,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="pointer-events-none fixed z-tooltip rounded-lg border border-border-soft bg-surface-card p-2 shadow-lg"
          >
            {/* Caret — points up to the trigger (or down when the bubble flipped above). */}
            <span
              aria-hidden
              style={{ left: pos?.caret ?? 20 }}
              className={cn(
                'absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-sm bg-surface-card',
                flippedAbove ? '-bottom-1 border-b border-r' : '-top-1 border-l border-t',
                isDanger ? 'border-red-200' : 'border-border-soft',
              )}
            />
            <p
              className={cn(
                'mb-0.5 text-role-eyebrow uppercase tracking-widest leading-none',
                isDanger ? 'text-red-500' : 'text-text-soft',
              )}
            >
              {label}
            </p>
            <p className="max-h-24 overflow-hidden whitespace-pre-wrap break-words text-role-caption text-text-default">
              {value}
            </p>
            {editable ? (
              <p className="mt-1 text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
                Click to edit
              </p>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  const commonHandlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };

  if (editable) {
    return (
      <>
        {/* ds-raw-button: full-cell inline-edit trigger (owns a ref), not a Button action */}
        <button
          type="button"
          ref={(n) => {
            triggerRef.current = n;
          }}
          {...commonHandlers}
          onClick={(e) => {
            e.stopPropagation();
            hide();
            onEdit?.(e);
          }}
          aria-label={`Edit ${label.toLowerCase()}`}
          className="ds-raw-button inline-flex items-center rounded hover:bg-surface-hover"
        >
          {children}
        </button>
        {bubble}
      </>
    );
  }

  return (
    <>
      <span
        ref={(n) => {
          triggerRef.current = n;
        }}
        tabIndex={0}
        {...commonHandlers}
        className="inline-flex items-center"
      >
        {children}
      </span>
      {bubble}
    </>
  );
}
