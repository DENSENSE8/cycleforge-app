'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Loader2, MessageSquare, Send, Unlink } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { IdentityLinkChip } from './IdentityLinkChip';
import { SellerMessageAnchoredPanel } from './SellerMessageChip';
import { threadKey } from '@/components/support/TicketThreadCard';
import { invalidateSupportContextCaches } from '@/hooks';
import { entitySupportTicketQueryKey } from '@/hooks/useEntitySupportTicket';
import { useTicketNasArchive } from '@/hooks/useTicketNasArchive';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';

/**
 * Prefer the server's field-level `details` (e.g. a Zod issue string like
 * "receivingId: Expected number, received string") over the generic `error`
 * ("Validation failed") so the toast names exactly what the API rejected.
 */
function ticketApiError(json: unknown, fallback: string): string {
  const j = (json ?? {}) as { error?: unknown; details?: unknown };
  const details = typeof j.details === 'string' ? j.details.trim() : '';
  const error = typeof j.error === 'string' ? j.error.trim() : '';
  if (details && error && details !== error) return `${error}: ${details}`;
  return details || error || fallback;
}

/** Numeric Zendesk id parsed out of a stored "#1234" / "1234" / ticket URL. */
function parseTicketId(raw: string): number | null {
  const fromUrl = raw.match(/tickets\/(\d+)/);
  const digits = (fromUrl ? fromUrl[1] : raw.replace(/^#/, '')).match(/\d+/);
  if (!digits) return null;
  const n = Number(digits[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Filed-ticket chip for the carton identity row. Renders the same
 * {@link IdentityLinkChip} primitive as PO#/tracking (orange `#` tone).
 * Menu drops flush-square under the chip (same grammar as Photos). Menu: Open →
 * Message (Ticket push column) → Seller → Archive → Unlink. Outside Unbox
 * there is no Message row. Seller opens the seller draft. Neither pulses the
 * chip face — the ticket id stays visible (no `editing` flash). Archive is the
 * manual NAS claim-folder sync (same waist as Photos display / photo-library
 * ticket leaf); auto-archive after capture does not replace this row.
 *
 * Row copy names WHAT OPENS, not the mechanism: the first row is the ticket's
 * message thread (it read "History", which described a log rather than the
 * conversation an operator goes there to read), the second composes to the
 * seller. Handler / testid names keep `ticketHistory` — the push column's own
 * vocabulary is unchanged.
 */
export function ReceivingTicketChip({
  value,
  display,
  openHref,
  providerTicketId,
  receivingId,
  lineId,
  onUnlinked,
  onOpenTicketView,
  ticketViewActive = false,
}: {
  /** Copy value — internal ticket label (#42). */
  value: string;
  /** Short label shown in the chip (internal ticket id). */
  display: string;
  /** Zendesk deep link for the chip's external-link button. */
  openHref: string | null | undefined;
  /** Provider-native id (Zendesk) for thread/unlink/archive APIs. */
  providerTicketId?: number | null;
  receivingId: number | null;
  /** Line the ticket is linked to (RECEIVING_LINE entity); null → carton. */
  lineId: number | null;
  /** Called after a successful unlink so the parent can clear its ticket state. */
  onUnlinked: () => void;
  /** Toggles the Unbox Ticket push column (`?ticketView=1`). Omit outside Unbox. */
  onOpenTicketView?: () => void;
  /** True while the Ticket push column is open — History menu pressed state only (no face pulse). */
  ticketViewActive?: boolean;
}) {
  const [sellerOpen, setSellerOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const zendeskTicketId = providerTicketId ?? parseTicketId(value);
  const ticketNumber =
    zendeskTicketId != null
      ? String(zendeskTicketId)
      : display.replace(/^#/, '').trim() || '';

  const qc = useQueryClient();
  const nasArchive = useTicketNasArchive();

  const unlink = useMutation<{ removed: boolean; shipmentUnpairWarning: string | null }, Error, void, {
    previousTicketQueries: Array<[readonly unknown[], unknown]>;
  }>({
    mutationFn: async () => {
      if (receivingId == null || zendeskTicketId == null) {
        throw new Error('Missing receiving link');
      }
      const sp = new URLSearchParams({
        receivingId: String(receivingId),
        ticketId: String(zendeskTicketId),
      });
      if (lineId != null) sp.set('lineId', String(lineId));
      const res = await fetch(`/api/receiving/zendesk-claim/link?${sp.toString()}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(ticketApiError(json, `Request failed (${res.status})`));
      }
      return {
        removed: !!json.removed,
        shipmentUnpairWarning:
          typeof json.shipmentUnpairWarning === 'string' ? json.shipmentUnpairWarning : null,
      };
    },
    // Optimistic — clear the chip immediately. Do NOT invalidate/refetch here:
    // a mid-flight by-entity refetch still sees ticket_links / photo dual-links
    // and would resurrect the orange chip before DELETE commits.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['support-ticket'] });
      const previousTicketQueries = qc.getQueriesData({ queryKey: ['support-ticket'] });
      if (zendeskTicketId != null) qc.removeQueries({ queryKey: threadKey(zendeskTicketId) });
      qc.setQueryData(entitySupportTicketQueryKey(lineId, receivingId, null), null);
      if (receivingId != null) {
        qc.setQueryData(entitySupportTicketQueryKey(null, receivingId, null), null);
        patchReceivingRailTicketByCarton(qc, receivingId, null);
      }
      if (lineId != null) {
        qc.setQueryData(entitySupportTicketQueryKey(lineId, null, null), null);
      }
      onUnlinked();
      return { previousTicketQueries };
    },
    onSuccess: ({ shipmentUnpairWarning }) => {
      invalidateSupportContextCaches(qc);
      invalidateReceivingFeeds(qc);
      if (shipmentUnpairWarning) {
        toast.warning(shipmentUnpairWarning, { duration: 8000 });
      } else {
        toast.success('Ticket unlinked');
      }
    },
    onError: (err, _vars, ctx) => {
      toast.error(err.message || 'Could not unlink the ticket');
      // Roll back the optimistic clear — restore cached by-entity rows, then
      // refetch so a failed unlink doesn't leave the chip permanently hidden.
      for (const [key, data] of ctx?.previousTicketQueries ?? []) {
        qc.setQueryData(key, data);
      }
      invalidateSupportContextCaches(qc);
      if (receivingId != null) invalidateReceivingFeeds(qc);
    },
  });

  const openSellerMessage = () => {
    setSellerOpen(true);
  };

  const openTicketHistory = () => {
    setSellerOpen(false);
    onOpenTicketView?.();
  };

  const runNasSync = () => {
    if (!ticketNumber) return;
    nasArchive.mutate({
      ticketNumber,
      receivingId,
      lineId,
    });
  };

  return (
    // `items-stretch` + `h-full`, not `items-center`: the chip's own box is the
    // menu's anchor, so a centred (shorter) box opened the dropdown ABOVE the
    // bar cell's bottom edge — visibly less top padding than Photos / listing,
    // whose faces are `h-full`. Stretching lands every carton-bar menu on one Y.
    <div ref={anchorRef} className="flex h-full shrink-0 items-stretch">
      <IdentityLinkChip
        openHref={openHref}
        openTitle="Open claim in Zendesk"
        value={value}
        display={display}
        tone="ticket"
        iconClass="text-orange-500"
        disableCopy={!value.trim()}
        actionsInMenu
        suppressMenu={sellerOpen}
        menuRows={[
          ...(onOpenTicketView
            ? [
                {
                  id: 'ticket-message',
                  label: 'Message',
                  icon: <MessageSquare className="h-3.5 w-3.5" />,
                  ariaLabel: 'Ticket messages',
                  ariaExpanded: ticketViewActive,
                  seam: true,
                  onSelect: openTicketHistory,
                },
              ]
            : []),
          ...(receivingId != null
            ? [
                {
                  id: 'ticket-seller',
                  // Send, not MessageSquare — the thread row above owns that
                  // glyph; this row composes an outbound draft to the seller.
                  label: 'Seller',
                  icon: <Send className="h-3.5 w-3.5" />,
                  ariaLabel: 'Message the seller',
                  ariaExpanded: sellerOpen,
                  seam: true,
                  onSelect: openSellerMessage,
                },
              ]
            : []),
          {
            id: 'ticket-archive',
            label: nasArchive.isPending ? 'Archiving…' : 'Archive',
            icon: nasArchive.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            ),
            ariaLabel: "Archive this ticket's photos to the NAS claim folder",
            disabled: !ticketNumber || nasArchive.isPending,
            seam: true,
            onSelect: runNasSync,
          },
          {
            id: 'ticket-unlink',
            label: 'Unlink',
            icon: unlink.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlink className="h-3.5 w-3.5" />
            ),
            tone: 'danger' as const,
            ariaLabel: 'Unlink ticket',
            disabled: unlink.isPending || receivingId == null || zendeskTicketId == null,
            seam: true,
            onSelect: () => unlink.mutate(),
          },
        ]}
      />
      {receivingId != null ? (
        <SellerMessageAnchoredPanel
          open={sellerOpen}
          onClose={() => setSellerOpen(false)}
          anchorRef={anchorRef}
          receivingId={receivingId}
          lineId={lineId}
          linkedTicketId={providerTicketId ?? null}
        />
      ) : null}
    </div>
  );
}
