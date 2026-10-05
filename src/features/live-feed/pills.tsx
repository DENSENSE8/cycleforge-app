'use client';

/** The Live feed's small labels: a package's tags and its ship-by pressure, one pill shape for both. */

import type { ReactNode } from 'react';
import { packageTagTone, type PackageTagTone } from '@/lib/live-feed/tags';
import type { PackageCard } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';
import { formatLaneAgeCompact } from '@/utils/date';

const TONE: Readonly<Record<PackageTagTone, string>> = {
  danger: 'bg-rose-50 text-rose-700 ring-rose-200/80',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200/80',
  info: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  neutral: 'bg-slate-50 text-slate-700 ring-slate-200/80',
};

export function Pill({ tone, children, className }: { tone: PackageTagTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 truncate rounded-full px-2 text-xs font-medium ring-1 ring-inset',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TagPill({ tag, children }: { tag: string; children?: ReactNode }) {
  return (
    <Pill tone={packageTagTone(tag)}>
      <span className="truncate">{tag}</span>
      {children}
    </Pill>
  );
}

/** The ship-by SLA: `Late 3d` · `Due today` — nothing for a package on time. `now` null (first paint) drops the age. */
export function ShipByPill({ card, now }: { card: PackageCard; now: number | null }) {
  if (card.urgency === 'due_today') return <Pill tone="warning">Due today</Pill>;
  if (card.urgency !== 'late') return null;
  const lateBy = now != null ? formatLaneAgeCompact(card.shipBy, now) : null;
  return <Pill tone="danger">Late{lateBy ? ` ${lateBy}` : ''}</Pill>;
}

/** The SLA and the stock pressure (Allocate's Blocked) together — the package panel's headline row. */
export function PressurePills({ card, now }: { card: PackageCard; now: number | null }) {
  return (
    <>
      <ShipByPill card={card} now={now} />
      {card.blocked ? <Pill tone="danger">Out of stock</Pill> : null}
    </>
  );
}
