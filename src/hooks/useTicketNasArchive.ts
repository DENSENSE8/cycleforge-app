'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

interface TicketNasArchiveInput {
  /** Carton id when known (unbox / claim). Omit to resolve from the ticket link. */
  receivingId?: number | null;
  lineId?: number | null;
  /** Zendesk / folder ticket number (with or without `#`). */
  ticketNumber: string;
}

interface TicketNasArchiveResult {
  folderName: string;
  copied: number;
  total: number;
}

function archiveApiError(json: unknown, fallback: string): string {
  const j = (json ?? {}) as { error?: unknown; details?: unknown };
  const details = typeof j.details === 'string' ? j.details.trim() : '';
  const error = typeof j.error === 'string' ? j.error.trim() : '';
  if (details && error && details !== error) return `${error}: ${details}`;
  return details || error || fallback;
}

/**
 * Manual ticket-folder NAS archive — same `/archive-only` waist as the claim
 * modal and filed-ticket chip. `receivingId` is optional when the ticket is
 * already linked to a receiving carton/line (photo-library ticket leaf).
 */
export function useTicketNasArchive() {
  return useMutation<TicketNasArchiveResult, Error, TicketNasArchiveInput>({
    mutationFn: async ({ receivingId, lineId, ticketNumber }) => {
      const trimmed = ticketNumber.trim();
      if (!trimmed) throw new Error('Ticket number is required');

      const body: Record<string, unknown> = { ticketNumber: trimmed };
      if (receivingId != null && receivingId > 0) body.receivingId = receivingId;
      if (lineId != null && lineId > 0) body.lineId = lineId;

      const res = await fetch('/api/receiving/zendesk-claim/archive-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(archiveApiError(json, `Request failed (${res.status})`));
      }
      return {
        folderName: String(json.folderName ?? trimmed.replace(/^#/, '')),
        copied: Number(json.copied ?? 0),
        total: Number(json.total ?? 0),
      };
    },
    onSuccess: (d) => {
      toast.success(`Synced ${d.copied}/${d.total} photo(s) → /${d.folderName}`);
    },
    onError: (err) => {
      toast.error(err.message || 'Could not sync photos to NAS');
    },
  });
}
