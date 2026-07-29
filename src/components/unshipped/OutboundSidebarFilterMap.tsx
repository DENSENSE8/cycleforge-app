'use client';

/**
 * Outbound sidebar filter map body — smart segments + saved views.
 * The FilterRefinementBar + Sync live in UnshippedSidebar chrome (top of rail).
 */

import { useMemo, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AlertTriangle, Inbox, User, Clock, Check, Zap } from '@/components/Icons';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  FULFILLMENT_STATE_META,
  fulfillmentCountsFromCombos,
  type FulfillmentState,
} from '@/lib/unshipped-state';
import { cn } from '@/utils/_cn';
import {
  useOutboundSidebarScope,
  type UnshippedSegmentId,
} from '@/components/unshipped/useOutboundSidebarScope';
import { OutboundSavedViewsList } from '@/components/unshipped/OutboundSavedViewsList';

const EYEBROW = 'text-role-eyebrow uppercase tracking-widest text-text-soft';

const ROW =
  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors';
const ROW_IDLE = 'hover:bg-surface-hover text-text-muted';
const ROW_ACTIVE = 'bg-blue-50 ring-1 ring-inset ring-blue-400 text-text-default';

type SegmentRow = {
  id: UnshippedSegmentId;
  label: string;
  count: number | null;
  icon: ComponentType<{ className?: string }>;
  toneClass?: string;
  disabled?: boolean;
  tooltip?: string;
};

function UnshippedSegments() {
  const { myStaffId, staffId, activeUnshippedSegment, selectUnshippedSegment } =
    useOutboundSidebarScope();

  const scopedStaff = staffId ?? undefined;
  const { data: scopedCounts } = useQuery(unshippedQueueCountsQuery({ staffId: scopedStaff }));
  const { data: myCounts } = useQuery({
    ...unshippedQueueCountsQuery({ staffId: myStaffId ?? undefined }),
    enabled: myStaffId != null,
  });

  const lanes = useMemo(
    () => fulfillmentCountsFromCombos(scopedCounts?.combos ?? []),
    [scopedCounts],
  );

  const rows: SegmentRow[] = useMemo(() => {
    const total = scopedCounts?.total ?? null;
    const list: SegmentRow[] = [
      { id: 'all', label: 'All open', count: total, icon: Inbox },
      {
        id: 'mine',
        label: 'My queue',
        count: myStaffId != null ? (myCounts?.total ?? null) : null,
        icon: User,
        disabled: myStaffId == null,
        tooltip: myStaffId == null ? 'Sign in as staff to scope your queue' : undefined,
      },
      {
        // Wire id/param stays `attention`; the filter now means "urgent only"
        // (orders.is_urgent). Count comes from the queue-counts `urgent` tally.
        id: 'attention',
        label: 'Urgent',
        count: scopedCounts?.urgent ?? null,
        icon: Zap,
        toneClass: (scopedCounts?.urgent ?? 0) > 0 ? 'text-amber-700' : undefined,
        tooltip: 'Operator-flagged urgent / expedited orders',
      },
    ];
    const laneIcon: Record<FulfillmentState, ComponentType<{ className?: string }>> = {
      BLOCKED: AlertTriangle,
      PENDING: Clock,
      TESTED: Check,
    };
    (['BLOCKED', 'PENDING', 'TESTED'] as FulfillmentState[]).forEach((lane) => {
      list.push({
        id: lane,
        label: FULFILLMENT_STATE_META[lane].label,
        count: lanes[lane],
        icon: laneIcon[lane],
        toneClass: lane === 'BLOCKED' && lanes[lane] > 0 ? 'text-amber-700' : undefined,
      });
    });
    return list;
  }, [scopedCounts, myCounts, myStaffId, lanes]);

  return (
    <section className="space-y-1.5" aria-label="Queue segments">
      <p className={EYEBROW}>Focus</p>
      <ul className="space-y-0.5">
        {rows.map((row) => {
          const isActive = activeUnshippedSegment === row.id;
          const Icon = row.icon;
          const button = (
            <button
              type="button"
              disabled={row.disabled}
              onClick={() => selectUnshippedSegment(row.id)}
              className={cn(
                ROW,
                isActive ? ROW_ACTIVE : ROW_IDLE,
                row.disabled && 'cursor-not-allowed opacity-50',
                row.toneClass,
              )}
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-blue-600' : 'text-text-faint')} />
              <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">{row.label}</span>
              {row.count != null ? (
                <span
                  className={cn(
                    'tabular-nums text-role-caption font-semibold',
                    isActive ? 'text-blue-700' : 'text-text-faint',
                  )}
                >
                  {row.count.toLocaleString()}
                </span>
              ) : null}
            </button>
          );
          return (
            <li key={row.id}>
              {row.tooltip ? (
                <HoverTooltip label={row.tooltip} asChild>
                  {button}
                </HoverTooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShippedSegments() {
  const { shipped, setStaff, myStaffId, staffId } = useOutboundSidebarScope();
  const exceptionsOnly = shipped.state.exceptionsOnly;
  const { toggleExceptions } = shipped.actions;
  const mineActive = myStaffId != null && staffId === myStaffId;

  return (
    <section className="space-y-1.5" aria-label="Shipped focus">
      <p className={EYEBROW}>Focus</p>
      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            onClick={toggleExceptions}
            className={cn(ROW, exceptionsOnly ? ROW_ACTIVE : ROW_IDLE)}
          >
            <AlertTriangle
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                exceptionsOnly ? 'text-blue-600' : 'text-amber-500',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">Needs attention</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={myStaffId == null}
            onClick={() => setStaff(mineActive ? null : myStaffId)}
            className={cn(
              ROW,
              mineActive ? ROW_ACTIVE : ROW_IDLE,
              myStaffId == null && 'cursor-not-allowed opacity-50',
            )}
          >
            <User className={cn('h-3.5 w-3.5 shrink-0', mineActive ? 'text-blue-600' : 'text-text-faint')} />
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">My queue</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function PackedSegments() {
  const { setStaff, myStaffId, staffId } = useOutboundSidebarScope();
  const mineActive = myStaffId != null && staffId === myStaffId;

  return (
    <section className="space-y-1.5" aria-label="Packed focus">
      <p className={EYEBROW}>Focus</p>
      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            disabled={myStaffId == null}
            onClick={() => setStaff(mineActive ? null : myStaffId)}
            className={cn(
              ROW,
              mineActive ? ROW_ACTIVE : ROW_IDLE,
              myStaffId == null && 'cursor-not-allowed opacity-50',
            )}
          >
            <User className={cn('h-3.5 w-3.5 shrink-0', mineActive ? 'text-blue-600' : 'text-text-faint')} />
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">My queue</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

/** Scroll body for the Outbound rail (segments + saved views). */
export function OutboundSidebarFilterMap() {
  const { mode } = useOutboundSidebarScope();
  const isPrePack = mode === 'unshipped' || mode === 'tested';

  return (
    <div className="space-y-4">
      {isPrePack ? (
        <UnshippedSegments />
      ) : mode === 'packed' ? (
        <PackedSegments />
      ) : (
        <ShippedSegments />
      )}
      <OutboundSavedViewsList mode={isPrePack ? 'unshipped' : mode} />
    </div>
  );
}
