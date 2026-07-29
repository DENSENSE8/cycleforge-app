'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil } from '@/components/Icons';
import { SerialChip } from '@/components/ui/CopyChip';
import { TextField, IconButton } from '@/design-system/primitives';
import { classifyInput } from '@/lib/scan-resolver';
import { getLast4Serial } from '@/lib/copy-chip-format';
import { ConditionPills } from './ConditionPills';
import { ConditionBadge } from './ReceivingUnitRows';
import { NoSerialOfferCheck } from './line-edit/NoSerialOfferCheck';

interface SavedSerial {
  id?: number;
  serial_number: string;
  condition_grade?: string | null;
  _optimistic?: 'adding' | 'removing';
}

interface Props {
  /** Already-saved serials for this line (from `row.serials`). */
  saved: ReadonlyArray<SavedSerial>;
  /** Expected total (row.quantity_expected). null/0 → no target. */
  expected: number | null;
  /**
   * Submit a new serial — calls into LineEditPanel's existing submitSerial
   * flow. Returning a Promise lets the paste-loop below `await` each
   * submission so the server-side FOR UPDATE lock actually serializes work.
   */
  onAdd: (sn: string) => void | Promise<void>;
  /** Is a serial submission currently in flight? */
  isSubmitting: boolean;
  /** Disable input when package/line isn't ready (no receiving_id, etc.). */
  disabled?: boolean;
  /** Remove a saved serial. Dropdown action on chips. */
  onDeleteSerial?: (serial: SavedSerial) => void;
  /**
   * Replace a saved serial with a new value. Called when the operator submits
   * the input while editing an existing chip — the parent should delete the
   * original and add the new one.
   */
  onReplaceSerial?: (original: SavedSerial, nextSerial: string) => void;
  /** Optional condition picker integrated into the scan row. */
  condition?: string | null | undefined;
  onConditionChange?: (grade: string) => void;
  /**
   * When false, the collapsed condition picker shows only its edit pencil (no
   * selected-grade pill) — for surfaces where the grade is already displayed
   * elsewhere (the PO-line meta row chip), so the pill isn't a redundant second
   * label. Defaults to true (labeled pill) for the standalone unmatched flows.
   */
  collapsedConditionLabel?: boolean;
  /**
   * When the serial input is empty, show a green check in place of the disabled
   * "+" so the operator can mark the item as having no serial number. Omitted →
   * the trailing control is the normal add-"+" button only.
   */
  onMarkNoSerial?: () => void;
  /** Render the no-serial check as active (solid green) while the waiver is set. */
  noSerialActive?: boolean;
  /**
   * Rendered IN the serial-input position (replacing the field) while the
   * no-serial waiver is active — a contextual form swap on the same row, not a
   * second row underneath.
   */
  noSerialSlot?: ReactNode;
  /** PO-line notes — co-located here so operators see them while scanning. */
  notes?: string;
  /** Notes change handler (controlled). */
  onNotesChange?: (next: string) => void;
  /** Persist notes when focus leaves (e.g. clicking outside the field). */
  onNotesBlur?: () => void;
  /** DOM id for the notes textarea (used by label). */
  notesId?: string;
  /** When false, chips stay in the PO header only (no duplicate list below input). */
  showSavedChips?: boolean;
  /**
   * Slot rendered directly under the SERIAL input row (above any saved chips).
   * Used by the RETURN flow to show the serial-match result inline with the
   * scan field.
   */
  resultSlot?: ReactNode;
  /** When false, serial input does not steal focus on mount (step-aware unbox). */
  autoFocusInput?: boolean;
  /**
   * Re-run autofocus when this changes (e.g. active PO line id). Needed because
   * the unbox workspace stays mounted across sibling-line switches.
   */
  focusKey?: string | number | null;
  /** Shared ref for programmatic focus (units dock → overview scan handoff). */
  externalInputRef?: RefObject<HTMLInputElement | null>;
  /** Nested inside {@link PoLinesAccordion} — skip duplicate card chrome. */
  embedded?: boolean;
  /** Controlled edit target from the PO item header chip. */
  editingSerial?: SavedSerial | null;
  onEditingSerialChange?: (serial: SavedSerial | null) => void;
}

