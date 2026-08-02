'use client';

/**
 * Support · Tickets primary surface — Orders/Unbox workbench recipe.
 *
 * Chrome: WorkbenchChromeHeader status tabs + ToolbarSearchToggle + sort
 * Body:   full ticket queue (SupportTicketRow) + pagination
 *
 * URL: `/support` (+ `tstatus` / `tq`). Row open writes `?ticket=` for Station focus.
 * Sidebar owns the recently-selected dock only — not this list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { Button, EmptyState, IconButton } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
} from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { cn } from '@/utils/_cn';
import { ZendeskSelect } from './ZendeskSelect';
import { SupportTicketChromeActions } from './SupportTicketChromeActions';
import { SupportTicketRow } from './queue/SupportTicketRow';

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

const TAB_COLOR: Record<TicketStatusFilter, 'blue' | 'orange' | 'purple' | 'emerald' | 'gray'> = {
  open: 'blue',
  pending: 'orange',
  hold: 'purple',
  solved: 'emerald',
  all: 'gray',
};

function useSupportTicketsUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
      replaceParams((params) => {
        if (next === DEFAULT_TICKET_STATUS) params.delete('tstatus');
        else params.set('tstatus', next);
        params.delete('ticket');
      });
    },
    [replaceParams, status],
  );

  const setSearch = useCallback(
    (nextValue: string) => {
      const trimmed = nextValue.trim();
      if (trimmed === searchQuery) return;
      replaceParams((params) => {
        if (trimmed) params.set('tq', trimmed);
        else params.delete('tq');
        params.delete('ticket');
      });
    },
    [replaceParams, searchQuery],
  );

  const openTicket = useCallback(
    (t: { id: number; subject: string | null; status: string; priority: string | null }) => {
      replaceParams((params) => {
        params.set('ticket', String(t.id));
      });
    },
    [replaceParams],
  );

  return { status, setStatus, searchQuery, setSearch, openTicket };
}

export function SupportTicketsBoard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has, isLoaded } = useAuth();
  const canCreateTicket = !isLoaded || has('integrations.zendesk');
  const claim = useSupportTicketClaimHost();
  const { status, setStatus, searchQuery, setSearch, openTicket } = useSupportTicketsUrl();
  const { push } = useRecentTickets();

  const [sort, setSort] = useState<SortKey>('recent');
  const [page, setPage] = useState(1);
  const [text, setText] = useState(searchQuery);
  const [debounced, setDebounced] = useState(searchQuery);

  // Keep local field in sync when URL `tq` changes (back / mode restore).
  useEffect(() => {
    setText(searchQuery);
    setDebounced(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(h);
  }, [text]);

  useEffect(() => {
    if (debounced === searchQuery) return;
    setSearch(debounced);
  }, [debounced, searchQuery, setSearch]);

  useEffect(() => {
    setPage(1);
  }, [status, debounced, sort]);

  const params = useMemo<TicketListParams>(
    () => ({
      query: debounced,
      status,
      page,
      perPage: 25,
      sortBy: SORTS[sort].sortBy,
      sortOrder: SORTS[sort].sortOrder,
    }),
    [debounced, status, page, sort],
  );

  const { data, isLoading, isFetching, error } = useZendeskTickets(params);
  const tickets = data?.tickets ?? [];

  const tabs = useMemo(
    () =>
      TICKET_STATUS_ITEMS.map((item) => ({
        id: item.id,
        label: item.label,
        color: TAB_COLOR[item.id as TicketStatusFilter],
        count: item.id === status && data?.count != null ? data.count : undefined,
      })),
    [status, data?.count],
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
    <DashboardScrollShell
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <WorkbenchChromeHeader
            density="band"
            tabs={tabs}
            activeTab={status}
            onTabChange={(id) => setStatus(parseTicketStatus(id))}
            solidTone="accent"
            search={
              <ToolbarSearchToggle
                value={text}
                onChange={setText}
                onClear={() => {
                  setText('');
                  setSearch('');
                }}
                placeholder="Search tickets…"
                tone="blue"
              />
            }
            right={
              <HoverTooltip label="Refresh tickets" asChild>
                <IconButton
                  icon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ['zendesk'] })}
                  ariaLabel="Refresh tickets"
                  className="rounded-md p-1.5 hover:bg-surface-sunken"
                />
              </HoverTooltip>
            }
            trailing={
              <WorkbenchTrailingCluster
                sort={
                  <ZendeskSelect
                    value={sort}
                    options={SORT_OPTIONS}
                    onChange={(v) => setSort(v as SortKey)}
                  />
                }
                actions={
                  canCreateTicket ? (
                    <SupportTicketChromeActions onAdd={() => claim.openCreate()} />
                  ) : null
                }
              />
            }
          />
        </div>
      }
    >
      <div className={cn(WORKBENCH_BODY_COLUMN, 'flex min-h-0 flex-1 flex-col')}>
        <div
          className={cn(
            MONITOR_SECTION_CARD_SCROLL_CLASS,
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          )}
        >
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
                        href="/settings/integrations#zendesk"
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
                {debounced ? (
                  <EmptyState
                    title="No tickets match that search"
                    description={`Nothing in ${status === 'all' ? 'any status' : status} matches “${debounced}”.`}
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
      </div>

      <SupportCreateTicketModal
        open={claim.createOpen}
        submitting={claim.createTicket.isPending}
        onClose={claim.closeCreate}
        onCreate={({ subject, note, linkages }) =>
          claim.createTicket.mutate(
            { subject, note, linkages },
            {
              onSuccess: (data) =>
                router.push(`/support?mode=tickets&ticket=${data.providerTicketId}`),
            },
          )
        }
      />
    </DashboardScrollShell>
  );
}
