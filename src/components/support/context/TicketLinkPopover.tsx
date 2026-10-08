'use client';

/**
 * TicketLinkPopover — read an existing Zendesk ticket, then link it to a
 * resolved anchor (receiving / tracking / shipment / order / serial unit).
 * Full-screen two panes (handoff 2026-10-06, Print documents layout): left the
 * search and candidates, right the selected ticket and its whole thread, with
 * the one Link control in the right pane's footer. Shared by the station
 * composer, the Support Context customer card and the pickup record.
 * {@link TicketLinkPicker} is the compact inline body (repair record).
 *
 * The display itself — {@link TicketSplitDialog}, {@link TicketSplitSurface},
 * {@link TicketCandidateRows} — is exported so the Media Library's "Update
 * existing" ticket reads a ticket the same way before replying to it.
 */
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Link2, Search, X } from '@/components/Icons';
import { Button, IconButton, Spinner } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { FindField } from '@/design-system/components/FindField';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { TicketChip } from '@/components/ui/CopyChip';
import { TicketPickRow } from '@/components/ui/TicketPickRow';
import { MergedRecordStream } from '@/components/support/zendesk/chat/MergedRecordStream';
import { requesterFrom, requesterLabel } from '@/components/support/zendesk/chat/support-chat-utils';
import { isNotConfigured, useZendeskTicket } from '@/hooks/useZendeskQueries';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';
import { formatDateTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import { invalidateSupportContextCaches } from '@/hooks';
import type { SupportContextLinkable } from '@/lib/support/context-types';
import {
  parseTicketIdQuery,
  resolveTicketIdForLink,
  type TicketIdentityMatch,
  type TicketLinkCandidate,
} from '@/lib/support/ticket-link-query';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

export type { TicketLinkCandidate };
export { parseTicketIdQuery, resolveTicketIdForLink };
/** `?anchorType=…&<id>=…` for the link waist's GET candidates / DELETE unlink. */
export function anchorToParams(linkable: SupportContextLinkable): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('anchorType', linkable.anchorType);
  if (linkable.anchorType === 'serialUnit') {
    sp.set('serialUnitId', String(linkable.serialUnitId ?? linkable.anchorId));
  } else if (linkable.anchorType === 'receiving') {
    sp.set('receivingId', String(linkable.receivingId ?? linkable.anchorId));
    if (linkable.lineId != null) sp.set('lineId', String(linkable.lineId));
  } else if (linkable.anchorType === 'tracking') {
    sp.set('tracking', linkable.trackingNumber ?? '');
  } else if (linkable.anchorType === 'shipment') {
    sp.set('shipmentId', String(linkable.anchorId));
  } else if (linkable.anchorType === 'repair') {
    sp.set('repairId', String(linkable.anchorId));
  } else {
    sp.set('orderId', String(linkable.anchorId));
  }
  return sp;
}

/** GET url for link candidates. */
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
  if (linkable.anchorType === 'serialUnit') {
    return {
      type: 'serialUnit' as const,
      serialUnitId: linkable.serialUnitId ?? linkable.anchorId,
    };
  }
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
  if (linkable.anchorType === 'repair') {
    return { type: 'repair' as const, repairId: linkable.anchorId };
  }
  return { type: 'order' as const, orderId: linkable.anchorId };
}

/** Candidates for the link search — the same GET for the full-screen surface and the inline picker. */
function useTicketLinkCandidates(linkable: SupportContextLinkable, query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ticket-link-candidates', linkable, query],
    enabled: enabled && linkable.canLinkTicket,
    staleTime: 10_000,
    queryFn: async () => {
      const res = await fetch(candidatesUrl(linkable, query));
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
}

/** The link write — receiving or the support waist, per {@link linkRequest}. */
function useTicketLinkMutation(
  linkable: SupportContextLinkable,
  onLinked: ((ticketNumber: string) => void) | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
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
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not link ticket');
    },
  });
}

export function TicketLinkPopover({
  linkable,
  open,
  onClose,
  onLinked,
  initialQuery = '',
  title,
  match = null,
  matchLoading = false,
}: {
  linkable: SupportContextLinkable;
  open: boolean;
  onClose: () => void;
  onLinked?: (ticketNumber: string) => void;
  /** Seed the search box only when the operator already typed an identifier. An identity miss stays empty. */
  initialQuery?: string;
  /** Heading when nothing matched. A selected identity match replaces this with the pair face. */
  title?: string;
  /** Ticket already on this tracking number or order number — opens selected. */
  match?: TicketIdentityMatch | null;
  /** Identity lookup still in flight — hold the list so the match can land selected. */
  matchLoading?: boolean;
}) {
  return (
    <TicketSplitDialog open={open} onClose={onClose}>
      <TicketLinkSurface
        linkable={linkable}
        initialQuery={initialQuery}
        title={title}
        match={match}
        matchLoading={matchLoading}
        onClose={onClose}
        onLinked={(ticketNumber) => {
          onLinked?.(ticketNumber);
          onClose();
        }}
      />
    </TicketSplitDialog>
  );
}