/**
 * Top-of-workspace scan card. Hosts the everyday "scan a serial → ⏎" path
 * with the existing-serial chips rendered BELOW the input as `SerialChip`
 * copy-chips (last-4 display, emerald underline). Each chip exposes an
 * Edit / Delete dropdown on hover.
 *
 * Edit flow: clicking Edit populates the scan input with the chip's current
 * value and tracks it via local state. Submitting the input replaces the
 * original serial via `onReplaceSerial`. The X-clear button cancels the edit.
 */
export function SerialCard({
  saved,
  onAdd,
  isSubmitting,
  disabled = false,
  onDeleteSerial,
  onReplaceSerial,
  condition,
  onConditionChange,
  collapsedConditionLabel = true,
  onMarkNoSerial,
  noSerialActive = false,
  noSerialSlot,
  notes,
  onNotesChange,
  onNotesBlur,
  notesId,
  showSavedChips = true,
  autoFocusInput = true,
  focusKey = null,
  externalInputRef,
  embedded = false,
  editingSerial = null,
  onEditingSerialChange,
  resultSlot,
}: Props) {
  const showNotes = typeof notes === 'string' && typeof onNotesChange === 'function';
  const [scan, setScan] = useState('');
  const [editing, setEditing] = useState<SavedSerial | null>(null);
  /**
   * Inline scan-guard feedback under the field — a big-enough state for a
   * bench operator (never a corner toast). rose = blocked (duplicate),
   * amber = warned (tracking-shaped value, overridable by re-submitting).
   */
  const [inlineNotice, setInlineNotice] = useState<{ tone: 'rose' | 'amber'; text: string } | null>(
    null,
  );
  /** Tracking-shaped value the operator was warned about — resubmitting the
   *  same value overrides the guard (some units genuinely carry
   *  tracking-shaped serials). Any input change re-arms the guard. */
  const [trackingOverride, setTrackingOverride] = useState<string | null>(null);
  // Condition picker expand/collapse — expand only when no grade is chosen yet
  // (operator needs the full row). When a grade is already set (e.g. unfound
  // return scan defaults USED_A, or a remount after optimistic create), start
  // collapsed so the serial field + green-check aren't squeezed beside a full
  // pill strip, and the row doesn't read as empty tall chrome under the pills.
  const [condExpanded, setCondExpanded] = useState(
    !String(condition || '').trim(),
  );
  /** Avoid flashing “Saving…” on fast round-trips; only shown if submit hangs ~400ms+ */
  const [showSavingLabel, setShowSavingLabel] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (externalInputRef)
        (externalInputRef as MutableRefObject<HTMLInputElement | null>).current = el;
    },
    [externalInputRef],
  );
  const count = saved.length;

  /**
   * Pick a condition grade, then jump focus straight to the serial input so
   * the operator can scan without a second click. Deferred a tick so focus
   * lands after the grade-change re-render (input is enabled by then).
   */
  const handleConditionPick = (grade: string) => {
    onConditionChange?.(grade);
    setTimeout(() => {
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus();
    }, 0);
  };

  // If the underlying saved list changes while editing (e.g. the original
  // chip got deleted from elsewhere), clear the edit state so we don't try
  // to replace something that's gone.
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
    // Collapse the condition picker so the focus is on editing the serial text.
    setCondExpanded(false);
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingSerial]);

  useEffect(() => {
    if (!isSubmitting) {
      setShowSavingLabel(false);
      return;
    }
    const t = window.setTimeout(() => setShowSavingLabel(true), 420);
    return () => window.clearTimeout(t);
  }, [isSubmitting]);

  useEffect(() => {
    if (!autoFocusInput || disabled || isSubmitting || editing || editingSerial) return;
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoFocusInput, disabled, isSubmitting, editing, editingSerial, focusKey]);

  const beginEdit = (s: SavedSerial) => {
    setEditing(s);
    onEditingSerialChange?.(s);
    setScan(s.serial_number);
    setInlineNotice(null);
    setTrackingOverride(null);
    // Collapse the condition picker so the focus is on editing the serial text.
    setCondExpanded(false);
    // Defer focus until the input is enabled in the new render pass.
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.select();
    }, 0);
  };

  const cancelEdit = () => {
    setEditing(null);
    onEditingSerialChange?.(null);
    setScan('');
    setInlineNotice(null);
    setTrackingOverride(null);
  };

  const submit = async () => {
    const trimmed = scan.trim();
    if (!trimmed || isSubmitting || disabled) return;

    if (editing) {
      // Replace mode — operator is finalizing an edit. Skip the comma-split
      // path since "editing one serial" is a single-value action.
      if (trimmed !== editing.serial_number && onReplaceSerial) {
        onReplaceSerial(editing, trimmed);
      }
      setEditing(null);
      onEditingSerialChange?.(null);
      setScan('');
      return;
    }

    // Allow comma-paste → submit each one in turn. AWAIT each onAdd so we
    // don't fan out concurrent requests — the receive-line writer uses a
    // SELECT FOR UPDATE lock that requires sequential calls, and parallel
    // submissions used to cause over-receive races (e.g. 2/1).
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);

    // Wrong-barcode guard: a carrier-tracking-shaped scan is almost always the
    // shipping label, not the unit serial. Warn on the first Enter and keep the
    // value in the field; submitting the SAME value again overrides.
    if (
      parts.length === 1 &&
      trackingOverride !== parts[0] &&
      classifyInput(parts[0]).type === 'tracking'
    ) {
      setTrackingOverride(parts[0]);
      setInlineNotice({
        tone: 'amber',
        text: 'Looks like a carrier tracking number — scan the unit serial, or press Enter again to add it anyway.',
      });
      return;
    }

    // Duplicate guard: skip values already saved on this line so a double-scan
    // (or re-scan of a chip below) can't queue a second server write.
    const savedKeys = new Set(
      saved.map((s) => (s.serial_number || '').trim().toUpperCase()).filter(Boolean),
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
    setInlineNotice(
      dupes.length === 0
        ? null
        : {
            tone: 'rose',
            text:
              dupes.length === 1
                ? `Already on this line — ends ${getLast4Serial(dupes[0])}. Not added again.`
                : `${dupes.length} serials already on this line — skipped.`,
          },
    );
    setTrackingOverride(null);
    setScan('');
    if (fresh.length === 0) return;
    for (const sn of fresh) {
      try {
        await onAdd(sn);
      } catch {
        /* Parent handles toasts on its own; keep the loop going. */
      }
    }
    // Barcode wedge: keep the scan field focused after each Enter so multi-part
    // PARTS lines can accept serial after serial without re-clicking.
    window.setTimeout(() => {
      const el = inputRef.current;
      if (!el || el.disabled || editing || noSerialActive) return;
      el.focus({ preventScroll: true });
    }, 0);
  };

  const Shell = embedded ? 'div' : 'section';
  const shellClass = embedded
    ? 'w-full group'
    : 'rounded-2xl bg-surface-card p-4 shadow-sm ring-1 ring-border-soft/60 group';

  return (
    <Shell className={shellClass}>
      <div className="flex items-center gap-2">
        {onConditionChange ? (
          // Condition picker: full pill row when the line opens (for selection),
          // collapsing to a filled circle (grade hue) + white Tags.
          // Picking a grade auto-focuses the serial input below.
          <div className="flex min-w-0 items-center gap-2">
            <ConditionPills
              value={condition}
              onChange={handleConditionPick}
              collapsible
              collapsedLabel={collapsedConditionLabel}
              expanded={condExpanded}
              onExpandedChange={setCondExpanded}
            />
            <div className="h-8 w-px shrink-0 bg-surface-sunken" />
          </div>
        ) : condition ? (
          <div className="shrink-0">
            <ConditionBadge grade={condition} />
          </div>
        ) : null}

        <div className="flex-1 min-w-0">
          {noSerialActive && noSerialSlot ? (
            noSerialSlot
          ) : (
          <TextField
            ref={setInputRef}
            label="Serial"
            data-unbox-serial-input
            value={scan}
            onChange={(next) => {
              setScan(next);
              // Any keystroke re-arms the scan guards and clears stale feedback.
              if (inlineNotice) setInlineNotice(null);
              if (trackingOverride) setTrackingOverride(null);
            }}
            tone="blue"
            mono
            disabled={disabled || isSubmitting}
            autoComplete="off"
            spellCheck={false}
            // Programmatic focus uses preventScroll — avoid native autoFocus scroll jumps.
            autoFocus={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape' && editing) {
                e.preventDefault();
                cancelEdit();
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

        {/* Trailing action. While the waiver is ACTIVE the full-width no-serial bar
            (rendered in the field slot above) owns the whole row — it reads as a
            "No serial · {reason}" dropdown and carries UNDO inside its reason
            menu, so there is NO trailing control (no dark-green confirm check).
            When the field is empty, a QUIET green-check no-serial OFFER. Otherwise
            the "+" add / Save submit. */}
        {noSerialActive ? null : !scan.trim() && !editing && onMarkNoSerial ? (
          // Shared with the multi-qty unit list's all-units slot — one green
          // check, so the affordance is identical whether the line is a 1-of or
          // a 3-of. (Was bespoke markup here; the copy is what let the multi-qty
          // side drift into a dashed grey token.)
          <NoSerialOfferCheck
            onClick={onMarkNoSerial}
            label="Mark this item as having no serial number"
            width="w-14"
          />
        ) : (
          /* ds-raw-button: solid-emerald scan-submit CTA with add-glyph / Saving… text-swap */
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!scan.trim() || isSubmitting || disabled}
            className={`inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-role-caption font-semibold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-surface-strong ${
              editing || (showSavingLabel && isSubmitting) ? 'px-4' : 'w-14'
            }`}
          >
            {showSavingLabel && isSubmitting ? (
              'Saving…'
            ) : editing ? (
              'Save'
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-5 w-5">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Scan-guard feedback — inline under the field where the operator is
          already looking (house rule: card state, not a corner toast). */}
      {inlineNotice ? (
        <p
          role="status"
          className={`mt-2 text-role-caption font-semibold ${
            inlineNotice.tone === 'rose' ? 'text-rose-600' : 'text-amber-700'
          }`}
        >
          {inlineNotice.text}
        </p>
      ) : null}

      {/* Inline slot under the scan field — RETURN serial-match (found /
          not-found). `empty:hidden` drops the mt-3 when the slot renders null
          (idle SerialMatchResult), so RETURN rows keep the same tight bottom
          padding as a normal PO-line SoT accordion body. */}
      {resultSlot ? (
        <div className="mt-3 empty:hidden">{resultSlot}</div>
      ) : null}

      {/* Saved serials — rendered BELOW the input as emerald copy-chips.
          Each chip exposes Edit / Delete in a hover menu below the chip;
          click the chip body to copy (SerialChip). */}
      {showSavedChips && count > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {saved.map((s, idx) => {
            const sn = (s.serial_number || '').trim();
            if (!sn) return null;
            return (
              <SerialChipWithMenu
                key={s.id ?? `${sn}-${idx}`}
                serial={s}
                onEdit={onReplaceSerial ? beginEdit : undefined}
                onDelete={onDeleteSerial}
              />
            );
          })}
        </div>
      ) : null}

      {/* Notes — co-located with the serial input so the operator never has
          to expand a separate section to leave context for the next person.
          Same card chrome, same width; a hairline divider signals it's a
          distinct field, not part of the scan flow. */}
      {showNotes ? (
        <div className="mt-3 border-t border-border-hairline pt-3">
          <label
            htmlFor={notesId}
            className="block text-role-micro uppercase tracking-[0.14em] text-text-soft"
          >
            Notes
          </label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => onNotesChange?.(e.target.value)}
            onBlur={onNotesBlur}
            rows={2}
            placeholder="PO-line notes (saved on off click)"
            className="mt-1 w-full resize-none rounded-xl border border-border-soft bg-surface-card inset-field text-role-caption font-medium leading-snug text-text-default placeholder:text-text-faint focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      ) : null}
    </Shell>
  );
}

/**
 * {@link SerialChip} wrapped with a hover menu (Edit / Delete) positioned below
 * the chip. Click the chip to copy; hover to reveal actions.
 *
 * Wired from {@link PoLinesAccordion} when `LineEditPanel` passes
 * `activeSerialActions`, and reused by SerialCard / InlineSerialAdder chip lists.
 */
export function SerialChipWithMenu({
  serial,
  onEdit,
  onDelete,
  onSetCondition,
  dense,
}: {
  serial: SavedSerial;
  /**
   * @deprecated No longer paints an in-edit selection ring — kept optional for
   * call-site compat. Edit state is ownership of the scan input, not the chip.
   */
  isEditing?: boolean;
  onEdit?: (s: SavedSerial) => void;
  onDelete?: (s: SavedSerial) => void;
  /** When provided, the hover menu includes a condition picker for this serial. */
  onSetCondition?: (s: SavedSerial, grade: string) => void;
  /** Compact meta-row rendering — forwarded to the inner {@link SerialChip}. */
  dense?: boolean;
}) {
  const sn = serial.serial_number;
  const pending = serial._optimistic;
  const hasActions = !pending && !!(onEdit || onDelete || onSetCondition);

  // The menu renders in a BODY PORTAL (not an `absolute` child) so it is never
  // clipped by an `overflow:hidden` ancestor — the PO-line meta grid's `truncate`
  // serial cell and the accordion row's `overflow-hidden` were swallowing the old
  // in-flow dropdown, which is why Edit/Delete "didn't work". Same rationale as
  // HoverTooltip's portal. Positioned from the chip's rect and viewport-clamped.
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const open = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r && r.width >= 2 && r.height >= 2) {
      setAnchor(r);
      setPos(null);
    }
  }, []);
  const closeNow = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setAnchor(null);
    setPos(null);
  }, []);
  // Delay close so the pointer can travel from the chip to the detached menu
  // without the hover gap dismissing it.
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setAnchor(null);
      setPos(null);
    }, 140);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Measure the menu once mounted, then clamp into the viewport (prefer below the
  // chip, flip above when there isn't room). Hidden until positioned so it never
  // flashes at the off-screen origin.
  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const b = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 6;
    const roomBelow = vh - anchor.bottom - MARGIN;
    const rawTop =
      roomBelow >= b.height ? anchor.bottom + 4 : anchor.top - b.height - 4;
    const top = Math.min(
      Math.max(rawTop, MARGIN),
      Math.max(MARGIN, vh - b.height - MARGIN),
    );
    const rawLeft = anchor.left + anchor.width / 2 - b.width / 2;
    const left = Math.min(
      Math.max(rawLeft, MARGIN),
      Math.max(MARGIN, vw - b.width - MARGIN),
    );
    setPos({ top, left });
  }, [anchor]);

  // Dismiss on scroll — a fixed portal would otherwise "leak" over the page as
  // the workspace scrolls under it.
  useEffect(() => {
    if (!anchor) return;
    const onScroll = () => closeNow();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [anchor, closeNow]);

  const menu =
    anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Serial actions"
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
            // eslint-disable-next-line no-restricted-syntax
            className={`fixed z-panelPopover overflow-hidden rounded-lg border border-border-soft bg-surface-card shadow-lg ${onSetCondition ? 'min-w-[200px]' : 'min-w-[112px]'}`}
          >
            {onSetCondition ? (
              <div className="border-b border-border-hairline px-2 py-1.5">
                <p className="mb-1 text-role-micro uppercase tracking-widest text-text-faint">
                  Condition
                </p>
                <ConditionPills
                  value={serial.condition_grade}
                  onChange={(next) => onSetCondition(serial, next)}
                />
              </div>
            ) : null}
            {onEdit ? (
              // ds-raw-button: role=menuitem text-left dropdown action row, not a standalone DS Button
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onEdit(serial);
                  closeNow();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption font-semibold uppercase tracking-widest text-text-muted hover:bg-surface-hover"
              >
                <Pencil className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                Edit
              </button>
            ) : null}
            {onDelete ? (
              // ds-raw-button: role=menuitem text-left dropdown action row, not a standalone DS Button
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDelete(serial);
                  closeNow();
                }}
                className="flex w-full items-center gap-2 border-t border-border-hairline px-3 py-1.5 text-left text-role-caption font-semibold uppercase tracking-widest text-rose-600 hover:bg-rose-50"
              >
                <X className="h-3.5 w-3.5 shrink-0" />
                Delete
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={triggerRef}
      className={`group relative inline-flex rounded-md transition-opacity ${
        pending === 'removing'
          ? 'bg-surface-sunken opacity-50 ring-1 ring-inset ring-border-soft'
          : pending === 'adding'
            ? 'opacity-70'
            : ''
      }`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        if (hasActions) open();
      }}
      onMouseLeave={() => {
        if (hasActions) scheduleClose();
      }}
    >
      <div className="inline-flex items-center gap-1 rounded-md">
        <SerialChip value={sn} width="w-fit max-w-full" pending={pending} dense={dense} />
      </div>
      {hasActions ? menu : null}
    </div>
  );
}
