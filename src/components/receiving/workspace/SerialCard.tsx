'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil } from '@/components/Icons';
import { SerialChip } from '@/components/ui/CopyChip';
import { cornerClass, DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { ConditionPills } from './ConditionPills';
import { ConditionBadge } from './ReceivingUnitRows';
import {
  SerialScanField,
  type SavedSerial,
  type SerialScanFieldHandle,
} from './SerialScanField';
import { focusRing } from '@/design-system/tokens/focus-ring';


export type { SavedSerial };

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
}: Props) {
  const showNotes = typeof notes === 'string' && typeof onNotesChange === 'function';
  // Condition picker expand/collapse — Testing / Arrival / Units Displays.
  const [condExpanded, setCondExpanded] = useState(
    () => !String(condition || '').trim(),
  );
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const fieldRef = useRef<SerialScanFieldHandle | null>(null);
  const count = saved.length;

  /**
   * Pick a condition grade, then jump focus straight to the serial input so
   * the operator can scan without a second click. Deferred a tick so focus
   * lands after the grade-change re-render (input is enabled by then).
   */
  const handleConditionPick = (grade: string) => {
    onConditionChange?.(grade);
    setTimeout(() => fieldRef.current?.focus(), 0);
  };

  const handleConditionExpandedChange = (next: boolean) => {
    setCondExpanded(next);
  };

  const beginEdit = (s: SavedSerial) => {
    setCondExpanded(false);
    fieldRef.current?.beginEdit(s);
  };

  useEffect(() => {
    if (editingSerial) setCondExpanded(false);
  }, [editingSerial]);

  const Shell = embedded ? 'div' : 'section';
  const shellClass = embedded
    ? 'w-full min-w-0 group'
    : 'rounded-2xl bg-surface-card p-4 shadow-sm ring-1 ring-border-soft/60 group';

  // Embedded (Unbox PO accordion): one joined flush bar — condition · SERIAL ·
  // trailing, gap-0, square cells. Soft divide-x cell seams + top/bottom
  // hairlines separating the bar from the PO meta above and the Label row below
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

  return (
    <Shell className={shellClass}>
      <div className={rowClass}>
        {onConditionChange ? (
          // Condition picker: full pill row when the line opens (for selection),
          // collapsing to a filled square (grade hue) + white Tags.
          <div
            className={cn(
              'flex min-w-0 shrink-0',
              embedded
                ? 'h-11 items-stretch [&>*]:h-full'
                : 'items-center gap-2',
            )}
          >
            <ConditionPills
              value={condition}
              onChange={handleConditionPick}
              collapsible
              collapsedLabel={collapsedConditionLabel}
              expanded={condExpanded}
              onExpandedChange={handleConditionExpandedChange}
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

        <SerialScanField
          ref={fieldRef}
          saved={saved}
          onAdd={onAdd}
          disabled={disabled}
          onReplaceSerial={onReplaceSerial}
          onMarkNoSerial={onMarkNoSerial}
          lookupBusy={lookupBusy}
          noSerialActive={noSerialActive}
          noSerialSlot={noSerialSlot}
          autoFocusInput={autoFocusInput}
          focusKey={focusKey}
          externalInputRef={externalInputRef}
          appearance={embedded ? 'flush' : 'default'}
          editingSerial={editingSerial}
          onEditingSerialChange={onEditingSerialChange}
          onInlineNoticeChange={setInlineNotice}
        />
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
            className={cn("mt-1 w-full resize-none rounded-xl border border-border-soft bg-surface-card inset-field text-role-caption font-medium leading-snug text-text-default placeholder:text-text-faint", focusRing('field', 'accent'))}
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
            className={cn(
              'fixed z-panelPopover overflow-hidden border border-border-soft bg-surface-card shadow-lg',
              DROPDOWN_SHELL_CORNER,
              onSetCondition ? 'min-w-[200px]' : 'min-w-[112px]',
            )}
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
