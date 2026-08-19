'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, History, Receipt, User, Tag, Pencil, Info } from '@/components/Icons';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import {
  RECENT_LABEL_NOTE_QUERY_ROOT,
  recentLabelNoteQueryKey,
  shouldRefreshRecentFace,
} from '@/lib/receiving/recent-label-note';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { NoteComposerInsertRail, type NoteComposerInsertAction } from '../NoteComposerInsertRail';
import {
  appendNoteLine,
  buildStaffStampText,
  focusTextEnd,
  formatUnitPriceForNotes,
  NOTE_DOWNLOAD_INSERT_BTN,
  NOTE_OVERLAY_ICON,
  NOTE_OVERLAY_ICON_BTN,
  NOTE_STAFF_STAMP_BTN,
  NOTE_TAG_BTN,
  NOTE_UNIT_PRICE_BTN,
  parseZendeskTicketId,
  resolveNoteGhostPaint,
} from '../note-composer-helpers';
import { useLabelNoteGhostAutocomplete } from './hooks/useLabelNoteGhostAutocomplete';
import { UnboxNotesLocationControl } from './UnboxNotesLocationControl';
import { UnboxNotesStatusDialog } from './UnboxNotesStatusDialog';
import type { LineStatusExactSource } from '@/lib/receiving/unbox-notes-status';

/**
 * Item-note composer — the operator's durable note on this line
 * (`receiving_line.notes`).
 *
 * GRAIN: this note is **not printed**. The printed label face is a separate
 * buffer (`receiving_line.label_note`) owned by the label editor. They were one
 * column until 2026-07-31; splitting them is what lets an operator record
 * something about an item without it landing on the sticker.
 *
 * Hydrates from the row and saves on blur / Send. Built on
 * {@link OmnichannelComposerDock} (ChatGPT-style dock chrome).
 *
 * When a {@link trailingAction} (Unbox Receive) owns the footer, Enter acts
 * like Send-in-chat: save the note, then fire {@link onPrimaryAction}.
 *
 * Ghost autocomplete (label-note MRU via {@link useLabelNoteGhostAutocomplete})
 * paints an inline suffix; Tab / ArrowRight / click accept; Escape dismisses.
 *
 * Recent (History) applies the **sticker center from the newest scanned carton
 * that has one** (`/api/receiving/recent-label-note` → walk scans → the line on
 * that carton touched last → `notes` before the older `label_note`, since the
 * dock draft is what the Unbox face prints). Hover paints that phrase as a
 * ghost placeholder in an empty field; click replaces the draft with the same
 * string.
 *
 * Insert rail (staff stamp / ticket / price / synced PO / title) lives in
 * the composer footer. Location sits left of Print in the trailing slot.
 */

