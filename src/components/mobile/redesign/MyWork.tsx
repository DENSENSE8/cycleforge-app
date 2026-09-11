'use client';

/**
 * Mobile "My work" queue — `/m/work`.
 *
 * The staff member's own assigned station work orders (TEST/PACK/REPAIR/QA/
 * STOCK_REPLENISH), urgency-banded per R-FLOW-3: deadline bands (Overdue ·
 * Must ship today · Upcoming · No deadline) with priority breaking ties only
 * INSIDE a band — must-ship-today is never below the fold. FOLLOW_UP tasks are
 * deliberately absent (they are delivered via the desktop inbox; see
 * useNextWorkOrder's ruling).
 *
 * Data: `GET /api/work-orders/mine?list=1` (the goal chip's route, in list
 * mode) via react-query, invalidated by the same Ably assignment events the
 * chip listens to. Rows mirror PendingOrderRow's chrome (CaptureStackRow +
 * RowTitle + RowMetaColumns + last-8 OrderIdChip, law Q4) so every mobile
 * feed reads as one surface. Header lives in the shell.
 *
 * Tap: ORDER rows deep-link into the pick JobFace (`/m/id/pick/{entityId}`);
 * Start pick continues to `/m/pick/{entityId}`. Other entity types follow
 * their desktop sourcePath.
 */

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ClipboardList } from '@/components/Icons';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { CaptureStackRow } from '@/design-system/components/capture-stack';
import { GridDegradedBox } from '@/design-system/components/grid';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { RowTitle, RowMetaColumns, META_COL, RowConditionMeta } from '@/components/ui/RowMetaColumns';
import { getDaysLateNullable, getDaysLateTone } from '@/utils/date';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { bandWorkOrderRows } from '@/lib/work-orders/deadline-bands';
import type { WorkOrderRow } from '@/components/work-orders/types';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';

async function fetchMyWork(): Promise<{ rows: WorkOrderRow[] }> {
  const res = await fetch('/api/work-orders/mine?list=1', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`work-orders/mine ${res.status}`);
  return res.json();
}

/** Status dot bg by days late — same progressive SLA scale as PendingOrderRow. */
function dotTone(daysLate: number | null): string {
  if (daysLate === null) return 'bg-surface-strong';
  if (daysLate >= 8) return 'bg-rose-500';
  if (daysLate >= 3) return 'bg-amber-500';
  if (daysLate >= 1) return 'bg-amber-400';
  return 'bg-surface-strong';
}

function MyWorkRow({ row, onTap }: { row: WorkOrderRow; onTap: () => void }) {
  const daysLate = getDaysLateNullable(row.deadlineAt);
  const quantity = parseInt(String(row.quantity || '1'), 10) || 1;
  const orderId = (row.orderId || '').trim();

  return (
    <CaptureStackRow
      variant="collapsed"
      onTap={onTap}
      dataAttr={{ name: 'work-order-id', value: row.id }}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <RowTitle
            dot={dotTone(daysLate)}
            dotTrack={META_COL.dotTrackWide}
            title={row.title || 'Untitled work order'}
          />
        </div>
        {/* Queue label stands in for work type — WorkOrderRow has no work_type field. */}
        <span className="shrink-0 text-role-eyebrow uppercase text-text-faint">{row.queueLabel}</span>
      </div>

      <div className="pointer-events-auto mt-0.5 flex items-center gap-2">
        <RowMetaColumns
          className="!mt-0 shrink-0"
          indent={META_COL.indentWide}
          qtyCol={META_COL.qtyColWide}
          qty={<span className={orderRowQtyTone(quantity)}>{quantity}</span>}
          condition={<RowConditionMeta condition={row.condition} />}
          rest={
            daysLate !== null ? (
              <span className={`font-mono tabular-nums ${getDaysLateTone(daysLate)}`}>{daysLate}</span>
            ) : undefined
          }
        />

        <div className="pointer-events-auto ml-auto flex min-w-0 items-center gap-2">
          {orderId && <OrderIdChip value={orderId} display={getLast8(orderId)} />}
        </div>
      </div>
    </CaptureStackRow>
  );
}

export default function RedesignedMobileMyWork() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const staffId = user?.staffId ?? null;
  const orgId = user?.organizationId ?? '';
  const queryClient = useQueryClient();

  // ── Auth bounce — there is no middleware on /m/*; an unauthenticated visitor
  // must land on signin with a way back here (mirrors useMobilePicker).
  useEffect(() => {
    if (isLoaded && !user) {
      router.replace('/signin?next=/m/work');
    }
  }, [isLoaded, user, router]);

  const queryKey = useMemo(() => ['work-orders', 'mine', 'list', staffId] as const, [staffId]);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: fetchMyWork,
    enabled: !!staffId,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  // Reassignments arrive on the same Ably events the goal chip listens to, so
  // this list and the chip move together without polling.
  const ordersChannel = safeChannelName(() => getOrdersChannelName(orgId));
  const invalidate = () => void queryClient.invalidateQueries({ queryKey });
  useAblyChannel(ordersChannel, 'order.assignments', invalidate, !!ordersChannel && !!staffId);
  useAblyChannel(ordersChannel, 'queue.assignments', invalidate, !!ordersChannel && !!staffId);

  const groups = useMemo(() => bandWorkOrderRows(data?.rows ?? []), [data?.rows]);

  const openRow = (row: WorkOrderRow) => {
    if (row.entityType === 'ORDER') {
      // The mobile picker route takes the numeric orders row id (it fetches
      // /api/orders/{id}/pick-tasks) — entityId IS that id for ORDER rows.
      router.push(`/m/id/pick/${row.entityId}`);
      return;
    }
    router.push(row.sourcePath);
  };

  if (!isLoaded || !user) return null;

  // Fourth settled state: failed fetch + nothing to show → Retry, never "empty".
  if (isError && groups.length === 0) {
    return (
      <div className={`flex h-full flex-col items-center justify-center ${TOKENS.colors.background}`}>
        <GridDegradedBox
          message="Couldn't load your work orders."
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  if (isPending && groups.length === 0) {
    return (
      <div className={`flex h-full flex-col items-center justify-center ${TOKENS.colors.background} text-role-caption font-semibold uppercase tracking-widest text-text-faint`}>
        Loading…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-2 px-6 text-center ${TOKENS.colors.background}`}>
        <ClipboardList className="mb-1 h-10 w-10 text-text-faint" />
        <p className="text-xs font-semibold uppercase tracking-widest text-text-faint">
          Nothing assigned to you
        </p>
        <p className="max-w-[260px] text-xs font-medium text-text-muted">
          No work orders are assigned to you right now.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${TOKENS.colors.background}`}>
      <div className="min-h-0 w-full max-w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none pb-3">
        {groups.map((group) => (
          <section key={group.band} aria-label={group.label}>
            <div className="flex items-baseline gap-1.5 border-b border-border-hairline px-3 pb-1 pt-3.5">
              <span className="text-role-eyebrow uppercase text-text-muted">{group.label}</span>
              <span className="font-mono text-role-eyebrow tabular-nums text-text-faint">
                {group.rows.length}
              </span>
            </div>
            {group.rows.map((row) => (
              <MyWorkRow key={row.id} row={row} onTap={() => openRow(row)} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
