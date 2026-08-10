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
import { X, Pencil, Barcode } from '@/components/Icons';
import { SerialChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TextField, IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { getLast8Serial } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';
import { ConditionPills } from './ConditionPills';
import { ConditionBadge } from './ReceivingUnitRows';
import { NoSerialOfferCheck } from './line-edit/NoSerialOfferCheck';

export interface SavedSerial {
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
   * flow. Fire-and-forget: the parent queues writes; this card clears the
   * field and keeps focus immediately.
   */
  onAdd: (sn: string) => void | Promise<void>;
  /**
   * @deprecated Soft in-flight hint — kept for call-site compat. Never disables
   * the input; burst scans stay live.
   */
  isSubmitting?: boolean;
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
  /**
   * Replace the trailing check cell with a loading spinner (RETURN serial
   * lookup in flight). Same footprint as {@link NoSerialOfferCheck}.
   */
  lookupBusy?: boolean;
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
  /**
   * When embedded under a flush leading shell (`ActiveLineConditionSerial`
   * `activeRowLeading`), the parent owns the horizontal hairlines
   * (`border-y border-border-hairline`) — this bar stays `border-0` so each
   * seam is painted once.
   */
  omitBottomHairline?: boolean;
  /** Controlled edit target from the PO item header chip. */
  editingSerial?: SavedSerial | null;
  onEditingSerialChange?: (serial: SavedSerial | null) => void;
  /**
   * Unbox dual-loci progressive bar: Condition (left expand) → Serial (middle)
   * → Photos (peers expand). Requires {@link renderPhotoStage}.
   */
  progressiveCapture?: boolean;
  /** Photos stage — `expanded` when serial is done and no photos yet. */
  renderPhotoStage?: (ctx: { expanded: boolean }) => ReactNode;
  /** Item photo count — drives Photos expand → collapse when &gt; 0. */
  photoCount?: number;
}

/**
 * Top-of-workspace scan card. Hosts the everyday "scan a serial → ⏎" path
 * with the existing-serial chips rendered BELOW the input as `SerialChip`
 * copy-chips (last-8 display, emerald underline). Each chip exposes an
 * Edit / Delete dropdown on hover.
 *
 * Edit flow: clicking Edit populates the scan input with the chip's current
 * value and tracks it via local state. Submitting the input replaces the
 * original serial via `onReplaceSerial`. The X-clear button cancels the edit.
 */
export function SerialCard({
  saved,
  onAdd,
  isSubmitting: _isSubmitting = false,
  disabled = false,
  onDeleteSerial,
  onReplaceSerial,
  condition,
  onConditionChange,
  collapsedConditionLabel = true,
  onMarkNoSerial,
  lookupBusy = false,
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
  omitBottomHairline = false,
  editingSerial = null,
  onEditingSerialChange,
  resultSlot,
  progressiveCapture = false,
  renderPhotoStage,
  photoCount = 0,
}: Props) {
  const showNotes = typeof notes === 'string' && typeof onNotesChange === 'function';
  const progressive = progressiveCapture && !!renderPhotoStage;
  const [scan, setScan] = useState('');
  const [editing, setEditing] = useState<SavedSerial | null>(null);
  /**
   * Inline scan-guard feedback under the field — a big-enough state for a
   * bench operator (never a corner toast). Used for duplicate serials.
   */
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  // Condition picker expand/collapse. Progressive Unbox always starts expanded
  // (Condition → Serial → Photos) even when a default grade is already set —
  // confirm (Check) collapses left. Non-progressive: expand only when empty.
  const [condExpanded, setCondExpanded] = useState(
    () =>
      Boolean(progressiveCapture) || !String(condition || '').trim(),
  );
  /** Progressive: operator re-opened the serial field after it collapsed left. */
  const [serialExpanded, setSerialExpanded] = useState(false);
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
  const hasGrade = Boolean(String(condition || '').trim());
  const serialDone = count > 0 || noSerialActive;
  const photosDone = photoCount > 0;

  // Progressive unlock: keep condition open until graded; after serial settles
  // advance into Photos; photos collapse once a shot lands.
  useEffect(() => {
    if (!progressive) return;
    if (!hasGrade) {
      setCondExpanded(true);
      setSerialExpanded(false);
      return;
    }
    if (!serialDone) {
      setSerialExpanded(true);
      return;
    }
    setSerialExpanded(false);
  }, [progressive, hasGrade, serialDone]);

  type ProgressiveStage = 'condition' | 'serial' | 'photos' | 'done';
  const progressiveStage: ProgressiveStage | null = !progressive
    ? null
    : condExpanded || !hasGrade
      ? 'condition'
      : !serialDone || serialExpanded || editing
        ? 'serial'
        : !photosDone
          ? 'photos'
          : 'done';

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

  const handleConditionExpandedChange = (next: boolean) => {
    setCondExpanded(next);
    if (progressive && !next && hasGrade) {
      setSerialExpanded(true);
      setTimeout(() => {
        const el = inputRef.current;
        if (!el || el.disabled) return;
        el.focus({ preventScroll: true });
      }, 0);
    }
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
    if (!autoFocusInput || disabled || editing || editingSerial) return;
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el || el.disabled) return;
      el.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoFocusInput, disabled, editing, editingSerial, focusKey]);

  const beginEdit = (s: SavedSerial) => {
    setEditing(s);
    onEditingSerialChange?.(s);
    setScan(s.serial_number);
    setInlineNotice(null);
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
  };

  const submit = () => {
    const trimmed = scan.trim();
    if (!trimmed || disabled) return;

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

    // Comma-paste → enqueue each value. Parent queues writes (FOR UPDATE lock);
    // never await the network here — clear + stay focused so the wedge can
    // keep typing the next serial while the optimistic chip lands.
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);

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
        : dupes.length === 1
          ? `Already on this line — ends ${getLast8Serial(dupes[0])}. Not added again.`
          : `${dupes.length} serials already on this line — skipped.`,
    );
    setScan('');
    if (fresh.length === 0) return;
    for (const sn of fresh) {
      void onAdd(sn);
    }
    // Field stays enabled during in-flight writes — keep the caret here.
    inputRef.current?.focus({ preventScroll: true });
  };

  const Shell = embedded ? 'div' : 'section';
  const shellClass = embedded
    ? 'w-full min-w-0 group'
    : 'rounded-2xl bg-surface-card p-4 shadow-sm ring-1 ring-border-soft/60 group';

  // Embedded (Unbox PO accordion): one joined flush bar — condition · SERIAL ·
  // trailing, gap-0, square cells. Soft divide-x cell seams + top/bottom
  // hairlines separating the bar from the PO meta above and Show label below
  // (unless a flush leading shell already owns those rules). Standalone keeps
  // soft gaps.
  const rowClass = embedded
    ? cn(
        'flex h-11 w-full min-w-0 items-stretch overflow-hidden bg-surface-card divide-x divide-border-soft',
        omitBottomHairline
          ? 'border-0'
          : 'border-0 border-y border-border-hairline',
        cornerClass('flush'),
      )
    : 'flex h-11 items-center gap-2';

  const showSerialField =
    !progressive ||
    progressiveStage === 'serial' ||
    (!!editing && progressiveStage !== 'condition');
  const showSerialCollapsed =
    progressive &&
    serialDone &&
    (progressiveStage === 'photos' || progressiveStage === 'done');
  const showPhotoStage =
    progressive &&
    (progressiveStage === 'photos' || progressiveStage === 'done');
  const photoExpanded = progressiveStage === 'photos';
  const latestSerial = [...saved]
    .map((s) => (s.serial_number || '').trim())
    .filter(Boolean)
    .at(-1);

  return (
    <Shell className={shellClass} data-progressive-capture={progressive || undefined}>
      <div
        className={rowClass}
        data-progressive-stage={progressiveStage ?? undefined}
      >
        {onConditionChange ? (
          // Condition picker: full pill row when the line opens (for selection),
          // collapsing to a filled square (grade hue) + white Tags.
          // Progressive: expanded owns the full bar (serial/photos unmount).
          <div
            className={cn(
              'flex min-w-0',
              embedded
                ? 'h-11 items-stretch [&>*]:h-full'
                : 'items-center gap-2',
              progressiveStage === 'condition'
                ? 'min-w-0 flex-1'
                : 'shrink-0',
            )}
          >
            <ConditionPills
              value={condition}
              onChange={handleConditionPick}
              collapsible
              collapsedLabel={collapsedConditionLabel}
              expanded={condExpanded}
              onExpandedChange={handleConditionExpandedChange}
              // Progressive Unbox: full SoT names edge-to-edge (not pill scroll).
              labelVariant={progressive ? 'full' : 'pill'}
              layout={progressive ? 'barDistribute' : 'scroll'}
            />
            {embedded ? null : (
              <div className="h-8 w-px shrink-0 bg-surface-sunken" />
            )}
          </div>
        ) : condition ? (
          <div className="shrink-0">
            <ConditionBadge grade={condition} />
          </div>
        ) : null}

        {progressiveStage === 'condition' ? null : (
          <>
            {showSerialCollapsed ? (
              <HoverTooltip
                label={
                  noSerialActive
                    ? 'No serial — edit'
                    : latestSerial
                      ? `Serial …${getLast8Serial(latestSerial)} — edit`
                      : 'Edit serial'
                }
                asChild
              >
                <button
                  type="button"
                  aria-label="Edit serial"
                  data-progressive-serial="collapsed"
                  className={cn(
                    'ds-raw-button inline-flex h-11 w-11 shrink-0 items-center justify-center',
                    'bg-surface-card text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default',
                    cornerClass('flush'),
                  )}
                  onClick={() => {
                    setSerialExpanded(true);
                    setCondExpanded(false);
                    setTimeout(() => {
                      inputRef.current?.focus({ preventScroll: true });
                    }, 0);
                  }}
                >
                  <Barcode className={TOP_CHROME_ICON_GLYPH} aria-hidden />
                </button>
              </HoverTooltip>
            ) : null}

            {showSerialField ? (
              <>
                <div className="flex min-w-0 flex-1 items-stretch">
                  {noSerialActive && noSerialSlot ? (
                    noSerialSlot
                  ) : (
                  <TextField
                    ref={setInputRef}
                    label="Serial"
                    data-unbox-serial-input
                    appearance={embedded ? 'flush' : 'default'}
                    value={scan}
                    onChange={(next) => {
                      setScan(next);
                      if (inlineNotice) setInlineNotice(null);
                    }}
                    tone={embedded ? 'neutral' : 'blue'}
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

                {noSerialActive ? null : lookupBusy && !scan.trim() && !editing ? (
                  <div
                    role="status"
                    aria-label="Checking serial"
                    className={cn(
                      'inline-flex h-11 w-14 shrink-0 items-center justify-center text-emerald-600',
                      embedded
                        ? cn(cornerClass('flush'), 'bg-emerald-50')
                        : cn(cornerClass('field'), 'border border-emerald-300 bg-emerald-50 shadow-sm'),
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
                    width="w-14"
                    appearance={embedded ? 'flush' : 'default'}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!scan.trim() || disabled}
                    className={cn(
                      'inline-flex h-11 shrink-0 items-center justify-center text-role-caption font-semibold uppercase tracking-wider text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-surface-strong',
                      embedded
                        ? cn(cornerClass('flush'), 'bg-emerald-600')
                        : 'rounded-xl bg-emerald-600 shadow-sm',
                      editing ? 'px-4' : 'w-14',
                    )}
                  >
                    {editing ? (
                      'Save'
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-5 w-5">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                )}
              </>
            ) : null}

            {showPhotoStage && renderPhotoStage ? (
              <div
                className={cn(
                  'flex min-w-0 items-stretch',
                  photoExpanded ? 'min-w-0 flex-1' : 'shrink-0',
                )}
                data-progressive-photos={photoExpanded ? 'expanded' : 'collapsed'}
              >
                {renderPhotoStage({ expanded: photoExpanded })}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Scan-guard feedback — inline under the field where the operator is
          already looking (house rule: card state, not a corner toast). */}
      {inlineNotice ? (
        <p role="status" className="mt-2 text-role-caption font-semibold text-rose-600">
          {inlineNotice}
        </p>
      ) : null}

      {/* Inline slot under the scan field — RETURN serial-match (found /
          not-found). Flush under the serial bar (no top gap); `empty:hidden`
          drops the wrapper when the slot is null. */}
      {resultSlot ? (
        <div className="empty:hidden">{resultSlot}</div>
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
