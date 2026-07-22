'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { cn } from '@/utils/_cn';

/**
 * `LedgerCellEditor` — the house **in-cell** editor for spreadsheet grids
 * (Sheets / Excel / AG Grid / W3C-APG consensus keys). One shell, typed
 * variants — never five bespoke editors.
 *
 * Renders as an opaque overlay filling the host cell (`absolute inset-0`; the
 * cell must be `relative` or `sticky`), so entering edit mode NEVER changes
 * row height — the selection law (background + ring only) applies to editing
 * too.
 *
 * Keyboard contract (the adopted industry standard):
 *   • `Enter` — commit, focus returns to the cell
 *   • `Esc`   — cancel + revert the draft
 *   • `Tab` / `Shift+Tab` — commit, then let focus move on naturally
 *   • blur / clicking another cell — **commit** (never silently drop a draft)
 *
 * Virtualization hazard (rows unmount outside the overscan window): the editor
 * **commits on unmount** when a draft is open — scrolling can never eat an
 * edit. Commit is idempotent (guarded once) and a no-op when the draft equals
 * the initial value.
 */
interface LedgerCellEditorProps {
  /** `text` (default) or `number` (right-aligned, integer, `min` floor). */
  variant?: 'text' | 'number';
  /** Value the editor opens with (edit-in-place: caret at end, content kept). */
  initialValue: string;
  /**
   * Typing-started edit (a printable char in navigate mode REPLACES content):
   * pass the typed char to seed the draft instead of `initialValue`.
   */
  replaceWith?: string | null;
  /** Commit the (trimmed) draft. Only called when it differs from initial. */
  onCommit: (next: string) => void;
  /** Close without saving (Esc) — also fired after a commit to unmount. */
  onClose: () => void;
  /** Integer floor for the `number` variant (default 1). */
  min?: number;
  placeholder?: string;
  /** Extra classes on the input (e.g. font/tone to match the cell). */
  className?: string;
  /** Accessible name for the input. */
  ariaLabel: string;
}

export function LedgerCellEditor({
  variant = 'text',
  initialValue,
  replaceWith = null,
  onCommit,
  onClose,
  min = 1,
  placeholder,
  className,
  ariaLabel,
}: LedgerCellEditorProps) {
  const [draft, setDraft] = useState(replaceWith != null ? replaceWith : initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Latest state in refs so the unmount cleanup commits the FINAL draft, and
  // Enter → blur → unmount can never double-commit.
  const doneRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const normalize = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (variant === 'number') {
      if (!trimmed) return null; // empty number draft → treat as cancel
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(n)) return null;
      return String(Math.max(min, n));
    }
    return trimmed;
  };

  const settle = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) {
      const next = normalize(draftRef.current);
      if (next != null && next !== initialValue.trim()) commitRef.current(next);
    }
    closeRef.current();
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      // Edit-in-place keeps content with the caret at the end; typing-started
      // edits already replaced the draft, so end-caret is right for both.
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    // Commit-on-unmount: a virtualized row scrolling out of the window must
    // never eat an open draft.
    return () => settleRef.current(true);
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      settle(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      settle(false);
    } else if (e.key === 'Tab') {
      // Commit, then let the browser move focus (next/prev focusable).
      e.stopPropagation();
      settle(true);
    }
  };

  return (
    <div className="absolute inset-0 z-raised flex items-center bg-surface-card ring-2 ring-inset ring-accent-bg">
      <input
        ref={inputRef}
        type="text"
        inputMode={variant === 'number' ? 'numeric' : undefined}
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => settle(true)}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'h-full w-full min-w-0 bg-transparent px-2 text-role-data text-text-default outline-none placeholder:text-text-faint',
          variant === 'number' && 'text-right font-mono tabular-nums',
          className,
        )}
      />
    </div>
  );
}
