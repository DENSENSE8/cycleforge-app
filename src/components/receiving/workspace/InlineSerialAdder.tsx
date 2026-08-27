'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, TextField } from '@/design-system/primitives';
import { SerialChipWithMenu } from '@/components/receiving/workspace/SerialCard';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { useRegisterScanSink } from '@/lib/station-scan-sink';

interface SavedSerial {
  id?: number;
  serial_number: string;
  condition_grade?: string | null;
}

interface Props {
  /**
   * Which receiving line this adder writes to. Used by the parent's `onAdd`
   * — passed through so callers can route the call to the right line when
   * multiple adders are rendered for the same carton.
   */
  lineId: number;
  /** Already-saved serials for this line. */
  saved: ReadonlyArray<SavedSerial>;
  /** Expected total (`row.quantity_expected`). null/0 → no target. */
  expected: number | null;
  /** Soft in-flight hint for callers — never disables the scan field. */
  isSubmitting: boolean;
  /** Pass through to the parent's `submitSerial(lineId, sn)`. */
  onAdd: (lineId: number, serial: string) => void | Promise<void>;
  /** Remove a saved serial. Click target is the chip's Delete menu item / X icon. */
  onDelete?: (lineId: number, serial: SavedSerial) => void;
  /**
   * When false, saved serial chips are not rendered here — callers surface
   * them in a parent header (e.g. {@link PoLinesAccordion}).
   */
  showSavedChips?: boolean;
  /**
   * Controlled edit target from a parent header chip. Populates the scan input.
   */
  editingSerial?: SavedSerial | null;
  onEditingSerialChange?: (serial: SavedSerial | null) => void;
  /**
   * Replace a saved serial with a new value (typo fix). When provided, each
   * saved chip exposes an Edit affordance in a hover dropdown — clicking it
   * populates the input with the chip's current value and remembers the
   * original. Submitting calls `onReplaceSerial(lineId, original, next)`.
   * When omitted, chips show only the X delete button.
   */
  onReplaceSerial?: (lineId: number, original: SavedSerial, nextSerial: string) => void;
  /** Disable the whole adder (no receiving_id, line is DONE, etc.). */
  disabled?: boolean;
  /**
   * If true, autoFocus the input on mount. Lets the parent focus the
   * active row's adder when the line becomes active (e.g. after click).
   */
  autoFocus?: boolean;
  /**
   * @deprecated Kept for call-site compat. The field always stays open for
   * adding more serials (no collapsed chip + pencil edit chrome).
   */
  collapsible?: boolean;
}

/**
 * Compact, per-PO-item serial scan input. Mounted INSIDE the active row of
 * {@link PoLinesAccordion} so the operator can scan serials for the
 * specific line they're testing without context-switching to a global
 * SerialCard at the bottom of the column.
 *
 * Visual contract:
 *   ┌────────────────────────────────┐  ┌─────┐
 *   │ Scan or type a serial → ⏎     │  │ ADD │
 *   └────────────────────────────────┘  └─────┘
 *   [SN-1 ×] [SN-2 ×] [SN-3 ×]
 *
 * Comma-paste expands to N submits (sequential, since `/api/receiving/scan-serial`
 * holds a `FOR UPDATE` lock that breaks under parallel writes).
 */
