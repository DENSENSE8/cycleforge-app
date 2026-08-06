'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check, Download, History, Loader2, Receipt, User, Tag, Pencil } from '@/components/Icons';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { NoteComposerInsertRail, type NoteComposerInsertAction } from '../NoteComposerInsertRail';
import {
  appendNoteLine,
  buildStaffStampText,
  focusTextEnd,
  formatUnitPriceForNotes,
  NOTE_DOWNLOAD_INSERT_BTN,
  NOTE_DOWNLOAD_SYNC_BTN,
  NOTE_OVERLAY_ICON,
  NOTE_OVERLAY_ICON_BTN,
  NOTE_STAFF_STAMP_BTN,
  NOTE_TAG_BTN,
  NOTE_UNIT_PRICE_BTN,
  parseZendeskTicketId,
} from '../note-composer-helpers';

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
 * Insert rail (staff stamp / ticket / price / synced PO / title) and, for
 * matched cartons, push-to-PO live in the composer footer.
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
  onNotesChange,
  onSaveNotes,
  onSaveOverallNote,
  showSyncToPo = true,
  animateMount = true,
  chrome = 'raised',
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled = false,
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
  onNotesChange: (next: string) => void;
  /** Persist the note to `receiving_line.notes`. Returns true if it saved. */
  onSaveNotes: () => boolean;
  /** Append the note into the carton's synced PO note (external push). */
  onSaveOverallNote: (text: string) => void | Promise<void>;
  /** Show the push-to-PO button — matched cartons only (unfound has no PO). */
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
  /**
   * Primary footer action for Enter when {@link trailingAction} is mounted
   * (print + receive). Empty notes still allow Enter — receive is not gated
   * on having typed a note.
   */
  onPrimaryAction?: () => void;
  /** When true, Enter is a no-op (mirrors the disabled Receive pill). */
  primaryActionDisabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

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

  const commitNotes = useCallback(() => {
    if (!onSaveNotes()) return;
    flashSaved();
  }, [onSaveNotes, flashSaved]);

  // Enter: with a trailing Receive CTA, behave like chat Send (save → receive).
  // Without it, Enter is just save (Send button path).
  const handleCommit = useCallback(() => {
    if (onPrimaryAction) {
      commitNotes();
      if (primaryActionDisabled) return;
      onPrimaryAction();
      return;
    }
    commitNotes();
  }, [onPrimaryAction, primaryActionDisabled, commitNotes]);

  // Auto-save on blur when the note changed.
  const handleBlur = useCallback(() => {
    commitNotes();
  }, [commitNotes]);

  const appendToNotes = useCallback(
    (text: string) => {
      const next = appendNoteLine(notes, text);
      if (next === notes) return;
      onNotesChange(next);
      requestAnimationFrame(() => focusTextEnd(textareaRef.current));
    },
    [notes, onNotesChange],
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

  const [syncingToInventory, setSyncingToInventory] = useState(false);
  const handleSyncToInventory = useCallback(async () => {
    if (syncingToInventory || !showSyncToPo) return;
    setSyncingToInventory(true);
    try {
      const combined = appendNoteLine(overallZohoNotes ?? '', notes);
      await onSaveOverallNote(combined);
    } finally {
      setSyncingToInventory(false);
    }
  }, [syncingToInventory, showSyncToPo, notes, overallZohoNotes, onSaveOverallNote]);

  const formattedUnitPrice = formatUnitPriceForNotes(unitPrice);
  const trimmedSkuTitle = (skuTitle || '').trim();
  const trimmedPreviousNotes = (previousLineNotes || '').trim();
  const trimmedSyncNotes = (overallZohoNotes ?? '').trim();
  const hasTicket = Boolean(resolvedTicketId);
  const staffStamp = buildStaffStampText({ name: user?.name, staffId: user?.staffId });

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
      {trimmedPreviousNotes ? (
        <HoverTooltip label="Repeat the previous line's notes" asChild>
          {/* ds-raw-button */}
          <button
            type="button"
            onClick={() => appendToNotes(trimmedPreviousNotes)}
            aria-label="Repeat the previous line's notes"
            className={`${NOTE_OVERLAY_ICON_BTN} text-text-faint transition hover:bg-surface-sunken hover:text-text-muted`}
          >
            <History className={NOTE_OVERLAY_ICON} />
          </button>
        </HoverTooltip>
      ) : null}
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

  const footerEnd = showSyncToPo ? (
    <HoverTooltip label="Push this note to the synced PO" asChild>
      {/* ds-raw-button */}
      <button
        type="button"
        onClick={() => void handleSyncToInventory()}
        disabled={syncingToInventory}
        aria-label="Push this note to the synced PO note"
        className={`${NOTE_DOWNLOAD_SYNC_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {syncingToInventory ? (
          <Loader2 className={`${NOTE_OVERLAY_ICON} animate-spin`} />
        ) : (
          <Download className={NOTE_OVERLAY_ICON} />
        )}
      </button>
    </HoverTooltip>
  ) : null;

  return (
    <OmnichannelComposerDock
      value={notes}
      onChange={onNotesChange}
      onCommit={handleCommit}
      onBlur={handleBlur}
      // Receive CTA: Enter must fire even with an empty note (chat-send).
      // Default composer still requires non-empty text before Save.
      commitDisabled={onPrimaryAction ? primaryActionDisabled : undefined}
      // Unbox overview: this draft live-drives the carton sticker center;
      // durable save is still the item note (`notes`), not label_note.
      placeholder="Note for this item — shows on the sticker center"
      ariaLabel="Item note"
      commitAriaLabel="Save item note"
      commitTooltip={
        onPrimaryAction ? 'Receive (Enter) · Shift+Enter for newline' : 'Save notes (Enter)'
      }
      footerStart={footerStart}
      footerEnd={footerEnd}
      trailingAction={trailingAction}
      chrome={chrome}
      animateMount={animateMount}
      textareaRef={textareaRef}
    />
  );
}
