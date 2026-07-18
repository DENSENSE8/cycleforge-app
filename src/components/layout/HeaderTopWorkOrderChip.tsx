'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, ClipboardList } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { Popover } from '@/design-system/primitives/Popover';
import { Button } from '@/design-system/primitives';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import { formatDate } from '@/components/work-orders/types';
import { getDaysLateNullable, getDaysLateTone } from '@/utils/date';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

/**
 * HeaderTopWorkOrderChip — P1-WORK-01 acceptance B.
 *
 * Surfaces the single most important work order for the SIGNED-IN operator in
 * the global header. Data + ranking come from /api/work-orders/mine, which
 * reuses the work-orders queue's data source and the shared ranking SoT
 * (compareWorkOrderRows) — so this chip never diverges from the queue order.
 *
 * Visual dialect matches {@link HeaderGoalChip}: quiet hover shell, two-line
 * stack (state on top, entity below), chevron. Color only for overdue tone.
 *
 * Renders nothing when the operator has no actionable assigned work.
 */

interface TopWorkOrder {
  id: string;
  entityType: string;
  entityId: number;
  queueLabel: string;
  title: string;
  subtitle: string;
  recordLabel: string;
  sourcePath: string;
  status: string;
  priority: number;
  deadlineAt: string | null;
  role: 'tester' | 'packer';
}

async function fetchMine(): Promise<{ top: TopWorkOrder | null }> {
  const res = await fetch('/api/work-orders/mine', { cache: 'no-store', credentials: 'include' });
  if (!res.ok) return { top: null };
  return res.json();
}

/** Compact due face — overdue first, else short date, else calm empty. */
function dueFace(deadlineAt: string | null): { label: string; tone: string } {
  if (!deadlineAt) return { label: 'No deadline', tone: 'text-text-soft' };
  const daysLate = getDaysLateNullable(deadlineAt);
  if (daysLate !== null && daysLate > 0) {
    return {
      label: daysLate === 1 ? '1d late' : `${daysLate}d late`,
      tone: getDaysLateTone(daysLate),
    };
  }
  return {
    label: `Due ${formatDate(deadlineAt, '—')}`,
    tone: 'text-text-soft',
  };
}

export function HeaderTopWorkOrderChip() {
  const { user } = useAuth();
  const router = useRouter();
  const staffId = user?.staffId ?? null;
  const orgId = user?.organizationId ?? '';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const queryKey = useMemo(() => ['work-orders', 'mine', staffId] as const, [staffId]);

  const { data } = useQuery({
    queryKey,
    queryFn: fetchMine,
    enabled: !!staffId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Live-refresh when assignments change (assignment popover / queue PATCH
  // publish to the org-wide orders channel).
  const ordersChannel = safeChannelName(() => getOrdersChannelName(orgId));
  const invalidate = () => void queryClient.invalidateQueries({ queryKey });
  useAblyChannel(ordersChannel, 'order.assignments', invalidate, !!ordersChannel && !!staffId);
  useAblyChannel(ordersChannel, 'queue.assignments', invalidate, !!ordersChannel && !!staffId);

  const top = data?.top ?? null;
  if (!staffId || !top) return null;

  const due = dueFace(top.deadlineAt);
  const deadlineLabel = top.deadlineAt ? formatDate(top.deadlineAt, 'No deadline') : null;
  const daysLate = getDaysLateNullable(top.deadlineAt);

  return (
    <div className="relative hidden shrink-0 sm:block">
      <HoverTooltip label="Your top work order" asChild>
        <motion.button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          whileTap={{ scale: 0.97 }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Your top work order — ${top.queueLabel}: ${top.title}`}
          className={cn(
            'flex max-w-[240px] items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 transition-colors',
            open ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
          )}
        >
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
            <ClipboardList className="h-3.5 w-3.5" />
          </span>
          <span className="flex min-w-0 flex-col items-start leading-none">
            <span className="w-full truncate text-role-caption font-bold tracking-tight text-text-default">
              {top.queueLabel}
            </span>
            <span className="mt-0.5 flex max-w-full items-baseline gap-1 text-role-eyebrow font-semibold">
              <span className={cn('shrink-0 tabular-nums', due.tone)}>{due.label}</span>
              <span aria-hidden className="shrink-0 text-text-faint">
                ·
              </span>
              <span className="min-w-0 truncate text-text-soft">{top.title}</span>
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-text-faint transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </motion.button>
      </HoverTooltip>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-start"
        padded={false}
        role="dialog"
        aria-label="Your top work order"
        className="w-[300px]"
      >
        <div className="border-b border-border-hairline px-3.5 py-3">
          <p className="text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
            Your next work order
          </p>
          <p className="mt-1 text-role-body font-bold leading-tight tracking-tight text-text-default">
            {top.title}
          </p>
          {top.subtitle ? (
            <p className="mt-0.5 truncate text-role-caption text-text-soft">{top.subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5">
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-role-eyebrow uppercase tracking-wider text-text-muted">
            {top.queueLabel}
          </span>
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-role-eyebrow uppercase tracking-wider text-text-muted">
            {top.role}
          </span>
          {deadlineLabel ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-role-eyebrow font-bold uppercase tracking-wider',
                daysLate !== null && daysLate > 0
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-surface-sunken text-text-muted',
              )}
            >
              {daysLate !== null && daysLate > 0 ? due.label : `Due ${deadlineLabel}`}
            </span>
          ) : null}
        </div>
        <div className="border-t border-border-hairline px-3.5 py-2.5">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              router.push(top.sourcePath);
            }}
          >
            Open {top.recordLabel}
          </Button>
        </div>
      </Popover>
    </div>
  );
}