export function InlineSerialAdder({
  lineId,
  saved,
  isSubmitting: _isSubmitting,
  onAdd,
  onDelete,
  onReplaceSerial,
  showSavedChips = true,
  editingSerial = null,
  onEditingSerialChange,
  disabled = false,
  autoFocus = false,
}: Props) {
  const [scan, setScan] = useState('');
  const [editing, setEditing] = useState<SavedSerial | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const count = saved.length;

  const refocusScanInput = useCallback(() => {
    const el = inputRef.current;
    if (!el || el.disabled || editing) return;
    el.focus({ preventScroll: true });
  }, [editing]);

  useEffect(() => {
    if (!autoFocus) return;
    // Defer one tick so the parent's layout settles before grabbing focus.
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [autoFocus, lineId]);

  // Clear edit state when the underlying chip is no longer in `saved`
  // (e.g. another tab deleted it, or the line just switched).
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
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingSerial]);

  const beginEdit = (s: SavedSerial) => {
    setEditing(s);
    onEditingSerialChange?.(s);
    setScan(s.serial_number);
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
  };

  const cancelEdit = () => {
    setEditing(null);
    onEditingSerialChange?.(null);
    setScan('');
  };

  const applyPayload = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || disabled) return;

      // Replace mode — operator is finalizing an in-place edit.
      if (editing && onReplaceSerial) {
        const next = unwrapScannedSerial(trimmed);
        if (next !== editing.serial_number) {
          onReplaceSerial(lineId, editing, next);
        }
        setEditing(null);
        onEditingSerialChange?.(null);
        setScan('');
        return;
      }

      // Comma-paste → enqueue each value. Parent queues writes; clear + stay
      // focused so the wedge can keep typing while optimistic chips land.
      //
      // DECODE PER PART, never over the joined string. This is a registered
      // wedge sink, so it receives the raw buffer — and a printed unit label
      // does NOT carry a bare serial: it carries a GS1 Digital Link
      // (`…/01/{gtin}/21/{serial}`), a `(01)…(21)…` element string, or `U-{serial}`.
      // Stored verbatim, the return lane (the one unit that comes back wearing
      // OUR label) writes a serial that matches nothing.
      const parts = trimmed
        .split(',')
        .map((s) => unwrapScannedSerial(s))
        .filter(Boolean);
      setScan('');
      for (const sn of parts) {
        void onAdd(lineId, sn);
      }
      refocusScanInput();
    },
    [
      disabled,
      editing,
      lineId,
      onAdd,
      onEditingSerialChange,
      onReplaceSerial,
      refocusScanInput,
    ],
  );

  const submit = () => {
    applyPayload(scan);
  };

  // Active Testing (or any under-row) line — wedge while focus is elsewhere.
  useRegisterScanSink({
    id: `po-line:${lineId}`,
    enabled: autoFocus && !disabled && lineId > 0,
    onScan: applyPayload,
    focus: () => {
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus({ preventScroll: true });
      el.select();
    },
  });

  return (
    // items-end: the +/save button bottom-aligns with the input only, so the
    // serial chips sit above the input's right edge — never above the button.
    <div className="flex min-w-0 flex-1 items-end gap-2">
      <div className="min-w-0 flex-1 space-y-2">
      {showSavedChips && count > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {saved.map((s, idx) => {
              const sn = (s.serial_number || '').trim();
              if (!sn) return null;
              return onReplaceSerial ? (
                <SerialChipWithMenu
                  key={s.id ?? `${sn}-${idx}`}
                  serial={s}
                  onEdit={beginEdit}
                  onDelete={onDelete ? (target) => onDelete(lineId, target) : undefined}
                />
              ) : (
                // Adder without an edit handler — bare emerald chip with an X
                // delete affordance, matching the original testing layout.
                // ds-allow-title: truncation reveal of the full serial on a
                // non-interactive chip span (display is shortened to last-12).
                <span
                  key={s.id ?? `${sn}-${idx}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-role-caption font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200"
                  title={sn}
                >
                  <span className="truncate max-w-[160px]">
                    {sn.length > 14 ? `…${sn.slice(-12)}` : sn}
                  </span>
                  {onDelete ? (
                    <HoverTooltip label="Remove" asChild>
                      <IconButton
                        icon={<X className="h-3 w-3" />}
                        ariaLabel={`Remove serial ${sn}`}
                        onClick={() => onDelete(lineId, s)}
                        className="rounded text-emerald-500 hover:bg-emerald-100 hover:text-rose-600"
                      />
                    </HoverTooltip>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}

        <TextField
          ref={inputRef}
          label="Serial"
          value={scan}
          onChange={setScan}
          mono
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape' && editing) {
              e.preventDefault();
              cancelEdit();
            }
          }}
          trailing={
            scan || editing ? (
              <IconButton
                icon={<X className="h-3 w-3" />}
                ariaLabel={editing ? 'Cancel edit' : 'Clear'}
                onClick={() => (editing ? cancelEdit() : setScan(''))}
                className="rounded-md p-1 hover:bg-surface-sunken"
              />
            ) : undefined
          }
        />
      </div>
      <HoverTooltip label={editing ? 'Save serial' : 'Add serial'} asChild>
        <IconButton
          icon={<Plus className="h-4 w-4" />}
          ariaLabel={editing ? 'Save serial' : 'Add serial'}
          onClick={submit}
          disabled={!scan.trim() || disabled}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-surface-strong disabled:opacity-100"
        />
      </HoverTooltip>
    </div>
  );
}
