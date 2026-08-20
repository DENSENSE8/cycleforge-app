'use client';

/**
 * WorkspaceNotesCard — the auto-saving carton Notes composer.
 *
 * Extracted from {@link LineEditPanel} so the Unbox panel and the standalone
 * {@link TriagePanel} share ONE notes implementation. Pure composition over the
 * controller bag; the panel owns placement (dock vs mid-canvas).
 *
 * GRAIN is a PARAMETER, not an assumption — {@link WorkspaceNotesCardProps.noteGrain}:
 *
 *   - `'line'` (default) — the **item note** (`receiving_line.notes`), the
 *     operator's durable note on this line (Zoho / receive payload). Unbox and
 *     Testing. On Unbox overview the dock draft also live-drives the carton
 *     sticker center; save still patches `notes` only. Durable `label_note` is
 *     edited in the label editor (`LabelEditPopover` / As Listed) and stamped
 *     from the dock draft on carton print — see the two-buffer note in
 *     `useUnboxLineController`.
 *   - `'carton'` — the **door note** (`receiving.support_notes`), a remark about
 *     the BOX. Arrival. It is a separate column because on a multi-line PO the
 *     line buffer would mean silently picking one of N lines, and it would
 *     collide with the note the Unbox operator later writes into that same
 *     field. Law: `source-of-truth.md` → Note vs label grain.
 *
 * The grain decides the baseline it compares against and the column it patches;
 * everything else — chrome, insert rail, trailing terminal, Enter-to-send — is
 * identical, which is the point. One composer face across the stations.
 *
 * It hydrates from the row and saves on blur / Send. With the overview Receive
 * CTA mounted, Enter saves then fires print+receive.
 *
 * Built on {@link OmnichannelComposerDock}. The full view / reload / overwrite of
 * the synced PO note lives in the standalone "PO note" display tab
 * ({@link LinePoNoteCard}).
 */

import type { ReactNode } from 'react';
import { LineNotesCard } from './LineNotesCard';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Minimal notes contract — Unbox + Testing (+ Arrival) compose the same dock
 * without hard-wiring `UnboxLineController`.
 */
type WorkspaceNotesController = {
  itemNote: string;
  setItemNote: (next: string) => void;
  patch: (body: Record<string, unknown>) => void | Promise<unknown>;
  zendeskTrimmed?: string | null;
  providerTicketId?: number | null;
  supportTicket?: { subject?: string | null } | null;
  prevLineNotes?: string;
  isUnfound?: boolean;
};

interface WorkspaceNotesCardProps {
  row: ReceivingLineRow;
  c: WorkspaceNotesController;
  /**
   * Which note buffer this composer owns — see the GRAIN block above. Defaults
   * to the line item note; Arrival's door bench passes `'carton'`.
   */
  noteGrain?: 'line' | 'carton';
  /** Pass-through to OmnichannelComposerDock mount motion. */
  animateMount?: boolean;
  /**
   * Pass-through to OmnichannelComposerDock. `raised` is the floor face on
   * every station that mounts this composer as its dock; `bare` is for a host
   * that already paints the plane, so only one raised shell exists.
   */
  chrome?: 'raised' | 'bare';
  /** Terminal CTA for the composer's trailing edge (Unbox overview receive). */
  trailingAction?: ReactNode;
  /** Enter → same primary as the trailing Receive CTA (print + receive). */
  onPrimaryAction?: () => void;
  /** Mirrors the disabled Receive pill so Enter is a no-op when blocked. */
  primaryActionDisabled?: boolean;
  /**
   * Open this station's Displays → Locations leaf (the footer location pill's
   * **New location**). Omitted on a surface with no Displays column — the menu
   * item then says so instead of pretending.
   */
  onOpenLocations?: () => void;
  /** Header ⓘ → this station's Displays → Timeline leaf (see LineNotesCard). */
  onOpenStatusHistory?: () => void;
}

export function WorkspaceNotesCard({
  row,
  c,
  noteGrain = 'line',
  animateMount = true,
  chrome = 'raised',
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled,
  onOpenLocations,
  onOpenStatusHistory,
}: WorkspaceNotesCardProps) {
  return (
    <div id="zoho-notes-card">
      <LineNotesCard
        notes={c.itemNote}
        overallZohoNotes={row.receiving_zoho_notes ?? null}
        skuTitle={row.zoho_item_title || row.item_name || null}
        unitPrice={row.unit_price ?? null}
        zendeskTicket={c.zendeskTrimmed || row.zendesk_ticket || null}
        zendeskProviderTicketId={c.providerTicketId}
        zendeskTicketSubject={c.supportTicket?.subject ?? null}
        previousLineNotes={c.prevLineNotes}
        lineId={row.id}
        onNotesChange={c.setItemNote}
        onSaveNotes={(override) => {
          // Returns whether it actually persisted, so the card only flashes
          // "Saved" when the note changed. Writes ONE column — the grain's own —
          // and never the printed face (`label_note`), which this composer does
          // not own at either grain. Optional override covers Enter that also
          // accepts a ghost suggestion.
          const next = override ?? c.itemNote;
          if (override != null && override !== c.itemNote) c.setItemNote(override);
          const committed =
            noteGrain === 'carton' ? row.receiving_support_notes || '' : row.notes || '';
          if (next === committed) return false;
          void c.patch(noteGrain === 'carton' ? { support_notes: next } : { notes: next });
          return true;
        }}
        showSyncToPo={!(c.isUnfound ?? false)}
        animateMount={animateMount}
        chrome={chrome}
        trailingAction={trailingAction}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={primaryActionDisabled}
        onOpenLocations={onOpenLocations}
        onOpenStatusHistory={onOpenStatusHistory}
        statusStamps={{
          received_at: row.received_at,
          received_by_name: row.received_by_name,
          unbox_opened_at: row.unbox_opened_at,
          unboxed_at: row.unboxed_at,
          unboxed_by_name: row.unboxed_by_name,
          received_done_at: row.received_done_at,
          label_printed_at: row.label_printed_at,
          staged_at: row.staged_at,
          staged_location_id: row.staged_location_id,
          staged_location_name: row.staged_location_name,
          staged_location_barcode: row.staged_location_barcode,
          staged_location_room: row.staged_location_room,
          // Snapshot + actor: what the operator confirmed, and who confirmed it.
          staged_location_code: row.staged_location_code,
          staged_by_name: row.staged_by_name,
        }}
      />
    </div>
  );
}
