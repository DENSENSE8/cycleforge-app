'use client';

/**
 * Support · Tickets primary surface — Orders/Unbox workbench recipe.
 *
 * Chrome: ONE toolbar — find, status funnel, sort, refresh — above the queue.
 * Body:   full ticket queue (SupportTicketRow) + pagination
 *
 * Status that narrows this same list is a filter, not a second page header and
 * not TableTabs. DataTableFilterMenu sits beside SearchField (To-ship grammar).
 * `all` is the absence of a status facet — never an option. Default landing is
 * still Open (`?tstatus` omitted). New ticket is desk chrome via
 * {@link DeskActionSlotRegistrar}.
 *
 * URL: `/support` (+ `tstatus` / `tq`). Row open writes `?ticket=` for Station focus.
 * Sidebar owns the recently-selected dock only — not this list.
 */

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  GLOBAL_ADD_INTENT_EVENT,
  consumeGlobalAddIntent,
  type GlobalAddIntent,
} from '@/lib/global-add/catalog';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { Button, EmptyState } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { SearchField } from '@/design-system/primitives/SearchField';
import {
  DEFAULT_TICKET_STATUS,
  parseTicketStatus,
  TICKET_STATUS_ITEMS,
  type TicketStatusFilter,
} from '@/components/sidebar/support/support-sidebar-shared';
import {
  isNotConfigured,
  useZendeskTickets,
  type TicketListParams,
} from '@/hooks/useZendeskQueries';
import { useRecentTickets } from '@/hooks/useRecentTickets';
import { useSupportTicketParam } from '@/hooks/useSupportTicketParam';
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { cn } from '@/utils/_cn';
import { ZendeskSelect } from './ZendeskSelect';
import { SupportTicketRow } from './queue/SupportTicketRow';
import {
  DataTableFilterMenu,
  type DataTableFilterChrome,
} from '@/components/tables/DataTable';
import { IconButton } from '@/design-system/primitives/IconButton';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';

const SUPPORT_PATH = '/support';

type SortKey = 'recent' | 'oldest' | 'priority';
const SORTS: Record<
  SortKey,
  { sortBy: TicketListParams['sortBy']; sortOrder: TicketListParams['sortOrder']; label: string }
> = {
  recent: { sortBy: 'updated_at', sortOrder: 'desc', label: 'Recent' },
  oldest: { sortBy: 'created_at', sortOrder: 'asc', label: 'Oldest' },
  priority: { sortBy: 'priority', sortOrder: 'desc', label: 'Priority' },
};
const SORT_OPTIONS = (Object.keys(SORTS) as SortKey[]).map((k) => ({
  value: k,
  label: SORTS[k].label,
}));

function useSupportTicketsUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTicket, paintTicket } = useSupportTicketParam();

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      // Tickets is the default mode — drop stale `mode=` if present.
      params.delete('mode');
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${SUPPORT_PATH}?${qs}` : SUPPORT_PATH, { scroll: false });
    },
    [router, searchParams],
  );

  const status = parseTicketStatus(searchParams.get('tstatus'));
  const searchQuery = String(searchParams.get('tq') || '').trim();

  const setStatus = useCallback(
    (next: TicketStatusFilter) => {
      if (next === status) return;
      paintTicket(null);
      startTransition(() => {
        replaceParams((params) => {
          if (next === DEFAULT_TICKET_STATUS) params.delete('tstatus');
          else params.set('tstatus', next);
          params.delete('ticket');
        });
      });
    },
    [replaceParams, status, paintTicket],
  );

  const setSearch = useCallback(
    (nextValue: string) => {
      const trimmed = nextValue.trim();
      if (trimmed === searchQuery) return;
      paintTicket(null);
      startTransition(() => {
        replaceParams((params) => {
          if (trimmed) params.set('tq', trimmed);
          else params.delete('tq');
          params.delete('ticket');
        });
      });
    },
    [replaceParams, searchQuery, paintTicket],
  );

  const openTicket = useCallback(
    (t: { id: number; subject: string | null; status: string; priority: string | null }) => {
      setTicket(t.id);
    },
    [setTicket],
  );

  return { status, setStatus, searchQuery, setSearch, openTicket, setTicket };
}

export function SupportTicketsBoard() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { has, isLoaded } = useAuth();
  const canCreateTicket = !isLoaded || has('integrations.zendesk');
  const claim = useSupportTicketClaimHost();
  const { status, setStatus, searchQuery, setSearch, openTicket, setTicket } =
    useSupportTicketsUrl();
  const { push } = useRecentTickets();

  const [sort, setSort] = useState<SortKey>('recent');
  // Ticket board has no KPI band and no Band-3 controls portal (honest absence).
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status, searchQuery, sort]);

  // Global Header Add · `?createTicket=1` → New ticket modal.
  useEffect(() => {
    if (!canCreateTicket) return;
    const raw = searchParams.get('createTicket');
    if (raw === '1' || raw === 'true') {
      claim.openCreate();
      consumeGlobalAddIntent();
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete('createTicket');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/support', { scroll: false });
      return;
    }
    const parked = consumeGlobalAddIntent();
    if (parked?.kind === 'support-create-ticket') {
      claim.openCreate();
    }
  }, [canCreateTicket, searchParams, pathname, router]); // eslint-disable-line react-hooks/exhaustive-deps -- openCreate is stable enough; claim identity churns

  useEffect(() => {
    if (!canCreateTicket) return;
    const onGlobalAdd = (event: Event) => {
      const intent = (event as CustomEvent<GlobalAddIntent>).detail;
      if (intent?.kind !== 'support-create-ticket') return;
      consumeGlobalAddIntent();
      claim.openCreate();
    };
    window.addEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
    return () => window.removeEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
  }, [canCreateTicket, claim.openCreate]);

  const params = useMemo<TicketListParams>(
    () => ({
      query: searchQuery,
      status,
      page,
      perPage: 25,
      sortBy: SORTS[sort].sortBy,
      sortOrder: SORTS[sort].sortOrder,
    }),
    [searchQuery, status, page, sort],
  );

  const { data, isLoading, isFetching, error } = useZendeskTickets(params);
  const tickets = data?.tickets ?? [];

  // Exclusive status facets in the one funnel. `all` is clearing the filter,
  // never a row. Open is the default landing, so the trigger names itself.
  const statusFilter = useMemo<DataTableFilterChrome>(
    () => ({
      options: TICKET_STATUS_ITEMS.filter((item) => item.id !== 'all').map((item) => ({
        id: item.id,
        label: item.label,
        count: item.id === status && data?.count != null ? data.count : undefined,
        active: status === item.id,
      })),
      onToggle: (id) => setStatus(parseTicketStatus(status === id ? 'all' : id)),
      onClearAll: () => setStatus('all'),
    }),
    [status, data?.count, setStatus],
  );

  const select = (t: {
    id: number;
    subject: string | null;
    status: string;
    priority: string | null;
  }) => {
    push(t);
    openTicket(t);
  };

  return (
    <>
      {/*
        The board owns its OWN column. It used to return a bare double fragment
        and inherit the flex context from whatever mounted it — which worked
        only because `ServiceWorkspaceShell`'s list slot happens to be a
        `flex-col`, and left the queue unable to fill any other host.
      */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* ONE toolbar: search · filter · sort · refresh — same order as DataTable. */}
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-border-soft bg-surface-card px-2 py-1">
        <SearchField
          value={searchQuery}
          onChange={setSearch}
          placeholder="Search tickets…"
          className="min-w-[12rem] flex-1"
          tone="neutral"
          hideUnderline
        />
        <DataTableFilterMenu {...statusFilter} />
        <ZendeskSelect
          value={sort}
          options={SORT_OPTIONS}
          onChange={(v) => setSort(v as SortKey)}
        />
        <IconButton
          ariaLabel="Refresh tickets"
          title="Refresh tickets"
          icon={<RefreshCw className={cn('h-3.5 w-3.5 shrink-0', isFetching && 'animate-spin')} />}
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['zendesk'] })}
        />
      </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3">
                <SkeletonList count={8} type="row" />
              </div>
            ) : error ? (
              <div className="p-6">
                <EmptyState
                  title={isNotConfigured(error) ? 'Helpdesk isn’t connected' : 'Couldn’t load tickets'}
                  description={
                    isNotConfigured(error)
                      ? 'Connect one in Settings → Integrations to use the console.'
                      : 'Please try again.'
                  }
                  action={
                    isNotConfigured(error) ? (
                      <Link
                        href="/apps#zendesk"
                        className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent-bg px-4 text-role-data font-semibold text-text-inverse shadow-sm transition-colors hover:bg-accent-bg/90 active:bg-accent-bg/90"
                      >
                        <Link2 className="h-4 w-4" />
                        Connect a helpdesk
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-6">
                {/* Absence and no-match are different answers (workbench.md → the four
                    settled states). Both signals were already in hand and neither was
                    used, so a Solved tab with genuinely nothing solved told the operator
                    their filter was wrong. Zero on a "what needs me" lane is an all-clear,
                    not an absence — say so. */}
                {searchQuery ? (
                  <EmptyState
                    title="No tickets match that search"
                    description={`Nothing in ${status === 'all' ? 'any status' : status} matches “${searchQuery}”.`}
                  />
                ) : status === 'open' || status === 'pending' ? (
                  <EmptyState
                    title="Nothing needs you right now"
                    description={`No ${status} tickets in the queue.`}
                  />
                ) : (
                  <EmptyState
                    title={`No ${status === 'all' ? '' : `${status} `}tickets yet`}
                    description="Tickets appear here as they arrive from the connected helpdesk."
                  />
                )}
              </div>
            ) : (
              <div className="divide-y divide-border-hairline">
                {tickets.map((t) => (
                  <SupportTicketRow
                    key={t.id}
                    id={t.id}
                    subject={t.subject}
                    status={t.status}
                    priority={t.priority as string | null}
                    at={t.updated_at}
                    selected={false}
                    onSelect={() =>
                      select({
                        id: t.id,
                        subject: t.subject,
                        status: String(t.status),
                        priority: (t.priority as string) ?? null,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-border-hairline px-3 py-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!data?.previous_page && page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="text-role-micro font-semibold text-text-faint">
              {data?.count != null ? `${data.count} total` : ''}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data?.next_page}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
      </div>

      {canCreateTicket ? (
        <DeskActionSlotRegistrar>
          <DeskHeaderAction variant="primary" size="sm" onClick={() => claim.openCreate()}>
            New ticket
          </DeskHeaderAction>
        </DeskActionSlotRegistrar>
      ) : null}

      <SupportCreateTicketModal
        open={claim.createOpen}
        submitting={claim.createTicket.isPending}
        onClose={claim.closeCreate}
        onCreate={({ subject, note, linkages }) =>
          claim.createTicket.mutate(
            { subject, note, linkages },
            {
              onSuccess: (data) => setTicket(data.providerTicketId),
            },
          )
        }
      />
    </>
  );
}
