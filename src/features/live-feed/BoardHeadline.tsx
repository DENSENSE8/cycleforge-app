'use client';

/**
 * The board's first level of disclosure: in the building, late, stalled and
 * scanned out today (each figure only when it says something), and the "Live"
 * pulse that shows the board is current.
 */

import type { PackageColumn } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';

export function Headline({ columns, compact = false }: { columns: readonly PackageColumn[]; compact?: boolean }) {
  const inBuilding = columns.filter((column) => column.stage !== 'scanned_out').reduce((sum, column) => sum + column.count, 0);
  const late = columns.reduce((sum, column) => sum + column.lateCount, 0);
  const stalled = columns.reduce((sum, column) => sum + column.stalledCount, 0);
  const out = columns.find((column) => column.stage === 'scanned_out')?.count ?? 0;
  const figures = [
    { id: 'building', label: 'In the building', value: inBuilding, tone: 'text-slate-900', labelTone: 'text-slate-500', show: true },
    { id: 'late', label: 'Late', value: late, tone: 'text-rose-600', labelTone: 'text-rose-600', show: late > 0 },
    { id: 'stalled', label: 'Stalled', value: stalled, tone: 'text-amber-600', labelTone: 'text-amber-700', show: stalled > 0 },
    { id: 'out', label: compact ? 'Out today' : 'Scanned out · Today', value: out, tone: 'text-emerald-600', labelTone: 'text-slate-500', show: true },
  ];
  return (
    <div className={cn('flex items-end', compact ? 'gap-4' : 'gap-6')} data-testid="live-feed-headline">
      {figures
        .filter((figure) => figure.show)
        .map((figure) => (
          <div key={figure.id} data-figure={figure.id}>
            <p className={cn('whitespace-nowrap font-medium uppercase tracking-wider', compact ? 'text-role-micro' : 'text-xs', figure.labelTone)}>
              {figure.label}
            </p>
            <p className={cn('font-semibold tabular-nums tracking-tight', compact ? 'text-2xl' : 'text-3xl', figure.tone)}>{figure.value}</p>
          </div>
        ))}
    </div>
  );
}

export function LiveDot({ updatedAt, now, fetching, compact = false }: { updatedAt: number; now: number | null; fetching: boolean; compact?: boolean }) {
  const seconds = now != null && updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500" aria-live="polite">
      <span className="relative flex size-2">
        {/* `now` is null through hydration: the server never fetches, so the pulse waits for the mount. */}
        <span className={cn('absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75', fetching && now != null && 'animate-ping')} />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {/* A phone header has room for the dot only; the word stays for screen readers. */}
      <span className={compact ? 'sr-only' : undefined}>Live</span>
      {!compact && seconds != null ? ` · ${seconds < 60 ? 'just now' : `${Math.floor(seconds / 60)}m ago`}` : ''}
    </span>
  );
}
