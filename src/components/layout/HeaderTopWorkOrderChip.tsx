'use client';

import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { Popover } from '@/design-system/primitives/Popover';
import { Button, IconButton } from '@/design-system/primitives';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import { formatDate } from '@/components/work-orders/types';
import { getDaysLateNullable } from '@/utils/date';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { isOnWorkOrderSourcePath } from './header-work-order-shared';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_GLYPH,
  HEADER_ICON_WRAP,
} from './header-shell';

/**
 * Header work-order — neutral ClipboardList IconButton (no urgency chrome).
 * Opens the top assigned WO; queue / due / title live in tooltip + popover.
 * Hidden when already on the work order's source path.
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

function dueFace(deadlineAt: string | null): { label: string; overdue: boolean } {
  if (!deadlineAt) return { label: 'No deadline', overdue: false };
  const daysLate = getDaysLateNullable(deadlineAt);
  if (daysLate !== null && daysLate > 0) {
    return {
      label: daysLate === 1 ? '1d late' : `${daysLate}d late`,
      overdue: true,
    };
  }
  return {
    label: `Due ${formatDate(deadlineAt, '—')}`,
    overdue: false,
  };
}

export function HeaderTopWorkOrderChip() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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

  const ordersChannel = safeChannelName(() => getOrdersChannelName(orgId));
  const invalidate = () => void queryClient.invalidateQueries({ queryKey });
  useAblyChannel(ordersChannel, 'order.assignments', invalidate, !!ordersChannel && !!staffId);
  useAblyChannel(ordersChannel, 'queue.assignments', invalidate, !!ordersChannel && !!staffId);

  const top = data?.top ?? null;
  if (!staffId || !top) return null;
  if (isOnWorkOrderSourcePath(pathname, top.sourcePath)) return null;

  const due = dueFace(top.deadlineAt);
  const deadlineLabel = top.deadlineAt ? formatDate(top.deadlineAt, 'No deadline') : null;
  const tip = `${top.queueLabel} · ${due.label} · ${top.title}`;

  return (
    <div className={cn(HEADER_ICON_WRAP, 'hidden sm:flex')}>
      <HoverTooltip label={tip} asChild>
        <IconButton
          ref={triggerRef}
          size="md"
          ariaLabel={`Work orders — ${tip}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<ClipboardList className={HEADER_ICON_GLYPH} />}
        />
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
                due.overdue ? 'bg-rose-50 text-rose-700' : 'bg-surface-sunken text-text-muted',
              )}
            >
              {due.overdue ? due.label : `Due ${deadlineLabel}`}
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
