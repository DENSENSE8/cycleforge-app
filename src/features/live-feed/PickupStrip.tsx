'use client';

/**
 * Today's carrier pickups as countdowns: "USPS 3:00 PM · in 2h 10m · 12 to
 * pack · 4 at the dock". Tone from `pickupTone` (`lib/live-feed/pace`, the TV
 * wall's too): amber inside the last hour, rose inside the last 30 minutes
 * or once a pickup left with packages still here. Cutoffs come from the
 * carrier pickup settings (`/settings/pickup-cutoffs`); a board with none
 * configured shows nothing. Drawn only after mount (`now`).
 */

import { formatDurationMinutes, pickupTone, type PickupTone } from '@/lib/live-feed/pace';
import type { PickupCountdown } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';
import { formatTime12hPST } from '@/utils/date';

const TONE: Readonly<Record<PickupTone, string>> = {
  calm: 'bg-white text-slate-700 ring-slate-900/10',
  soon: 'bg-amber-50 text-amber-900 ring-amber-200',
  urgent: 'bg-rose-50 text-rose-800 ring-rose-200',
};

export function PickupStrip({ pickups, now }: { pickups: readonly PickupCountdown[]; now: number | null }) {
  if (now == null || pickups.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" data-testid="live-feed-pickups" aria-label="Carrier pickups today">
      {pickups.map((pickup) => {
        const left = Date.parse(pickup.cutoffAt) - now;
        const remaining = pickup.notPacked + pickup.packed;
        const tone = pickupTone(left, remaining);
        return (
          <li
            key={`${pickup.carrier}-${pickup.cutoffAt}`}
            data-pickup={pickup.carrier}
            data-tone={tone}
            className={cn('flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ring-1 ring-inset', TONE[tone])}
          >
            <span className="font-semibold">{pickup.carrier}</span>
            <span className="tabular-nums">{formatTime12hPST(pickup.cutoffAt)}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="font-semibold tabular-nums">{left <= 0 ? 'Missed' : `in ${formatDurationMinutes(left / 60_000)}`}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="tabular-nums">
              {remaining === 0
                ? 'All out'
                : [pickup.notPacked > 0 ? `${pickup.notPacked} to pack` : null, pickup.packed > 0 ? `${pickup.packed} at the dock` : null]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
