'use client';

/**
 * TicketLinkPopover — search + pick an existing Zendesk ticket and link it to
 * a resolved anchor (receiving / tracking / shipment / order). Shared by the
 * Support Context Hub LinkageStrip across Support / Unbox / packing surfaces.
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Link2, Search, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { toast } from '@/lib/toast';
import { invalidateSupportContextCaches } from '@/hooks';
import type { SupportContextLinkable } from '@/lib/support/context-types';
import {
  parseTicketIdQuery,
  resolveTicketIdForLink,
  type TicketLinkCandidate,
} from '@/lib/support/ticket-link-query';

export type { TicketLinkCandidate };
export { parseTicketIdQuery, resolveTicketIdForLink };
function anchorToParams(linkable: SupportContextLinkable): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('anchorType', linkable.anchorType);
  if (linkable.anchorType === 'receiving') {
    sp.set('receivingId', String(linkable.receivingId ?? linkable.anchorId));
    if (linkable.lineId != null) sp.set('lineId', String(linkable.lineId));
  } else if (linkable.anchorType === 'tracking') {
    sp.set('tracking', linkable.trackingNumber ?? '');
  } else if (linkable.anchorType === 'shipment') {
    sp.set('shipmentId', String(linkable.anchorId));
  } else {
    sp.set('orderId', String(linkable.anchorId));
  }
  return sp;
}

function anchorToBody(linkable: SupportContextLinkable) {
  if (linkable.anchorType === 'receiving') {
    return {
      type: 'receiving' as const,
      receivingId: linkable.receivingId ?? linkable.anchorId,
      lineId: linkable.lineId ?? null,
    };
  }
  if (linkable.anchorType === 'tracking') {
    return {
      type: 'tracking' as const,
      trackingNumber: linkable.trackingNumber ?? '',
    };
  }
  if (linkable.anchorType === 'shipment') {
    return { type: 'shipment' as const, shipmentId: linkable.anchorId };
  }
  return { type: 'order' as const, orderId: linkable.anchorId };
}

export function TicketLinkPopover({
  linkable,
  open,
  onClose,
  onLinked,
}: {
  linkable: SupportContextLinkable;
  open: boolean;
  onClose: () => void;
  onLinked?: (ticketNumber: string) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedId(null);
    }
  }, [open]);

  const candidates = useQuery({
    queryKey: ['ticket-link-candidates', linkable, debounced],
    enabled: open && linkable.canLinkTicket,
    staleTime: 10_000,
    queryFn: async () => {
      const sp = anchorToParams(linkable);
      if (debounced) sp.set('query', debounced);
      const res = await fetch(`/api/support/tickets/link?${sp.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `link candidates ${res.status}`);
      }
      return {
        tickets: (data.tickets ?? []) as TicketLinkCandidate[],
        hiddenLinked: Number(data.hiddenLinked ?? 0),
      };
    },
  });

  const link = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch('/api/support/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, anchor: anchorToBody(linkable) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || 'Could not link ticket');
      }
      return data as { ticketNumber: string };
    },
    onSuccess: (data) => {
      invalidateSupportContextCaches(qc);
      toast.success(`Linked ${data.ticketNumber}`);
      onLinked?.(data.ticketNumber);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not link ticket');
    },
  });

  if (!open) return null;

  const rows = candidates.data?.tickets ?? [];
  const hiddenLinked = candidates.data?.hiddenLinked ?? 0;
  const parsedId = parseTicketIdQuery(query);
  const canSubmit =
    selectedId != null ||
    (parsedId != null && !candidates.isFetching && !candidates.isLoading);

  const submitLink = () => {
    if (link.isPending) return;
    if (selectedId != null) {
      link.mutate(selectedId);
      return;
    }
    const id = resolveTicketIdForLink(query, rows);
    if (id != null) link.mutate(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitLink();
  };

  return (
    <div className="rounded-xl border border-border-soft bg-surface-card p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Link ticket</p>
        <button
          type="button"
          onClick={onClose}
          className="ds-raw-button rounded-md p-1 text-text-faint hover:bg-surface-hover hover:text-text-muted"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-border-soft bg-surface-canvas px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search or paste #ticket…"
          autoFocus
          className="w-full bg-transparent text-role-caption font-semibold text-text-default outline-none placeholder:text-text-faint"
        />
        {candidates.isFetching ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-faint" />
        ) : null}
      </div>

      <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-border-soft">
        {candidates.isError ? (
          <p className="px-3 py-4 text-center text-role-caption text-rose-600">
            {candidates.error.message}
          </p>
        ) : rows.length === 0 && !candidates.isLoading ? (
          <p className="px-3 py-4 text-center text-role-caption text-text-faint">
            {debounced
              ? parsedId != null
                ? `Press Enter to link #${parsedId}`
                : 'No tickets found — try pasting #ticket id'
              : hiddenLinked > 0
                ? `${hiddenLinked} recent ticket(s) already linked elsewhere — search by #`
                : 'Recent tickets appear here — or paste #ticket id'}
          </p>
        ) : (
          <ul>
            {rows.map((t) => {
              const selected = selectedId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={t.linkedToThis}
                    onClick={() => setSelectedId(selected ? null : t.id)}
                    className={`ds-raw-button flex w-full items-center gap-2 border-b border-border-hairline px-2.5 py-2 text-left last:border-b-0 ${
                      selected ? 'bg-blue-50' : 'hover:bg-surface-hover'
                    } ${t.linkedToThis ? 'opacity-50' : ''}`}
                  >
                    <span className="shrink-0 font-mono text-role-eyebrow tabular-nums text-text-soft">
                      #{t.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                      {t.subject || 'Untitled'}
                    </span>
                    <span className="shrink-0 text-role-eyebrow uppercase text-text-faint">
                      {t.linkedToThis ? 'linked' : t.status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button
        size="sm"
        variant="primary"
        icon={<Link2 />}
        loading={link.isPending}
        disabled={!canSubmit}
        onClick={submitLink}
        className="w-full"
      >
        Link ticket
      </Button>
    </div>
  );
}

/** Backward-compatible export for existing support-link hosts. */
export { invalidateSupportContextCaches };
