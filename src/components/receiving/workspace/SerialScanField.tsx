'use client';

/**
 * Shared serial input leaf — one SoT for scan / edit / no-serial / lookup.
 * Composed by {@link SerialCard} (legacy lanes) and {@link PoLineCaptureRow}
 * (Unbox in-row open panel). Never fork a second serial-field implementation.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { X } from '@/components/Icons';
import { TextField, IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { getLast8Serial } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';
import { STATION_SCAN_FIELD_WELL_CLASS } from '@/components/station/scan-depth';
import { PO_LINE_CAPTURE_ACTIONS_CLASS } from './po-line-capture-chrome';
import { NoSerialOfferCheck } from './line-edit/NoSerialOfferCheck';
import { focusUnboxCaptureSerialRelative } from './line-edit/focus-unbox-capture-serial';

export interface SavedSerial {
  id?: number;
  serial_number: string;
  condition_grade?: string | null;
  _optimistic?: 'adding' | 'removing';
}

export type SerialScanFieldHandle = {
  focus: (opts?: { select?: boolean }) => void;
  beginEdit: (serial: SavedSerial) => void;
  cancelEdit: () => void;
};

type SerialScanFieldProps = {
  saved: ReadonlyArray<SavedSerial>;
  onAdd: (sn: string) => void | Promise<void>;
  disabled?: boolean;
  onReplaceSerial?: (original: SavedSerial, nextSerial: string) => void;
  onMarkNoSerial?: () => void;
  lookupBusy?: boolean;
  noSerialActive?: boolean;
  noSerialSlot?: ReactNode;
  autoFocusInput?: boolean;
  focusKey?: string | number | null;
  externalInputRef?: RefObject<HTMLInputElement | null>;
  /** Flush joined bar (Unbox / embedded SerialCard) vs soft standalone. */
  appearance?: 'flush' | 'default';
  editingSerial?: SavedSerial | null;
  onEditingSerialChange?: (serial: SavedSerial | null) => void;
  /** When set, parent owns the dupe notice (SerialCard renders under the bar). */
  onInlineNoticeChange?: (notice: string | null) => void;
  /**
   * The HOST's own trailing controls, joined into this field's action column
   * (Unbox capture: Photos, after the exact / no-serial check).
   *
   * A slot rather than a second row child, because the whole point of the
   * composer's anatomy is that verification actions are ONE right-hand cluster:
   * text left, actions right. Rendered by a host as a sibling instead, the
   * commit cell and the host's own action are two independent flex children the
   * row is free to separate — which is how a camera ends up mid-bar the moment
   * the waiver cell disappears.
   */
  actionsSlot?: ReactNode;
  /**
   * Width of each trailing action cell. `w-14` (default) beside a standalone
   * single-qty input; `w-11` in the flush Unbox composer, where the cluster has
   * to be square with the Photos segment beside it.
   */
  actionWidth?: 'w-11' | 'w-14';
};

export const SerialScanField = forwardRef<
  SerialScanFieldHandle,
  SerialScanFieldProps