export function LineNotesCard({
  notes,
  overallZohoNotes,
  skuTitle,
  unitPrice,
  zendeskTicket,
  zendeskProviderTicketId,
  zendeskTicketSubject,
  previousLineNotes,
  lineId,
  onNotesChange,
  onSaveNotes,
  showSyncToPo = true,
  animateMount = true,
  chrome = 'raised',
  trailingAction,
  onOpenLocations,
  onPrimaryAction,
  primaryActionDisabled = false,
  statusStamps,
}: {
  /** The operator's durable item note (`receiving_line.notes`) — never printed. */
  notes: string;
  /** Overall Zoho PO header note (carton-level) — source for the push-to-PO action. */
  overallZohoNotes: string | null;
  /** Resolved product title — prefills the title button. */
  skuTitle?: string | null;
  /** Zoho PO line unit cost — prefills the price button. */
  unitPrice?: string | number | null;
  /** Linked Zendesk ticket label — from ticket_links or receiving_lines. */
  zendeskTicket?: string | null;
  /** Provider-native Zendesk id for thread fetch (ticket_links). */
  zendeskProviderTicketId?: number | null;
  /** Cached subject from support_tickets — skips a live round-trip when present. */
  zendeskTicketSubject?: string | null;
  /** Note from the previous line touched this session — repeat-previous source. */
  previousLineNotes?: string;
  /** Current line id — excluded from the DB Recent lookup. */
  lineId?: number | null;
  onNotesChange: (next: string) => void;
  /**
   * Persist the note to `receiving_line.notes`. Optional `next` overrides the
   * live draft (Enter that also accepts a ghost). Returns true if it saved.
   */
  onSaveNotes: (next?: string) => boolean;
  /** Show synced-PO insert — matched cartons only (unfound has no PO). */
  showSyncToPo?: boolean;
  /** Pass-through to OmnichannelComposerDock mount motion. */
  animateMount?: boolean;
  /**
   * Pass-through to OmnichannelComposerDock. `bare` when nested inside
   * {@link UnboxDockHost} so the host owns the only raised shell.
   */
  chrome?: 'raised' | 'bare';
  /**
   * Terminal CTA rendered at the composer's trailing edge (Unbox overview
   * mounts the Receive/Print split here). Replaces the blue Send — Enter
   * fires {@link onPrimaryAction} (chat Send); blur still saves.
   */
  trailingAction?: ReactNode;
  /** Footer location pill → this station's Displays → Locations leaf. */
  onOpenLocations?: () => void;
  /**
   * Primary footer action for Enter when {@link trailingAction} is mounted
   * (print + receive). Empty notes still allow Enter — receive is not gated
   * on having typed a note.
   */
  onPrimaryAction?: () => void;
  /** When true, Enter is a no-op (mirrors the disabled Receive pill). */
  primaryActionDisabled?: boolean;
  /** Line stamps for the notes Info dialog + current putaway face. */
  statusStamps?: LineStatusExactSource & {
    staged_location_id?: number | null;
  };
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  // DB SoT — sticker center from this operator's last scanned tracking (other
  // carton). Never the device-local MRU phrase bank.
  const excludeLineId =
    lineId != null && Number.isFinite(lineId) && lineId > 0 ? lineId : null;
  const recentNoteQuery = useQuery({
    queryKey: recentLabelNoteQueryKey(excludeLineId),
    queryFn: async (): Promise<string> => {
      const qs =
        excludeLineId != null
          ? `?excludeLineId=${encodeURIComponent(String(excludeLineId))}`
          : '';
      const res = await fetch(`/api/receiving/recent-label-note${qs}`);
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        note?: string | null;
      } | null;
      if (!res.ok || !data?.success) return '';
      return (data.note || '').trim();
    },
    staleTime: 15_000,
  });
  const recentPhrase = (recentNoteQuery.data || '').trim();
  const [recentHover, setRecentHover] = useState(false);

  // Close the save→fetch race. The dock's note write is fire-and-forget, so the
  // next carton's Recent fetch can beat the PATCH carrying the face the operator
  // just typed — and would then hold that pre-save answer for the whole carton.
  // This event fires with the PERSISTED row once the write resolves.
  // {@link shouldRefreshRecentFace} keeps it off the steady patch traffic.
  const queryClient = useQueryClient();
  useReceivingEvents({
    'receiving-line-updated': (detail) => {
      if (
        !shouldRefreshRecentFace({
          updatedLineId: detail.id,
          updatedLabelNote: detail.label_note,
          updatedNotes: detail.notes,
          openLineId: excludeLineId,
          shownPhrase: recentPhrase,
        })
      ) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: RECENT_LABEL_NOTE_QUERY_ROOT });
    },
  });

  const {
    matchedPhrase,
    ghostSuffix,
    acceptGhost,
    dismissGhost,
    clearGhostDismissal,
    onValueChange,
    rememberIfWrote,
    handleGhostKeyDown,
    resolveCommitValue,
  } = useLabelNoteGhostAutocomplete({
    value: notes,
    onChange: onNotesChange,
    previousLineNotes: recentPhrase || previousLineNotes,
    inputRef: textareaRef,
  });

  // Hover Recent → the overlay previews exactly what clicking Recent applies.
  // Resolution (incl. suppressing the unrelated MRU ghost while Recent is
  // hovered) lives in {@link resolveNoteGhostPaint}.
  const ghostPaint = resolveNoteGhostPaint({
    recentHover,
    recentPhrase,
    value: notes,
    matchedPhrase,
    ghostSuffix,
  });
  const showHoverGhost = ghostPaint.acceptAppliesRecent;
  const paintMatchedPhrase = ghostPaint.matchedPhrase;
  const paintGhostSuffix = ghostPaint.ghostSuffix;

  // DELETED 2026-08-02 — an auto-focus on the print step.
  //
  // It fired on DERIVED step advance, with no operator gesture: the carton
  // reached `print`, the caret jumped into this textarea, and the next wedge
  // scan was typed into the note instead of the scan bar. Nothing errored and
  // nothing was shown — the operator scans a box, sees nothing happen, and
  // scans again. That is the most expensive bug this bench can ship, and it is
  // the one thing `display/station.md` §3 and the procedure surface's focus rule
  // exist to prevent.
  //
  // A composer is focused because the operator CLICKED it, never because a
  // derivation moved. Do not restore this, and do not re-add it for another
  // step key.

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1600);
  }, []);

  const commitNotes = useCallback(
    (override?: string) => {
      const phrase = override ?? notes;
      const wrote = onSaveNotes(phrase);
      rememberIfWrote(phrase, wrote);
      if (!wrote) return;
      flashSaved();
    },
    [notes, onSaveNotes, rememberIfWrote, flashSaved],
  );

  // Enter: with a trailing Receive CTA, behave like chat Send (save → receive).
  // Without it, Enter is just save (Send button path). Accept ghost first when
  // caret is at end so the MRU phrase is what persists.
  const handleCommit = useCallback(() => {
    const phrase = resolveCommitValue(textareaRef.current);
    if (onPrimaryAction) {
      commitNotes(phrase);
      if (primaryActionDisabled) return;
      onPrimaryAction();
      return;
    }
    commitNotes(phrase);
  }, [onPrimaryAction, primaryActionDisabled, commitNotes, resolveCommitValue]);

  // Auto-save on blur when the note changed.
  const handleBlur = useCallback(() => {
    commitNotes();
  }, [commitNotes]);

  const appendToNotes = useCallback(
    (text: string) => {
      const next = appendNoteLine(notes, text);
      if (next === notes) return;
      clearGhostDismissal();
      onNotesChange(next);
      requestAnimationFrame(() => focusTextEnd(textareaRef.current));
    },
    [notes, onNotesChange, clearGhostDismissal],
  );

  const resolvedTicketId =
    zendeskProviderTicketId != null && zendeskProviderTicketId > 0
      ? String(zendeskProviderTicketId)
      : parseZendeskTicketId(zendeskTicket);

  const [fetchingTicketSubject, setFetchingTicketSubject] = useState(false);
  const handlePrefillTicketSubject = useCallback(async () => {
    const ticketId = resolvedTicketId;
    if (!ticketId || fetchingTicketSubject) return;

    const cachedSubject = (zendeskTicketSubject || '').trim();
    if (cachedSubject) {
      appendToNotes(cachedSubject);
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
        appendToNotes(subject);
      } else {
        toast.error('Could not load ticket subject');
      }
    } catch {
      toast.error('Could not load ticket subject');
    } finally {
      setFetchingTicketSubject(false);
    }
  }, [resolvedTicketId, zendeskTicketSubject, fetchingTicketSubject, appendToNotes]);

  const formattedUnitPrice = formatUnitPriceForNotes(unitPrice);
  const trimmedSkuTitle = (skuTitle || '').trim();
  const trimmedPreviousNotes = recentPhrase;
  const trimmedSyncNotes = (overallZohoNotes ?? '').trim();
  const hasTicket = Boolean(resolvedTicketId);
  const staffStamp = buildStaffStampText({ name: user?.name, staffId: user?.staffId });

  const applyLastLabelNote = useCallback(() => {
    const phrase = recentPhrase;
    if (!phrase) {
      toast.message('No recent label note on a scanned carton yet');
      return;
    }
    clearGhostDismissal();
    onNotesChange(phrase);
    setRecentHover(false);
    requestAnimationFrame(() => focusTextEnd(textareaRef.current));
  }, [recentPhrase, clearGhostDismissal, onNotesChange]);

  const insertActions = useMemo((): NoteComposerInsertAction[] => {
    const actions: NoteComposerInsertAction[] = [];

    if (staffStamp) {
      actions.push({
        id: 'staff-stamp',
        label: `Stamp · ${staffStamp}`,
        ariaLabel: 'Stamp staff name and time',
        icon: <User className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_STAFF_STAMP_BTN,
        onClick: () => appendToNotes(staffStamp),
      });
    }

    if (trimmedPreviousNotes) {
      actions.push({
        id: 'last-notes',
        label: 'Add last notes',
        ariaLabel: 'Add last notes',
        icon: <History className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_OVERLAY_ICON_BTN,
        onClick: () => appendToNotes(trimmedPreviousNotes),
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
        onClick: () => appendToNotes(formattedUnitPrice),
      });
    }

    if (showSyncToPo && trimmedSyncNotes) {
      actions.push({
        id: 'sync-notes',
        label: 'Synced PO notes',
        ariaLabel: 'Insert synced PO notes',
        icon: <Download className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_DOWNLOAD_INSERT_BTN,
        onClick: () => appendToNotes(trimmedSyncNotes),
      });
    }

    if (trimmedSkuTitle) {
      actions.push({
        id: 'product-title',
        label: trimmedSkuTitle,
        ariaLabel: 'Insert product title',
        icon: <Pencil className={NOTE_OVERLAY_ICON} />,
        buttonClassName: `${NOTE_OVERLAY_ICON_BTN} text-yellow-600 transition hover:bg-yellow-100/60 hover:text-yellow-700 hover:shadow-sm hover:ring-1 hover:ring-yellow-200/80`,
        onClick: () => appendToNotes(trimmedSkuTitle),
      });
    }

    return actions;
  }, [
    staffStamp,
    trimmedPreviousNotes,
    hasTicket,
    fetchingTicketSubject,
    handlePrefillTicketSubject,
    formattedUnitPrice,
    showSyncToPo,
    trimmedSyncNotes,
    trimmedSkuTitle,
    appendToNotes,
  ]);

  const footerStart = (
    <>
      <NoteComposerInsertRail actions={insertActions} placement="inline" />
      {/* Recent — hover paints DB note as field ghost only (no tooltip). */}
      {/* ds-raw-button */}
      <button
        type="button"
        onClick={applyLastLabelNote}
        onMouseEnter={() => {
          if (recentPhrase) setRecentHover(true);
        }}
        onMouseLeave={() => setRecentHover(false)}
        onFocus={() => {
          if (recentPhrase) setRecentHover(true);
        }}
        onBlur={() => setRecentHover(false)}
          aria-label="Apply label note from last scanned carton with a note"
        data-unbox-notes-recent
        className={`${NOTE_OVERLAY_ICON_BTN} text-text-faint transition hover:bg-surface-sunken hover:text-text-muted`}
      >
        <History className={NOTE_OVERLAY_ICON} />
      </button>
      <div
        aria-live="polite"
        className={`flex items-center gap-1 text-role-micro font-semibold uppercase tracking-wide text-emerald-600 transition-opacity duration-300 ${
          savedFlash ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <Check className="h-3 w-3" /> Saved
      </div>
    </>
  );

  const footerEnd = (
    <UnboxNotesLocationControl
      lineId={lineId}
      currentLocationId={statusStamps?.staged_location_id}
      currentLocationName={statusStamps?.staged_location_name}
      currentLocationBarcode={statusStamps?.staged_location_barcode}
      currentLocationRoom={statusStamps?.staged_location_room}
    />
  );

  return (
    <>
    <OmnichannelComposerDock
      value={notes}
      onChange={onValueChange}
      onCommit={handleCommit}
      onBlur={handleBlur}
      // Receive CTA: Enter must fire even with an empty note (chat-send).
      // Default composer still requires non-empty text before Save.
      commitDisabled={onPrimaryAction ? primaryActionDisabled : undefined}
      // Unbox overview: this draft live-drives the carton sticker center;
      // durable save is still the item note (`notes`), not label_note.
      placeholder={
        showHoverGhost
          ? ''
          : 'Note for this item — shows on the sticker center'
      }
      ariaLabel="Item note"
      commitAriaLabel="Save item note"
      commitTooltip={
        onPrimaryAction ? 'Receive (Enter) · Shift+Enter for newline' : 'Save notes (Enter)'
      }
      footerStart={footerStart}
      footerEnd={footerEnd}
      headerEnd={
        // ds-raw-button — same overlay glyph as Recent, not a sized IconButton box.
        <button
          type="button"
          aria-label="Item status history"
          onClick={() => setStatusOpen(true)}
          className={`${NOTE_OVERLAY_ICON_BTN} text-text-faint transition hover:bg-surface-sunken hover:text-text-muted`}
        >
          <Info className={NOTE_OVERLAY_ICON} />
        </button>
      }
      trailingAction={trailingAction}
      chrome={chrome}
      animateMount={animateMount}
      textareaRef={textareaRef}
      ghostSuffix={paintGhostSuffix}
      matchedPhrase={paintMatchedPhrase}
      onAcceptGhost={
        showHoverGhost
          ? () => {
              applyLastLabelNote();
            }
          : acceptGhost
      }
      onDismissGhost={
        showHoverGhost
          ? () => {
              setRecentHover(false);
            }
          : dismissGhost
      }
      onTextareaKeyDown={handleGhostKeyDown}
    />
    <UnboxNotesStatusDialog
      open={statusOpen}
      onOpenChange={setStatusOpen}
      row={statusStamps ?? {}}
    />
    </>
  );
}
