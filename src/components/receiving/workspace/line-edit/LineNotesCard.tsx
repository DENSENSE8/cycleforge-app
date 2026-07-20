'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check, Download, Loader2, Pencil, History, DollarSign, User, Tag } from '@/components/Icons';
import type { ReceivingStepKey } from '../ReceivingProgressStepper';
import { WorkspaceCard } from '@/design-system/components';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { NoteComposerInsertRail, type NoteComposerInsertAction } from '../NoteComposerInsertRail';
import {
  appendNoteLine,
  buildStaffStampText,
  focusTextEnd,
  formatUnitPriceForNotes,
  NOTE_COMPOSER_OVERLAY_PAD_BOTTOM_ACTIONS,
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
 * Header-less carton-notes composer for the receiving workspace — ONE note, not
 * a tab stack.
 *
 * The note is a single durable buffer (`receiving_lines.notes`): it composes the
 * printed label face AND is the operator's saved note. It hydrates from the row
 * (in `useUnboxLineController`) and **auto-saves on blur** — a light "Saved"
 * flash confirms it — so a reprint carries the same note. There is no separate
 * "Label" vs "Internal" buffer and no manual "save to internal" bridge anymore.
 *
 * The composer keeps its insert rail (staff stamp / ticket subject / unit price /
 * synced-PO note / product title) and, for matched cartons, one bottom-right
 * button that pushes the note into the carton's synced PO note. The receiving
 * Checklist is now a top-level display tab, not a surface inside this card.
 */

const NOTES_TEXTAREA_FOCUS =
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

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
  activeStep = null,
}: {
  /** The one durable note (`receiving_lines.notes`) — composes the label + saves. */
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
  /** Persist the note to `receiving_lines.notes`. Returns true if it saved. */
  onSaveNotes: () => boolean;
  /** Append the note into the carton's synced PO note (external push). */
  onSaveOverallNote: (text: string) => void | Promise<void>;
  /** Show the push-to-PO button — matched cartons only (unfound has no PO). */
  showSyncToPo?: boolean;
  /** Active workflow step — auto-focuses the composer on the print step. */
  activeStep?: ReceivingStepKey | null;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  // Focus the composer when the workflow reaches the print step, so the operator
  // lands on the label note without hunting for the cursor.
  useEffect(() => {
    if (activeStep === 'print') {
      requestAnimationFrame(() => focusTextEnd(textareaRef.current));
    }
  }, [activeStep]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // Auto-save on blur; flash "Saved" only when the note actually changed.
  const handleBlur = useCallback(() => {
    if (!onSaveNotes()) return;
    setSavedFlash(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1600);
  }, [onSaveNotes]);

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
      const data = (await res.json().catch(() => null)) as { ticket?: { subject?: string | null } } | null;
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
        icon: <DollarSign className={NOTE_OVERLAY_ICON} />,
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

  return (
    // Glass worksheet surface — matches the carton context / PO items cards so the
    // whole unbox column reads as one frosted worksheet. No header row: the
    // placeholder teaches what the field is, and it saves itself.
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-3">
      <div className="group relative">
        <textarea
          ref={textareaRef}
          rows={2}
          aria-label="Carton notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Notes for this carton — printed on the label and saved"
          className={`block w-full resize-none rounded-lg border border-border-soft px-3 text-role-caption text-text-default placeholder:text-text-faint py-1.5 pr-10 ${NOTE_COMPOSER_OVERLAY_PAD_BOTTOM_ACTIONS} ${NOTES_TEXTAREA_FOCUS}`}
        />

        {/* Top-left repeat-previous; top-right insert rail; bottom-right push-to-PO. */}
        {trimmedPreviousNotes && (
          <div className="pointer-events-none absolute left-1.5 top-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <div className="pointer-events-auto">
              <HoverTooltip label="Repeat the previous line's notes" asChild>
                {/* ds-raw-button */}
                <button
                  type="button"
                  onClick={() => appendToNotes(trimmedPreviousNotes)}
                  aria-label="Repeat the previous line's notes"
                  className={`${NOTE_OVERLAY_ICON_BTN} bg-surface-card/80 text-text-faint shadow-sm ring-1 ring-border-soft/60 transition hover:bg-surface-sunken hover:text-text-muted`}
                >
                  <History className={NOTE_OVERLAY_ICON} />
                </button>
              </HoverTooltip>
            </div>
          </div>
        )}

        <NoteComposerInsertRail actions={insertActions} />

        {/* Bottom-left: a light "Saved" confirmation that fades in on blur-save. */}
        <div
          aria-live="polite"
          className={`pointer-events-none absolute bottom-1.5 left-3 flex items-center gap-1 text-role-micro font-semibold uppercase tracking-wide text-emerald-600 transition-opacity duration-300 ${
            savedFlash ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Check className="h-3 w-3" /> Saved
        </div>

        {showSyncToPo ? (
          <div className="pointer-events-none absolute bottom-1.5 right-1.5 z-10">
            <div className="pointer-events-auto">
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
            </div>
          </div>
        ) : null}
      </div>
    </WorkspaceCard>
  );
}
