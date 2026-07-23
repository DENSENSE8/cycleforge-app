'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { AlertTriangle, Check, FileText, Maximize2 } from '@/components/Icons';
import { Popover } from '@/design-system/primitives/Popover';
import { Calendar } from '@/design-system/components/Calendar';
import { conditionOptions, conditionDescription, resolveConditionGrade } from '@/lib/conditions';
import { conditionGradeTextClass, conditionGradeTone } from '@/lib/condition-tone';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

/**
 * Cell-anchored editor popovers for the Pending grid (Phase 4/4b of the
 * industry-standard grid plan). All three compose the house {@link Popover}
 * (AnchoredLayer portal — never clipped by the virtualized scroll surface) and
 * commit through the parent's `useOrderAssignment` waist.
 *
 * Shared keyboard contract (Sheets):
 *   Enter commit (Shift+Enter newline in multiline) · Esc cancel + revert ·
 *   outside click / blur commit — never silently drop a draft.
 *
 * Every panel swallows clicks (`stopPropagation`): the popovers portal to
 * `document.body` but React portal events still bubble through the REACT tree
 * to the host row, which would open the record.
 */

// ─── Free-text (note · OOS reason · listing link) ───────────────────────────

interface CellTextEditPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  /** Panel edge/alignment vs the anchor (default 'bottom-start'). Corner-
   *  indicator editors pass 'bottom-end' so the panel opens AT the corner —
   *  the Sheets note-bubble position — not across the row. */
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  title: string;
  /** `danger` tints the header (out-of-stock); default neutral. */
  tone?: 'default' | 'danger';
  initialValue: string;
  /** Multiline textarea (notes). Single-line input for identifiers/links. */
  multiline?: boolean;
  placeholder?: string;
  /** Quiet helper line under the entry (e.g. the derived listing URL). */
  hint?: string;
  onCommit: (next: string) => void;
  /** Always fired once when the editor settles (commit or cancel). */
  onDone: () => void;
  saving?: boolean;
}

export function CellTextEditPopover({
  anchorRef,
  placement = 'bottom-start',
  title,
  tone = 'default',
  initialValue,
  multiline = false,
  placeholder,
  hint,
  onCommit,
  onDone,
  saving = false,
}: CellTextEditPopoverProps) {
  const [draft, setDraft] = useState(initialValue);
  const entryRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const doneRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const settle = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit && draftRef.current.trim() !== initialValue.trim()) {
      onCommit(draftRef.current.trim());
    }
    onDone();
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Commit-on-unmount (a virtualized row scrolling away can't eat the draft),
  // StrictMode-safe: the cleanup only SCHEDULES the commit; a synchronous
  // re-mount (dev double-effect) cancels it, so only a REAL unmount settles.
  const unmountingRef = useRef(false);
  useEffect(() => {
    unmountingRef.current = false;
    const t = setTimeout(() => {
      const el = entryRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    }, 0);
    return () => {
      clearTimeout(t);
      unmountingRef.current = true;
      setTimeout(() => {
        if (unmountingRef.current) settleRef.current(true);
      }, 0);
    };
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      settle(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      settle(false);
    }
  };

  const isDanger = tone === 'danger';
  const entryClass =
    'w-full resize-none bg-transparent text-role-caption text-text-default outline-none placeholder:text-text-faint';

  return (
    <Popover
      open
      // Outside click commits (Sheets blur-commit); Esc is handled on the
      // entry itself so cancel and commit can differ.
      onClose={() => settle(true)}
      closeOnEscape={false}
      anchorRef={anchorRef}
      placement={placement}
      role="dialog"
      aria-label={title}
      className="w-64"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={cn(
            'text-role-eyebrow uppercase tracking-widest leading-none',
            isDanger ? 'text-red-500' : 'text-text-soft',
          )}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={() => settle(true)}
          disabled={saving}
          aria-label="Save"
          className="ds-raw-button inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
      {multiline ? (
        <textarea
          ref={(el) => { entryRef.current = el; }}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={entryClass}
        />
      ) : (
        <input
          ref={(el) => { entryRef.current = el; }}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(entryClass, 'font-mono')}
        />
      )}
      {hint ? (
        <p className="mt-1 truncate text-role-eyebrow font-semibold normal-case tracking-normal text-text-faint">
          {hint}
        </p>
      ) : null}
      <p className="mt-1 text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
        {multiline ? 'Enter save · Shift+Enter line · Esc cancel' : 'Enter to save · Esc to cancel'}
      </p>
    </Popover>
  );
}

// ─── Condition — chip-as-trigger listbox over the condition SoT ─────────────

interface ConditionSelectPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  current: string | null;
  onSelect: (value: string | null) => void;
  onDone: () => void;
}

