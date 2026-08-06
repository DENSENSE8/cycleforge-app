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
import { TicketPickRow } from '@/components/ui/TicketPickRow';
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

/**
 * GET url for link candidates. A **receiving** anchor goes through the
 * receiving-gated twin of the link waist, not `/api/support/tickets/link`.
 *
 * Both routes call the SAME `listCandidatesForAnchor` / `linkTicketToAnchor`
 * helpers (`src/lib/support/ticket-link.ts`) — they differ only in the
 * permission they demand: `integrations.zendesk`, which is ADMIN_ONLY in the
 * seeded role matrix (`scripts/seed-roles.mjs`), vs `receiving.mark_received`,
 * which the `receiver` role holds. The receiving route exists precisely "so
 * floor operators can claim without the broader Zendesk console permission" —
 * so pointing a receiving anchor at the support route 403s exactly the operator
 * the unfound "Find ticket by tracking" lane was built for.
 */
function candidatesUrl(linkable: SupportContextLinkable, query: string): string {
  if (linkable.anchorType === 'receiving') {
    const sp = new URLSearchParams();
    sp.set('receivingId', String(linkable.receivingId ?? linkable.anchorId));
    if (linkable.lineId != null) sp.set('lineId', String(linkable.lineId));
    if (query) sp.set('query', query);
    return `/api/receiving/zendesk-claim/link?${sp.toString()}`;
  }
  const sp = anchorToParams(linkable);
  if (query) sp.set('query', query);
  return `/api/support/tickets/link?${sp.toString()}`;
}

/** POST target + body for the link mutation — same route split as {@link candidatesUrl}. */
function linkRequest(
  linkable: SupportContextLinkable,
  ticketId: number,
): { url: string; body: unknown } {
  if (linkable.anchorType === 'receiving') {
    return {
      url: '/api/receiving/zendesk-claim/link',
      body: {
        receivingId: linkable.receivingId ?? linkable.anchorId,
        lineId: linkable.lineId ?? null,
        ticketId,
      },
    };
  }
  return {
    url: '/api/support/tickets/link',
    body: { ticketId, anchor: anchorToBody(linkable) },
  };
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
  initialQuery = '',
  title = 'Link ticket',
}: {
  linkable: SupportContextLinkable;
  open: boolean;
  onClose: () => void;
  onLinked?: (ticketNumber: string) => void;
  /**
   * Seed the search box (and the first candidates fetch) with a known
   * identifier — the Unbox unfound lane passes the carton's tracking number so
   * the operator sees matching helpdesk tickets without typing. The box stays
   * editable; closing resets back to this seed, not to empty.
   */
  initialQuery?: string;
  /** Eyebrow label — the shared strip surfaces a scoped variant. */
  title?: string;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery(initialQuery);
      setSelectedId(null);
    }
  }, [open, initialQuery]);

  const candidates = useQuery({
    queryKey: ['ticket-link-candidates', linkable, debounced],
    enabled: open && linkable.canLinkTicket,
    staleTime: 10_000,
    queryFn: async () => {
      const res = await fetch(candidatesUrl(linkable, debounced));
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
      const { url, body } = linkRequest(linkable, ticketId);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  // A HOST-SEEDED query is a search term, never something the operator typed as
  // an id — and `initialQuery` is a carrier tracking number, which for FedEx is
  // 12 digits and therefore parses as one. Untouched, it rendered "Press Enter
  // to link #382803670296" over an enabled button that could only ever 404.
  // The id path switches back on the moment the operator edits the box.
  const seed = initialQuery.trim();
  const isUntouchedSeed = seed.length > 0 && query.trim() === seed;
  const parsedId = isUntouchedSeed ? null : parseTicketIdQuery(query);
  const canSubmit =
    selectedId != null ||
    (parsedId != null && !candidates.isFetching && !candidates.isLoading);

  const submitLink = () => {
    if (link.isPending) return;
    if (selectedId != null) {
      link.mutate(selectedId);
      return;
    }
    // No pick and no typed id — the seed alone must never link anything.
    if (parsedId == null) return;
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
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{title}</p>
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
                : isUntouchedSeed
                  ? `No ticket mentions ${seed} — edit to search, or paste a #ticket id`
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
                    className={`ds-raw-button w-full border-b border-border-hairline px-2.5 py-2 text-left last:border-b-0 ${
                      selected ? 'bg-blue-50' : 'hover:bg-surface-hover'
                    } ${t.linkedToThis ? 'opacity-50' : ''}`}
                  >
                    <TicketPickRow
                      ticketId={t.id}
                      subject={t.subject}
                      emptySubject="Untitled"
                      trailing={
                        <span className="text-role-eyebrow uppercase text-text-faint">
                          {t.linkedToThis ? 'linked' : t.status}
                        </span>
                      }
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* A tracking-number search whose only match is anchored to ANOTHER item
          would otherwise render as "no tickets found" — the one conclusion the
          operator must not draw. Anchor mode hides those rows (picking one would
          re-anchor it), so name the count instead of swallowing it. */}
      {hiddenLinked > 0 && rows.length > 0 ? (
        <p className="mb-2 text-role-micro text-text-faint">
          {hiddenLinked} more match{hiddenLinked === 1 ? '' : 'es'} already linked to another item
        </p>
      ) : null}

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