/** The full-screen two-pane shell on the canvas corner. Mounts its body only while open. */
export function TicketSplitDialog({
  open,
  onClose,
  children,
  testId = 'ticket-link-dialog',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        hideClose
        className={cn(
          'flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden border-0 p-0',
          cornerClass('canvas'),
        )}
        data-testid={testId}
      >
        {open ? children : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Header · left control plane (find + ticket rows) · right pane — read a ticket
 * before acting on it. The find field takes focus when the surface opens, and
 * `F` (outside any field) puts the caret back in it.
 */
export function TicketSplitSurface({
  heading,
  description,
  paired = false,
  chrome = 'dialog',
  onClose,
  headerTrailing,
  search,
  list,
  children,
}: {
  heading: ReactNode;
  description: ReactNode;
  /** The identity-match face (orange heading on a success band). */
  paired?: boolean;
  /** `dialog` inside {@link TicketSplitDialog}; `panel` inside a host overlay that names itself. */
  chrome?: 'dialog' | 'panel';
  onClose: () => void;
  /** Controls between the description and Close — e.g. a ticket-mode switch. */
  headerTrailing?: ReactNode;
  search: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: ComponentProps<typeof FindField>['onKeyDown'];
    /** Host-owned ref (to focus on open); the surface keeps its own otherwise. */
    inputRef?: ComponentProps<typeof FindField>['inputRef'];
  };
  /** The left pane's body under the find field: states or {@link TicketCandidateRows}. */
  list: ReactNode;
  /** The right pane. */
  children: ReactNode;
}) {
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = search.inputRef ?? ownInputRef;

  // The operator knows which ticket they want: the caret starts in Find.
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // `F` returns to Find from anywhere in the surface but a text field.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputRef]);

  const titleClass = cn(paired && 'text-orange-600');
  const descriptionClass = cn('min-w-0 truncate text-sm', paired && 'text-orange-600');
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        className={cn(
          'flex min-w-0 items-center gap-3 border-b border-border-soft px-5 py-2.5',
          paired && 'bg-surface-success',
        )}
        data-testid="ticket-link-header"
        data-paired={paired || undefined}
      >
        {chrome === 'dialog' ? (
          <>
            <DialogTitle className={titleClass}>{heading}</DialogTitle>
            <DialogDescription className={descriptionClass}>{description}</DialogDescription>
          </>
        ) : (
          <>
            <h2 className={cn('text-lg font-semibold leading-none tracking-tight text-text-default', titleClass)}>
              {heading}
            </h2>
            <p className={cn('text-text-soft', descriptionClass)}>{description}</p>
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {headerTrailing}
          <IconButton
            icon={<X />}
            size="md"
            radius="control"
            ariaLabel="Close"
            onClick={onClose}
            data-testid="ticket-link-close"
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-border-soft',
            chrome === 'panel' ? 'w-72' : 'w-96',
          )}
          aria-label="Tickets"
          data-testid="ticket-link-list"
        >
          <div className="shrink-0 px-3 py-2.5">
            <FindField
              value={search.value}
              onChange={search.onChange}
              label="Find a ticket"
              hints={SEARCH_HINTS}
              inputRef={inputRef}
              debounceMs={300}
              size="bar"
              onKeyDown={search.onKeyDown}
              testId="ticket-link-search"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Selected ticket">
          {children}
        </section>
      </div>
    </div>
  );
}

/** A row the split list can show — link candidates and helpdesk search hits alike. */
export interface TicketCandidateRow {
  id: number;
  subject: string | null | undefined;
  status: string;
  /** Already linked to this anchor — painted, not pickable. */
  linkedToThis?: boolean;
}

/** The left pane's ticket rows: soft-cornered, one selected at a time. */
export function TicketCandidateRows({
  rows,
  selectedId,
  onSelect,
}: {
  rows: readonly TicketCandidateRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5 p-1.5">
      {rows.map((t) => {
        const selected = selectedId === t.id;
        return (
          <li key={t.id}>
            {/* ds-raw-button: full-width master-detail row around a composite TicketPickRow; Button's fixed control heights do not fit a two-line identity. */}
            <button
              type="button"
              disabled={t.linkedToThis}
              aria-current={selected || undefined}
              onClick={() => onSelect(t.id)}
              className={cn(
                'ds-raw-button w-full px-3 py-2.5 text-left transition-colors',
                cornerClass('field'),
                focusRing('control', 'accent'),
                selected ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                t.linkedToThis && 'opacity-50',
              )}
              data-testid="ticket-link-row"
              data-ticket-id={t.id}
            >
              <TicketPickRow
                ticketId={t.id}
                subject={t.subject}
                emptySubject="Untitled"
                trailing={
                  <span className="shrink-0 text-role-eyebrow text-text-faint">
                    {t.linkedToThis ? 'linked' : t.status}
                  </span>
                }
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const SEARCH_HINTS = ['Search or paste #ticket…'] as const;

/** Header · left control plane (search + candidates) · right ticket preview with the Link footer. */
function TicketLinkSurface({
  linkable,
  initialQuery,
  title,
  match,
  matchLoading,
  onClose,
  onLinked,
}: {
  linkable: SupportContextLinkable;
  initialQuery: string;
  title?: string;
  match: TicketIdentityMatch | null;
  matchLoading: boolean;
  onClose: () => void;
  onLinked: (ticketNumber: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(match ? '' : initialQuery);
  const [selectedId, setSelectedId] = useState<number | null>(match?.id ?? null);

  // The identity lookup can settle after the surface opens: land on it once,
  // unless the operator already picked something.
  const matchId = match?.id ?? null;
  useEffect(() => {
    if (matchId != null) setSelectedId((current) => current ?? matchId);
  }, [matchId]);

  const trimmed = query.trim();
  const candidates = useTicketLinkCandidates(linkable, trimmed, !matchLoading);
  const preview = useZendeskTicket(selectedId);
  const link = useTicketLinkMutation(linkable, onLinked);

  const rows = candidates.data?.tickets ?? [];
  const hiddenLinked = candidates.data?.hiddenLinked ?? 0;
  // The match leads the list even when the recent page does not carry it.
  const listed =
    match && !trimmed && !rows.some((t) => t.id === match.id)
      ? [{ id: match.id, subject: match.subject, status: match.status ?? '', linkedToThis: false }, ...rows]
      : rows;

  const paired = match != null && selectedId === match.id;
  const heading = paired ? 'Pair to existing ticket' : (title ?? 'Link to an existing ticket?');
  // A host-seeded query is a search term, never an id the operator typed.
  const seed = initialQuery.trim();
  const parsedId = seed && trimmed === seed ? null : parseTicketIdQuery(query);
  const canLink = selectedId != null && preview.isSuccess && !link.isPending;

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>, draft: string) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    // A typed #id opens that ticket to read; a loaded selection links.
    const typed = seed && draft.trim() === seed ? null : parseTicketIdQuery(draft);
    if (typed != null && typed !== selectedId) {
      setSelectedId(resolveTicketIdForLink(draft, rows));
      return;
    }
    if (canLink && selectedId != null) link.mutate(selectedId);
  };

  return (
    <TicketSplitSurface
      heading={heading}
      paired={paired}
      description={
        matchLoading
          ? 'Checking this tracking and order…'
          : paired
            ? `Already on this ${match?.via === 'order' ? 'order' : 'tracking'} — read it, then pair.`
            : 'Pick a ticket, read it, then link.'
      }
      onClose={onClose}
      search={{ value: query, onChange: setQuery, onKeyDown: onSearchKey, inputRef }}
      list={
        <>
          {matchLoading ? (
            <p className="flex items-center gap-2 px-4 py-4 text-role-caption text-text-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking tracking and order…
            </p>
          ) : candidates.isError ? (
            <p className="px-4 py-4 text-role-caption text-text-danger">{candidates.error.message}</p>
          ) : candidates.isLoading ? (
            <p className="flex items-center gap-2 px-4 py-4 text-role-caption text-text-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading tickets…
            </p>
          ) : listed.length === 0 ? (
            <p className="px-4 py-4 text-role-caption text-text-faint">
              {trimmed
                ? parsedId != null
                  ? `Press Enter to open #${parsedId}`
                  : 'No tickets found — try pasting #ticket id'
                : hiddenLinked > 0
                  ? `${hiddenLinked} recent ticket(s) already linked elsewhere — search by #`
                  : 'Recent tickets appear here — or paste #ticket id'}
            </p>
          ) : (
            <TicketCandidateRows rows={listed} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {/* A search whose only match is anchored to ANOTHER item would otherwise read as "no tickets found". */}
          {hiddenLinked > 0 && listed.length > 0 ? (
            <p className="px-4 py-2.5 text-role-micro text-text-faint">
              {hiddenLinked} more match{hiddenLinked === 1 ? '' : 'es'} already linked to another item
            </p>
          ) : null}
        </>
      }
    >
      <div data-conversation-port className="min-h-0 flex-1 overflow-y-auto" data-testid="ticket-link-preview">
        {selectedId == null ? (
          <p className="flex h-full items-center justify-center text-role-body text-text-faint">
            Select a ticket to read it.
          </p>
        ) : (
          <TicketLinkPreview ticketId={selectedId} preview={preview} />
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border-soft px-5 py-2.5">
        <Button
          variant="primary"
          icon={<Link2 />}
          loading={link.isPending}
          disabled={!canLink}
          onClick={() => {
            if (canLink && selectedId != null) link.mutate(selectedId);
          }}
          data-testid="ticket-link-submit"
        >
          {paired ? 'Pair' : 'Link ticket'}
        </Button>
      </footer>
    </TicketSplitSurface>
  );
}

/** The selected ticket, read in full: subject, keys, then the whole thread oldest first. */
function TicketLinkPreview({
  ticketId,
  preview,
}: {
  ticketId: number;
  preview: ReturnType<typeof useZendeskTicket>;
}) {
  if (preview.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (preview.isError || !preview.data) {
    return (
      <p className="flex h-full items-center justify-center px-6 text-center text-role-body text-text-muted">
        {isNotConfigured(preview.error)
          ? 'The helpdesk isn’t connected — this ticket can’t be read here.'
          : `Couldn’t load #${ticketId}${preview.error ? ` — ${preview.error.message}` : ''}`}
      </p>
    );
  }

  const ticket = preview.data;
  const face = supportTicketIdFace(String(ticket.id ?? ticketId));
  const requester = requesterFrom(ticket);
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border-soft px-5 py-4">
        <h2 className="text-role-title font-semibold text-text-default">
          {ticket.subject?.trim() || 'Untitled ticket'}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-role-caption text-text-muted">
          <TicketChip value={face.value} display={face.display} dense />
          {ticket.status ? <TicketStatusPill status={ticket.status} /> : null}
          {ticket.priority ? <span>Priority {ticket.priority}</span> : null}
          <span>Created {formatDateTimePST(ticket.created_at)}</span>
          <span>Updated {formatDateTimePST(ticket.updated_at)}</span>
        </div>
      </div>
      <MergedRecordStream
        ticketId={ticketId}
        requesterId={ticket.requester_id}
        requesterName={requesterLabel(ticket)}
        requesterEmail={requester.email}
        followEnd={false}
      />
    </>
  );
}

/** Search box + candidate list + Link button — the compact inline body (repair record). */
export function TicketLinkPicker({
  linkable,
  onLinked,
  initialQuery = '',
  match = null,
  matchLoading = false,
  active = true,
}: {
  linkable: SupportContextLinkable;
  onLinked?: (ticketNumber: string) => void;
  /** Seed the search box (and the first candidates fetch) with a known identifier. */
  initialQuery?: string;
  /** Prefetched tracking/order hit. Replaces the search with one pair action. */
  match?: TicketIdentityMatch | null;
  matchLoading?: boolean;
  /** False while the host is closed — don't fetch a candidate list in the background. */
  active?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const candidates = useTicketLinkCandidates(linkable, debounced, active && !match && !matchLoading);
  const link = useTicketLinkMutation(linkable, (ticketNumber) => {
    setSelectedId(null);
    onLinked?.(ticketNumber);
  });

  const rows = candidates.data?.tickets ?? [];
  const hiddenLinked = candidates.data?.hiddenLinked ?? 0;

  // A HOST-SEEDED query is a search term, never something the operator typed as an id — and `initialQuery` is a carrier tracking number,…
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

  if (matchLoading) {
    return (
      <p className="flex items-center gap-2 text-role-caption text-text-soft">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking tracking and order…
      </p>
    );
  }

  if (match) {
    const subject = match.subject?.trim();
    return (
      <div className="flex flex-col gap-3">
        <p className="text-role-caption font-semibold text-orange-600">
          #{match.id}
          {subject ? ` · ${subject}` : ''}
        </p>
        <Button
          size="sm"
          variant="primary"
          icon={<Link2 />}
          loading={link.isPending}
          onClick={() => link.mutate(match.id)}
          className="w-full"
        >
          Pair
        </Button>
      </div>
    );
  }

  return (
    <div>
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
                        <span className="text-role-eyebrow text-text-faint">
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

      {/* A tracking-number search whose only match is anchored to ANOTHER item would otherwise render as "no tickets found" — the one conclusion… */}
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
