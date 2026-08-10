'use client';

/**
 * Always-on single-row (h-11) label-face draft on the dogfood commit strip.
 *
 * Mounts in the **top** dock row left of Print · Receive — never a second
 * DenseCompose band. Leading `+` is flush to the left edge (transparent at
 * rest · white only while open) via {@link NoteComposerInsertRail}
 * `trigger="dock"`. Insert menu matches
 * {@link LineNotesCard}: stamp · last notes · ticket · price · PO notes ·
 * title · serials.
 *
 * GRAIN: writes `receiving_line.notes` only — never patches `label_note`
 * directly. The draft live-drives the carton sticker center (preview + Print ·
 * Receive); carton print stamps `label_note`.
 *
 * Ghost autocomplete: personal MRU phrases in localStorage
 * (`label-note-phrases`) + live `previousLineNotes`. Tab / ArrowRight / click
 * accept; Escape dismisses the ghost before blur.
 *
 * Never auto-focuses — wedge / scan bar keeps the hand (station focus law).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Download,
  History,
  Pencil,
  Receipt,
  Tag,
  User,
} from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import {
  labelNoteGhostSuffix,
  matchLabelNotePhrase,
  rememberLabelNotePhrase,
} from '@/lib/receiving/label-note-phrases';
import { toast } from '@/lib/toast';
import {
  NoteComposerInsertRail,
  type NoteComposerInsertAction,
} from '../NoteComposerInsertRail';
import {
  appendNoteLine,
  buildStaffStampText,
  focusTextEnd,
  formatSerialsForNotes,
  formatUnitPriceForNotes,
  NOTE_DOWNLOAD_INSERT_BTN,
  NOTE_INSERT_TRIGGER_DOCK_BTN,
  NOTE_OVERLAY_ICON,
  NOTE_OVERLAY_ICON_BTN,
  NOTE_STAFF_STAMP_BTN,
  NOTE_TAG_BTN,
  NOTE_UNIT_PRICE_BTN,
  parseZendeskTicketId,
} from '../note-composer-helpers';

export function UnboxDockNotesEntry({
  value,
  onChange,
  onSave,
  previousLineNotes,
  skuTitle,
  unitPrice,
  overallZohoNotes,
  zendeskTicket,
  zendeskProviderTicketId,
  zendeskTicketSubject,
  serialNumbers,
  showSyncToPo = true,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Persist when dirty. Optional `next` overrides the live draft (Enter that
   * also accepts a ghost — parent state has not flushed yet). Returns true if
   * a write happened.
   */
  onSave: (next?: string) => boolean;
  /** Prior line note — insert menu appends it into the label draft. */
  previousLineNotes?: string;
  skuTitle?: string | null;
  unitPrice?: string | number | null;
  overallZohoNotes?: string | null;
  zendeskTicket?: string | null;
  zendeskProviderTicketId?: number | null;
  zendeskTicketSubject?: string | null;
  serialNumbers?: string[];
  showSyncToPo?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const { user } = useAuth();
  /** Escape clears the ghost without blur; typing resets dismissal. */
  const [ghostDismissed, setGhostDismissed] = useState(false);
  const staffStamp = buildStaffStampText({
    name: user?.name,
    staffId: user?.staffId,
  });
  const trimmedPrevious = (previousLineNotes || '').trim();
  const trimmedSkuTitle = (skuTitle || '').trim();
  const formattedUnitPrice = formatUnitPriceForNotes(unitPrice);
  const trimmedSyncNotes = (overallZohoNotes ?? '').trim();
  const serialLine = formatSerialsForNotes(serialNumbers ?? []);
  const resolvedTicketId =
    zendeskProviderTicketId != null && zendeskProviderTicketId > 0
      ? String(zendeskProviderTicketId)
      : parseZendeskTicketId(zendeskTicket);
  const hasTicket = Boolean(resolvedTicketId);

  const matchedPhrase = useMemo(() => {
    if (ghostDismissed || !value) return null;
    return matchLabelNotePhrase(value, [trimmedPrevious || null]);
  }, [ghostDismissed, value, trimmedPrevious]);
  const ghostSuffix = labelNoteGhostSuffix(value, matchedPhrase);

  const acceptGhost = useCallback(() => {
    if (!matchedPhrase) return false;
    valueRef.current = matchedPhrase;
    onChange(matchedPhrase);
    setGhostDismissed(true);
    requestAnimationFrame(() => focusTextEnd(inputRef.current));
    return true;
  }, [matchedPhrase, onChange]);

  const persistDraft = useCallback(
    (override?: string) => {
      const phrase = override ?? valueRef.current;
      valueRef.current = phrase;
      const wrote = onSave(phrase);
      if (wrote) rememberLabelNotePhrase(phrase);
      return wrote;
    },
    [onSave],
  );

  const append = useCallback(
    (text: string) => {
      const next = appendNoteLine(value, text);
      if (next === value) return;
      setGhostDismissed(false);
      onChange(next);
      requestAnimationFrame(() => focusTextEnd(inputRef.current));
    },
    [value, onChange],
  );

  const [fetchingTicketSubject, setFetchingTicketSubject] = useState(false);
  const handlePrefillTicketSubject = useCallback(async () => {
    const ticketId = resolvedTicketId;
    if (!ticketId || fetchingTicketSubject) return;

    const cachedSubject = (zendeskTicketSubject || '').trim();
    if (cachedSubject) {
      append(cachedSubject);
      return;
    }

    setFetchingTicketSubject(true);
    try {
      const res = await fetch(`/api/receiving/zendesk-claim/thread?ticketId=${ticketId}`);
      const data = (await res.json().catch(() => null)) as {
        ticket?: { subject?: string | null };
      } | null;
      const subject = data?.ticket?.subject?.trim();
      if (res.ok && subject) {
        append(subject);
      } else {
        toast.error('Could not load ticket subject');
      }
    } catch {
      toast.error('Could not load ticket subject');
    } finally {
      setFetchingTicketSubject(false);
    }
  }, [resolvedTicketId, zendeskTicketSubject, fetchingTicketSubject, append]);

  const insertActions = useMemo((): NoteComposerInsertAction[] => {
    const actions: NoteComposerInsertAction[] = [];

    if (staffStamp) {
      actions.push({
        id: 'staff-stamp',
        label: `Stamp · ${staffStamp}`,
        ariaLabel: 'Stamp staff name and time into label note',
        icon: <User className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_STAFF_STAMP_BTN,
        onClick: () => append(staffStamp),
      });
    }

    if (trimmedPrevious) {
      actions.push({
        id: 'last-notes',
        label: 'Add last notes to label',
        ariaLabel: 'Add last notes to label',
        icon: <History className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_OVERLAY_ICON_BTN,
        onClick: () => append(trimmedPrevious),
      });
    }

    if (hasTicket) {
      actions.push({
        id: 'ticket-subject',
        label: 'Ticket subject',
        ariaLabel: 'Insert the linked support ticket subject',
        icon: <Tag className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_TAG_BTN,
        onClick: () => void handlePrefillTicketSubject(),
        disabled: fetchingTicketSubject,
        loading: fetchingTicketSubject,
      });
    }

    if (formattedUnitPrice) {
      actions.push({
        id: 'unit-price',
        label: `Unit price · ${formattedUnitPrice}`,
        ariaLabel: 'Insert unit price',
        icon: <Receipt className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_UNIT_PRICE_BTN,
        onClick: () => append(formattedUnitPrice),
      });
    }

    if (showSyncToPo && trimmedSyncNotes) {
      actions.push({
        id: 'sync-notes',
        label: 'Synced PO notes',
        ariaLabel: 'Insert synced PO notes',
        icon: <Download className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_DOWNLOAD_INSERT_BTN,
        onClick: () => append(trimmedSyncNotes),
      });
    }

    if (trimmedSkuTitle) {
      actions.push({
        id: 'product-title',
        label: trimmedSkuTitle,
        ariaLabel: 'Insert product title',
        icon: <Pencil className={NOTE_OVERLAY_ICON} />,
        buttonClassName: `${NOTE_OVERLAY_ICON_BTN} text-yellow-600 transition hover:bg-yellow-100/60 hover:text-yellow-700 hover:shadow-sm hover:ring-1 hover:ring-yellow-200/80`,
        onClick: () => append(trimmedSkuTitle),
      });
    }

    if (serialLine) {
      actions.push({
        id: 'serial',
        label: serialLine,
        ariaLabel: 'Insert serial number(s)',
        icon: <Tag className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_UNIT_PRICE_BTN,
        onClick: () => append(serialLine),
      });
    }

    return actions;
  }, [
    staffStamp,
    trimmedPrevious,
    hasTicket,
    fetchingTicketSubject,
    handlePrefillTicketSubject,
    formattedUnitPrice,
    showSyncToPo,
    trimmedSyncNotes,
    trimmedSkuTitle,
    serialLine,
    append,
  ]);

  return (
    <div
      className="flex h-11 min-w-0 flex-1 items-stretch gap-0 bg-surface-sunken"
      data-unbox-dock-notes-entry
    >
      <div
        className="flex h-11 w-11 shrink-0 items-stretch border-r border-border-hairline"
        data-unbox-dock-notes-stamp
      >
        <NoteComposerInsertRail
          actions={insertActions}
          placement="inline"
          trigger="dock"
        />
      </div>
      {trimmedPrevious ? (
        <div
          className="flex h-11 w-11 shrink-0 items-stretch border-r border-border-hairline"
          data-unbox-dock-notes-history
        >
          <HoverTooltip label="Repeat the previous line's notes" asChild>
            {/* ds-raw-button */}
            <button
              type="button"
              onClick={() => append(trimmedPrevious)}
              aria-label="Repeat the previous line's notes"
              className={NOTE_INSERT_TRIGGER_DOCK_BTN}
            >
              <History className={NOTE_OVERLAY_ICON} />
            </button>
          </HoverTooltip>
        </div>
      ) : null}
      <div className="relative min-w-0 flex-1">
        {ghostSuffix ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-2.5 text-role-caption"
          >
            <span className="whitespace-pre">
              <span className="text-transparent">{value}</span>
              {/* ds-raw-button */}
              <button
                type="button"
                tabIndex={-1}
                className="ds-raw-button pointer-events-auto cursor-pointer border-0 bg-transparent p-0 text-inherit text-text-faint"
                aria-label={`Accept suggestion: ${matchedPhrase}`}
                onMouseDown={(e) => {
                  // Keep focus in the input; click would otherwise blur first.
                  e.preventDefault();
                  acceptGhost();
                }}
              >
                {ghostSuffix}
              </button>
            </span>
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setGhostDismissed(false);
            onChange(e.target.value);
          }}
          onBlur={() => {
            persistDraft();
          }}
          onKeyDown={(e) => {
            const el = e.target as HTMLInputElement;
            const caretAtEnd =
              el.selectionStart === el.selectionEnd &&
              el.selectionEnd === el.value.length;

            if (ghostSuffix && caretAtEnd && (e.key === 'Tab' || e.key === 'ArrowRight')) {
              e.preventDefault();
              acceptGhost();
              return;
            }

            if (e.key === 'Escape') {
              e.preventDefault();
              if (ghostSuffix) {
                setGhostDismissed(true);
                return;
              }
              el.blur();
              return;
            }

            if (e.key === 'Enter') {
              e.preventDefault();
              if (ghostSuffix && caretAtEnd && matchedPhrase) {
                valueRef.current = matchedPhrase;
                onChange(matchedPhrase);
                setGhostDismissed(true);
                persistDraft(matchedPhrase);
              } else {
                persistDraft();
              }
              el.blur();
            }
          }}
          placeholder="Label center (prints on carton)"
          aria-label="Label note"
          aria-autocomplete="inline"
          className="relative h-11 w-full min-w-0 border-0 bg-transparent px-2.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
        />
      </div>
    </div>
  );
}
