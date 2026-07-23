'use client';

import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { formatDistanceToNowStrict } from 'date-fns';
import type { DashboardData } from '@/features/operations/types';
import { useRepairsTable } from '@/hooks/useRepairs';
import { repairStatusChipClass } from '@/lib/repair-status';

export type KpiKind = 'velocity' | 'tested' | 'fba' | 'repair';

type ActivityRow = DashboardData['activityFeed'][number];

type KpiDetailsModalProps = {
  kind: KpiKind | null;
  value?: number;
  activityFeed?: DashboardData['activityFeed'];
  onClose: () => void;
};

const TITLES: Record<KpiKind, { title: string; subtitle: string; tone: 'amber' | 'emerald' | 'orange'; emptyHint: string }> = {
  velocity: {
    title: 'Daily velocity',
    subtitle: 'Every unit your floor has touched today',
    tone: 'amber',
    emptyHint: 'No scans logged yet today. Activity will appear here as soon as your team starts working.',
  },
  tested: {
    title: 'Tested today',
    subtitle: 'Units cleared through QA at the Tech bench',
    tone: 'emerald',
    emptyHint: 'No items have been tested yet today.',
  },
  fba: {
    title: 'FBA intake',
    subtitle: 'FNSKU units scanned into Amazon shipments',
    tone: 'amber',
    emptyHint: 'No FBA scans logged today yet.',
  },
  repair: {
    title: 'Repair queue',
    subtitle: 'Units currently waiting on the repair bench',
    tone: 'orange',
    emptyHint: 'The repair queue is clear — nothing pending right now.',
  },
};

const TONE_RING: Record<'amber' | 'emerald' | 'orange', string> = {
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
};

const ACTIVITY_LABEL: Record<string, string> = {
  TRACKING_SCANNED: 'Receiving scan',
  FNSKU_SCANNED: 'FBA scan',
  PACK_SCAN: 'Pack scan',
  PACK_COMPLETED: 'Packed',
  FBA_READY: 'FBA ready',
};

const ACTIVITY_DOT: Record<string, string> = {
  TRACKING_SCANNED: 'bg-blue-500',
  FNSKU_SCANNED: 'bg-amber-500',
  PACK_SCAN: 'bg-purple-500',
  PACK_COMPLETED: 'bg-emerald-500',
  FBA_READY: 'bg-emerald-600',
};


function relativeTime(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

function filterFeed(kind: KpiKind, feed: ActivityRow[] | undefined): ActivityRow[] {
  if (!feed) return [];
  if (kind === 'velocity') {
    return feed.filter((r) =>
      ['TRACKING_SCANNED', 'FNSKU_SCANNED', 'PACK_SCAN', 'PACK_COMPLETED', 'FBA_READY'].includes(r.type),
    );
  }
  if (kind === 'tested') {
    return feed.filter((r) => r.source === 'TECH' && ['TRACKING_SCANNED', 'FNSKU_SCANNED'].includes(r.type));
  }
  if (kind === 'fba') {
    return feed.filter((r) => r.type === 'FNSKU_SCANNED');
  }
  return [];
}

function ActivityList({ rows, emptyHint }: { rows: ActivityRow[]; emptyHint: string }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-role-caption font-medium text-text-muted">
        {emptyHint}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-soft">
      {rows.map((row) => {
        const label = ACTIVITY_LABEL[row.type] ?? row.type.replace(/_/g, ' ').toLowerCase();
        const dot = ACTIVITY_DOT[row.type] ?? 'bg-[#C4BAA8]';
        return (
          <li key={row.id} className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-role-caption font-bold uppercase tracking-wide text-text-default">{label}</span>
                {row.source ? (
                  <span className="rounded-full bg-surface-card inset-chip text-role-eyebrow font-bold uppercase tracking-wider text-text-muted">
                    {row.source}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-role-caption font-medium text-text-default">{row.summary || '—'}</p>
              <div className="mt-0.5 flex items-center gap-2 text-role-micro font-semibold text-text-muted">
                {row.actor_name ? <span>{row.actor_name}</span> : null}
                {row.actor_name ? <span>·</span> : null}
                <span className="tabular-nums">{relativeTime(row.timestamp)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RepairList({ emptyHint }: { emptyHint: string }) {
  const { data: repairs = [], isLoading } = useRepairsTable(null, 'active');

  const sorted = useMemo(() => {
    return [...repairs].sort((a, b) => {
      const at = new Date(a.updated_at || a.created_at).getTime();
      const bt = new Date(b.updated_at || b.created_at).getTime();
      return at - bt;
    });
  }, [repairs]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-role-caption font-semibold text-text-muted">
        Loading repair queue…
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-role-caption font-medium text-text-muted">
        {emptyHint}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-soft">
      {sorted.map((r) => {
        const statusTone = repairStatusChipClass(r.status);
        const customer = r.customer_name || r.contact_info || 'Unknown customer';
        const age = relativeTime(r.created_at);
        return (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-surface-card px-2 py-0.5 font-mono text-role-micro font-bold text-text-default">
                  #{r.ticket_number}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-role-eyebrow font-bold uppercase tracking-wider ${statusTone}`}>
                  {r.status}
                </span>
              </div>
              <p className="mt-1 truncate text-role-caption font-semibold text-text-default">{customer}</p>
              <p className="mt-0.5 truncate text-role-caption font-medium text-text-muted">{r.product_title || r.issue || '—'}</p>
            </div>
            <span className="shrink-0 whitespace-nowrap pt-1 text-role-micro font-semibold tabular-nums text-text-muted">
              {age}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function KpiDetailsModal({ kind, value, activityFeed, onClose }: KpiDetailsModalProps) {
  const meta = kind ? TITLES[kind] : null;
  const filtered = kind && kind !== 'repair' ? filterFeed(kind, activityFeed) : [];

  return (
    <Dialog
      open={Boolean(kind)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[min(600px,88vh)] max-w-[520px] flex-col gap-0 overflow-hidden p-0 sm:rounded-3xl"
      >
        {meta ? (
          <>
            <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-5 pb-3 pt-5 pr-12">
              <div className="min-w-0">
                <DialogTitle className="text-role-title font-extrabold leading-tight text-text-default">
                  {meta.title}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-role-caption font-medium leading-snug text-text-muted">
                  {meta.subtitle}
                </DialogDescription>
              </div>
              {typeof value === 'number' ? (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-role-caption font-extrabold tabular-nums ${TONE_RING[meta.tone]}`}>
                  {value.toLocaleString()}
                </span>
              ) : null}
            </DialogHeader>

            <div className="border-t border-border-soft" />

            <div className="min-h-0 flex-1 overflow-y-auto">
              {kind === 'repair' ? (
                <RepairList emptyHint={meta.emptyHint} />
              ) : (
                <ActivityList rows={filtered} emptyHint={meta.emptyHint} />
              )}
            </div>

            <div className="border-t border-border-soft px-5 py-2.5 text-center text-role-micro font-semibold uppercase tracking-wider text-text-muted">
              {kind === 'repair'
                ? 'Live queue · updates as tickets close'
                : 'Most recent activity · refreshes every minute'}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