export function ConditionSelectPopover({
  anchorRef,
  current,
  onSelect,
  onDone,
}: ConditionSelectPopoverProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const options = conditionOptions('table');
  // Alias-aware match ("NEW" → BRAND_NEW, "L-NEW" → LIKE_NEW, …) so a
  // marketplace-string row highlights its grade as current.
  const normalized = resolveConditionGrade(current);

  // Focus the current option (or the first) on mount; arrows rove between
  // options (APG listbox), Enter/Space select, Esc closes without saving.
  useEffect(() => {
    const t = setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const target =
        list.querySelector<HTMLButtonElement>('[data-current="true"]') ??
        list.querySelector<HTMLButtonElement>('[role="option"]');
      target?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
    items[next]?.focus();
  };

  const pick = (value: string | null) => {
    onSelect(value);
    onDone();
  };

  return (
    <Popover
      open
      onClose={onDone}
      anchorRef={anchorRef}
      placement="bottom-start"
      role="listbox"
      aria-label="Condition"
      padded={false}
      className="w-44 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={listRef} onKeyDown={onKeyDown}>
        {options.map((opt) => {
          const isCurrent = normalized === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={isCurrent}
              data-current={isCurrent ? 'true' : undefined}
              title={conditionDescription(opt.value)}
              onClick={(e) => {
                e.stopPropagation();
                pick(opt.value);
              }}
              className={cn(
                'ds-raw-button flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-role-caption font-bold uppercase tracking-wide outline-none hover:bg-surface-hover focus-visible:bg-surface-hover',
                conditionGradeTextClass(opt.value),
                // Current grade reads in its own hue — soft toned wash + check.
                isCurrent && conditionGradeTone(opt.value).badge,
              )}
            >
              <span className="min-w-0 truncate">{opt.label}</span>
              {isCurrent ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          );
        })}
        <button
          type="button"
          role="option"
          aria-selected={!normalized}
          onClick={(e) => {
            e.stopPropagation();
            pick(null);
          }}
          className="ds-raw-button flex w-full items-center gap-2 border-t border-border-hairline px-2.5 py-1.5 text-left text-role-caption font-semibold text-text-muted outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
        >
          Clear condition
        </button>
      </div>
    </Popover>
  );
}

// ─── Row info menu — single-selected row quick editors ──────────────────────

interface RowInfoMenuPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  canEditNotes: boolean;
  canEditOos: boolean;
  onNotes: () => void;
  onOutOfStock: () => void;
  onDetails: () => void;
  onDone: () => void;
}

/**
 * Info-edit dropdown for the single checked grid row — fixed item order
 * (Notes · Out of stock · Details). The first two hand off to the row's
 * cell-anchored editors; Details opens the record. Un-permissioned edit rows
 * are omitted, never rendered disabled.
 */
export function RowInfoMenuPopover({
  anchorRef,
  canEditNotes,
  canEditOos,
  onNotes,
  onOutOfStock,
  onDetails,
  onDone,
}: RowInfoMenuPopoverProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = [
    canEditNotes
      ? { key: 'notes', label: 'Notes', icon: <FileText className="h-3.5 w-3.5 shrink-0 text-text-soft" />, run: onNotes }
      : null,
    canEditOos
      ? { key: 'oos', label: 'Out of stock', icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />, run: onOutOfStock }
      : null,
    { key: 'details', label: 'Details', icon: <Maximize2 className="h-3.5 w-3.5 shrink-0 text-text-soft" />, run: onDetails },
  ].filter((it): it is NonNullable<typeof it> => it !== null);

  // Focus the first item on mount; arrows rove (same contract as the
  // condition listbox), Esc / outside click close via the Popover.
  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const idx = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1);
    rows[next]?.focus();
  };

  return (
    <Popover
      open
      onClose={onDone}
      anchorRef={anchorRef}
      placement="bottom-end"
      role="menu"
      aria-label="Edit info"
      padded={false}
      className="w-40 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={listRef} onKeyDown={onKeyDown}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onDone();
              it.run();
            }}
            className="ds-raw-button flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-role-caption font-semibold text-text-muted outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
          >
            {it.icon}
            <span className="min-w-0 truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

// ─── Ship-by — civil-day calendar (warehouse zone SoT) ──────────────────────

interface ShipByDatePopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  /** Current ship-by civil key (`YYYY-MM-DD`) or null. */
  currentKey: string | null;
  /** Commit a new civil key. */
  onSelect: (dateKey: string) => void;
  onDone: () => void;
}

export function ShipByDatePopover({
  anchorRef,
  currentKey,
  onSelect,
  onDone,
}: ShipByDatePopoverProps) {
  // Calendar widgets round-trip via dateKeyToLocalDate / localDateToDateKey —
  // the civil-date law (never `new Date(dateKey)` local-midnight reparses).
  const selected = currentKey ? dateKeyToLocalDate(currentKey) : undefined;
  return (
    <Popover
      open
      onClose={onDone}
      anchorRef={anchorRef}
      placement="bottom-start"
      role="dialog"
      aria-label="Ship by date"
      padded={false}
      onClick={(e) => e.stopPropagation()}
    >
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        onSelect={(day) => {
          const key = localDateToDateKey(day ?? null);
          if (key) onSelect(key);
          onDone();
        }}
      />
    </Popover>
  );
}
