'use client';

/**
 * `/m/support` — the phone Support list (SURFACE_LAW class B): the local
 * status chips New · Open · Pending · On-hold · Solved · Closed over the
 * cards, exactly as the desk's `/support` (`?status=`, counts from the list's
 * own `statusCounts`, which ignore the chips so a chip counts what tapping it
 * shows). One `MobileRecordCard` per Support item — subject, the contact face
 * (never a raw relay address), platform, order, owners, local status and the
 * work flags. A card opens the record on the same route (`?item=`).
 *
 * The route owns its top bar (`host-top-bar.ts`: the record draws its own), so
 * the list mounts the host bar itself — the same `MobileV2TopBar`, with the
 * contextual search narrowing the list server-side (`q`).
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw } from '@/components/Icons';
import { MobileV2TopBar } from '@/components/mobile/v2/MobileV2TopBar';
import { useMobileV2Search } from '@/components/mobile/v2/MobileV2SearchContext';
import {
  MobileRecordCard,
  MobileRecordCardList,
  type MobileRecordCardFact,
  type MobileRecordCardTone,
} from '@/design-system/components/MobileRecordCard';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { Button } from '@/design-system/primitives';
import { TICKET_STATUS_FACE } from '@/design-system/tokens/ticket-status';
import {
  SUPPORT_LOCAL_STATUS_LABEL,
  SUPPORT_LOCAL_STATUSES,
  type SupportLocalStatus,
} from '@/lib/support/conversation/model';
import { parseSupportListStatuses, type SupportListRow } from '@/lib/support/list/support-list';
import { useSupportList } from '@/lib/support/list/use-support-list';
import { supportHeaderFlags } from '@/lib/support/record/support-record-model';
import { supportMobileHref } from '@/lib/nav/route-tree';
import { formatMonthDayTimePST } from '@/utils/date';

/** The card's rail: what needs someone first, then the closed states. */
function rowTone(row: SupportListRow): MobileRecordCardTone {
  if (row.flags.follow_up_due || row.flags.sync_failed) return 'bad';
  if (row.flags.needs_reply) return 'warn';
  if (row.status === 'solved' || row.status === 'closed') return 'ok';
  return 'neutral';
}

function rowFacts(row: SupportListRow): MobileRecordCardFact[] {
  const facts: MobileRecordCardFact[] = [];
  const platform = [row.platform?.label, row.account?.label].filter(Boolean).join(' · ');
  if (platform) facts.push({ label: 'Platform', value: platform });
  if (row.primaryOrder) {
    facts.push({
      label: 'Order',
      value: row.primaryOrder.orderNumber ? `#${row.primaryOrder.orderNumber}` : `Order ${row.primaryOrder.orderId}`,
    });
  }
  facts.push({ label: 'Owners', value: row.assignees.length > 0 ? row.assignees.map((a) => a.name).join(', ') : 'Unassigned' });
  return facts;
}

/** Who it is for: the contact face, or what kind of record it is when nobody is named. */
function rowDetail(row: SupportListRow): string {
  if (row.purpose === 'internal_record') return 'Internal record';
  return [row.contact.label, row.contact.detail].filter(Boolean).join(' · ') || 'Customer not named yet';
}

function SupportListCard({ row, onOpen }: { row: SupportListRow; onOpen: () => void }) {
  const flags = supportHeaderFlags(row.flags).map((flag) => flag.label);
  return (
    <MobileRecordCard
      identity={`Support #${row.itemId}`}
      status={SUPPORT_LOCAL_STATUS_LABEL[row.status]}
      tone={rowTone(row)}
      timestamp={formatMonthDayTimePST(row.lastActivityAt)}
      title={row.subject?.trim() || 'No subject yet'}
      detail={rowDetail(row)}
      facts={rowFacts(row)}
      count={flags.length > 0 ? flags.join(' · ') : null}
      onOpen={onOpen}
      testId={`mobile-support-card-${row.itemId}`}
    />
  );
}

export function MobileSupportList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams?.get('status') ?? '';
  const statuses = useMemo(() => parseSupportListStatuses(statusParam), [statusParam]);
  const active = useMemo(() => new Set<SupportLocalStatus>(statuses), [statuses]);
  const searchQuery = useMobileV2Search().query.trim();
  const q = searchQuery || searchParams?.get('q')?.trim() || '';

  const search = useMemo(() => {
    const params = new URLSearchParams();
    if (statuses.length > 0) params.set('status', statuses.join(','));
    if (q) params.set('q', q);
    return params.toString();
  }, [q, statuses]);
  const list = useSupportList(search);
  const rows = list.data?.rows ?? [];
  const counts = list.data?.statusCounts;

  const chips = useMemo<StatusChip<SupportLocalStatus>[]>(
    () =>
      SUPPORT_LOCAL_STATUSES.map((status) => ({
        id: status,
        label: SUPPORT_LOCAL_STATUS_LABEL[status],
        // The helpdesk status hues are the local statuses' faces; On-hold is the vocabulary's `hold`.
        tone: TICKET_STATUS_FACE[status === 'on_hold' ? 'hold' : status],
        count: counts?.[status] ?? 0,
      })),
    [counts],
  );

  const setStatuses = (next: readonly SupportLocalStatus[]) => {
    const ordered = SUPPORT_LOCAL_STATUSES.filter((status) => next.includes(status));
    router.replace(supportMobileHref({ status: ordered.join(','), q: searchParams?.get('q') }), { scroll: false });
  };
  const toggle = (status: SupportLocalStatus) =>
    setStatuses(active.has(status) ? statuses.filter((s) => s !== status) : [...statuses, status]);

  const open = (row: SupportListRow) =>
    router.push(supportMobileHref({ item: row.itemId, status: statusParam, q: searchParams?.get('q') }));

  const scopeLabel = statuses.map((status) => SUPPORT_LOCAL_STATUS_LABEL[status]).join(' or ');

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-support-list">
      <MobileV2TopBar />
      <div className="shrink-0 border-b border-border-hairline px-mode-page py-2">
        <StatusChipRail
          chips={chips}
          active={active}
          onToggle={toggle}
          onReset={() => setStatuses([])}
          label="Filter Support items by status"
          testId="mobile-support-status-chips"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={list.isFetching || undefined}>
        {list.isError && rows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border-b border-border-hairline px-mode-page py-5">
            <p role="alert" className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
              <AlertTriangle className="h-4 w-4" /> {list.error?.message ?? 'Could not load Support items.'}
            </p>
            <Button variant="secondary" radius="flush" size="lg" icon={<RefreshCw />} onClick={() => void list.refetch()}>
              Retry
            </Button>
          </div>
        ) : list.isPending ? (
          <p className="px-mode-page py-10 text-center text-role-caption text-text-muted">Loading Support items…</p>
        ) : rows.length === 0 ? (
          <div className="px-mode-page py-10 text-center" data-testid="mobile-support-empty">
            <p className="text-role-data font-semibold text-text-default">
              {q ? 'Nothing matches this search.' : scopeLabel ? `No ${scopeLabel} Support items.` : 'No Support items.'}
            </p>
            {q || scopeLabel ? (
              <p className="mt-1 text-role-caption text-text-muted">
                {q ? 'Clear the search to see every Support item.' : 'Reset the status chips to see every Support item.'}
              </p>
            ) : null}
          </div>
        ) : (
          <MobileRecordCardList>
            {rows.map((row) => (
              <SupportListCard key={row.itemId} row={row} onOpen={() => open(row)} />
            ))}
          </MobileRecordCardList>
        )}
      </div>
    </div>
  );
}
