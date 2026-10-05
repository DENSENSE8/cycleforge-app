'use client';

/**
 * The dock's pace today: packages scanned out per hour so far, how long the
 * building takes to clear at that pace, and an hourly bar chart of today over
 * yesterday (the ghost bars). The arithmetic is `lib/live-feed/pace` — the TV
 * wall's panel reads the same. Drawn only after mount (`now`), so the
 * server's HTML never carries a clock.
 */

import { formatDurationMinutes, pacePerHour, warehouseClockHours, yesterdayByNow } from '@/lib/live-feed/pace';
import type { PackageBoard } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';

/** `14` → `2 PM`. */
const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;

export function PaceStrip({ pace, inBuilding, now }: { pace: PackageBoard['pace']; inBuilding: number; now: number | null }) {
  if (now == null) return null;
  const clock = warehouseClockHours(now);
  const currentHour = Math.floor(clock);
  const { today, yesterday } = pace;
  const doneToday = today.reduce((sum, n) => sum + n, 0);
  const yesterdaySoFar = yesterdayByNow(yesterday, clock);
  const rate = pacePerHour(today, clock);

  // The working day, widened to any hour with scan-outs today or yesterday.
  const busy = [currentHour, ...today.flatMap((n, h) => (n > 0 ? [h] : [])), ...yesterday.flatMap((n, h) => (n > 0 ? [h] : []))];
  const from = Math.max(0, Math.min(...busy, 8) - 1);
  const to = Math.min(23, Math.max(...busy, 17) + 1);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const peak = Math.max(1, ...hours.map((hour) => Math.max(today[hour] ?? 0, yesterday[hour] ?? 0)));

  return (
    <div className="flex items-end gap-3" data-testid="live-feed-pace">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Pace</p>
        <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">
          {rate == null ? 'No scan-outs yet' : `${rate < 10 ? rate.toFixed(1) : Math.round(rate)}/hr`}
          {rate != null && inBuilding > 0 ? (
            <span className="font-normal text-slate-500"> · clears in ~{formatDurationMinutes((inBuilding / rate) * 60)}</span>
          ) : null}
        </p>
        <p className="whitespace-nowrap text-xs tabular-nums text-slate-500">Yesterday by now: {yesterdaySoFar}</p>
      </div>
      <div className="flex h-10 items-end gap-px" role="img" aria-label={`Scanned out today: ${doneToday}; yesterday by now: ${yesterdaySoFar}`}>
        {hours.map((hour) => {
          const t = today[hour] ?? 0;
          const y = yesterday[hour] ?? 0;
          return (
            <span key={hour} className="relative flex h-full w-2 items-end" title={`${hourLabel(hour)} · ${t} today · ${y} yesterday`}>
              <span aria-hidden className="absolute inset-x-0 bottom-0 rounded-sm bg-slate-200" style={{ height: `${(y / peak) * 100}%` }} />
              <span
                aria-hidden
                className={cn('relative w-full rounded-sm', hour === currentHour ? 'bg-emerald-400' : 'bg-emerald-600')}
                style={{ height: `${(t / peak) * 100}%` }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