>(function SerialScanField(
  {
    saved,
    onAdd,
    disabled = false,
    onReplaceSerial,
    onMarkNoSerial,
    lookupBusy = false,
    noSerialActive = false,
    noSerialSlot,
    autoFocusInput = true,
    focusKey = null,
    externalInputRef,
    appearance = 'flush',
    editingSerial = null,
    onEditingSerialChange,
    onInlineNoticeChange,
    actionsSlot,
    actionWidth = 'w-14',
  },
  ref,
) {
  const embedded = appearance === 'flush';
  const [scan, setScan] = useState('');
  const [editing, setEditing] = useState<SavedSerial | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (externalInputRef)
        (externalInputRef as MutableRefObject<HTMLInputElement | null>).current =
          el;
    },
    [externalInputRef],
  );

  const setNotice = useCallback(
    (next: string | null) => {
      setInlineNotice(next);
      onInlineNoticeChange?.(next);
    },
    [onInlineNoticeChange],
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    onEditingSerialChange?.(null);
    setScan('');
    setNotice(null);
  }, [onEditingSerialChange, setNotice]);

  const beginEdit = useCallback(
    (s: SavedSerial) => {
      setEditing(s);
      onEditingSerialChange?.(s);
      setScan(s.serial_number);
      setNotice(null);
      window.setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.select();
      }, 0);
    },
    [onEditingSerialChange, setNotice],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: (opts) => {
        const el = inputRef.current;
        if (!el || el.disabled) return;
        el.focus({ preventScroll: true });
        if (opts?.select) el.select();
      },
      beginEdit,
      cancelEdit,
    }),
    [beginEdit, cancelEdit],
  );

  useEffect(() => {
    if (editing && !saved.some((s) => s.id === editing.id)) {
      setEditing(null);
      setScan('');
      onEditingSerialChange?.(null);
    }
  }, [saved, editing, onEditingSerialChange]);

  useEffect(() => {
    if (!editingSerial) {
      setEditing(null);
      return;
    }
    setEditing(editingSerial);
    setScan(editingSerial.serial_number);
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
        el.focus({ preventScroll: true });
      el.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingSerial]);

  useEffect(() => {
    if (!autoFocusInput || disabled || editing || editingSerial) return;
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoFocusInput, disabled, editing, editingSerial, focusKey]);

  const submit = () => {
    const trimmed = scan.trim();
    if (!trimmed || disabled) return;

    if (editing) {
      if (trimmed !== editing.serial_number && onReplaceSerial) {
        onReplaceSerial(editing, trimmed);
      }
      setEditing(null);
      onEditingSerialChange?.(null);
      setScan('');
      return;
    }

    const parts = trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const savedKeys = new Set(
      saved
        .map((s) => (s.serial_number || '').trim().toUpperCase())
        .filter(Boolean),
    );
    const fresh: string[] = [];
    const dupes: string[] = [];
    for (const sn of parts) {
      const key = sn.toUpperCase();
      if (savedKeys.has(key)) {
        dupes.push(sn);
      } else {
        savedKeys.add(key);
        fresh.push(sn);
      }
    }
    setNotice(
      dupes.length === 0
        ? null
        : dupes.length === 1
          ? `Already on this line — ends ${getLast8Serial(dupes[0])}. Not added again.`
          : `${dupes.length} serials already on this line — skipped.`,
    );
    setScan('');
    if (fresh.length === 0) return;
    for (const sn of fresh) {
      void onAdd(sn);
    }
    inputRef.current?.focus({ preventScroll: true });
  };

  const showOwnNotice = !onInlineNoticeChange && inlineNotice;

  /**
   * The commit / waiver / lookup cell — ONE slot that swaps face with state
   * (waiting → green check offer · typing → commit + · looking up → spinner),
   * never three cells that appear and disappear beside each other.
   */
  const actionCell = noSerialActive ? null : lookupBusy && !scan.trim() && !editing ? (
    <div
      role="status"
      aria-label="Checking serial"
      className={cn(
        'inline-flex h-11 shrink-0 items-center justify-center text-emerald-600',
        actionWidth,
        embedded
          ? cn(cornerClass('flush'), 'bg-emerald-50')
          : cn(
              cornerClass('field'),
              'border border-emerald-300 bg-emerald-50 shadow-sm',
            ),
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="h-5 w-5 animate-spin"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" className="opacity-25" />
        <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
      </svg>
    </div>
  ) : !scan.trim() && !editing && onMarkNoSerial ? (
    <NoSerialOfferCheck
      onClick={onMarkNoSerial}
      label="Mark this item as having no serial number"
      width={actionWidth}
      appearance={embedded ? 'flush' : 'default'}
    />
  ) : (
    <button
      type="button"
      onClick={submit}
      disabled={!scan.trim() || disabled}
      className={cn(
        'ds-raw-button inline-flex h-11 shrink-0 items-center justify-center text-role-caption font-semibold uppercase tracking-wider text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-surface-strong',
        embedded
          ? cn(cornerClass('flush'), 'bg-emerald-600')
          : 'rounded-xl bg-emerald-600 shadow-sm',
        editing ? 'px-4' : actionWidth,
      )}
    >
      {editing ? (
        'Save'
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="h-5 w-5"
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );

  return (
    <>
      <div className="flex min-w-0 flex-1 items-stretch" data-serial-field>
        {noSerialActive && noSerialSlot ? (
          noSerialSlot
        ) : (
          <TextField
            ref={setInputRef}
            label="Serial"
            data-unbox-serial-input
            // The open field IS the serial segment: while it is mounted there
            // is no icon segment to carry the Unbox moving outline, so the dock
            // asking for `serial` would light nothing at all.
            data-capture-segment="serial"
            appearance={embedded ? 'flush' : 'default'}
            inputClassName={embedded ? STATION_SCAN_FIELD_WELL_CLASS : undefined}
            value={scan}
            onChange={(next) => {
              setScan(next);
              if (inlineNotice) setNotice(null);
            }}
            mono
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            autoFocus={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape' && editing) {
                e.preventDefault();
                cancelEdit();
              } else if (
                (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
                !e.metaKey &&
                !e.ctrlKey &&
                !e.altKey
              ) {
                // Ambient record cursor refuses-in-input; own ↑/↓ here so the
                // operator can step PO-line serials while the wedge is armed.
                e.preventDefault();
                focusUnboxCaptureSerialRelative(
                  e.key === 'ArrowUp' ? -1 : 1,
                );
              }
            }}
            trailing={
              scan || editing ? (
                <IconButton
                  onClick={() => (editing ? cancelEdit() : setScan(''))}
                  ariaLabel={editing ? 'Cancel edit' : 'Clear input'}
                  className="rounded-md p-1 hover:bg-surface-sunken"
                  icon={<X className="h-3.5 w-3.5" />}
                />
              ) : undefined
            }
          />
        )}
      </div>

      {/* Trailing actions — ALWAYS after the field in document order, always a
          group. A waived line drops the commit cell but keeps the host's own
          actions here, so the cluster stays pinned to the bar's right edge
          instead of the camera sliding into the middle. */}
      {actionCell || actionsSlot ? (
        <div
          data-serial-actions
          className={
            embedded
              ? PO_LINE_CAPTURE_ACTIONS_CLASS
              : 'flex shrink-0 items-center gap-2'
          }
        >
          {actionCell}
          {actionsSlot}
        </div>
      ) : null}

      {showOwnNotice ? (
        <p
          role="status"
          className="basis-full mt-2 w-full text-role-caption font-semibold text-rose-600"
        >
          {inlineNotice}
        </p>
      ) : null}
    </>
  );
});
