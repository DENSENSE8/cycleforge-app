'use client';

/**
 * Reports → Packing — every packer's day, on a phone.
 *
 * THE MOBILE SoT for the packer read (SURFACE_LAW §1). Operator 2026-09-15:
 * *"I should be able to see exactly the performance of the packers per day so I
 * can pack more or less per day"*. The desk twin already exists at
 * `/operations?mode=analytics` and reads the SAME endpoint through the SAME
 * hook (`usePackingKpi`), so the two faces cannot disagree about a shift.
 *
 * Surface class B (phone browse — the roster IS the product), so banded CARDS,
 * never a `DataTable` (SURFACE_LAW §5), and no primary CTA: this surface
 * commits nothing.
 *
 * WHAT THE NUMBERS ARE, stated on the surface rather than implied:
 * `weighted_minutes` is `count × the SKU's standard time`, not observed
 * handling time — no pack START event exists yet, so every pack carries exactly
 * one timestamp (`station_activity_logs`, `PACK_COMPLETED`). That makes this a
 * STANDARD-MINUTES report: honest about load and mix, silent about pace. The
 * footer says so in words, because a manager reading "312 min" would otherwise
 * reasonably assume a stopwatch produced it.
 *
 * Boundary: platform layer + `src/lib` only — `features/operations/workspace`
 * is a feature dir `/m` may not import, which is why the hook lives in
 * `src/lib/packing/use-packing-kpi.ts`.
 */

import { useState } from 'react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { MobilePackerItemsSheet } from '@/components/mobile/reports/MobilePackerItemsSheet';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { usePackingKpi } from '@/lib/packing/use-packing-kpi';
import { formatPackMinutes } from '@/lib/packing/pack-standard-stops';
import { cn } from '@/utils/_cn';

const FACT = 'text-role-micro text-text-muted';

/** One packer's day — who, how many boxes, how much standard time that is. */
function PackerCard({
  staffId,
  name,
  boxes,
  minutes,
  small,
  medium,
  large,
  shareOfDay,
  onOpen,
}: {
  staffId: number;
  name: string;
  boxes: number;
  minutes: number;
  small: number;
  medium: number;
  large: number;
  /** This packer's share of the day's standard minutes, 0–1, or null when idle. */
  shareOfDay: number | null;
  onOpen: () => void;
}) {
  return (
    <li>
      {/* ds-raw-button: the row IS the card — a full-bleed tappable record
          row, not an action button (the house Button would paint a CTA face
          here). Same anatomy as the Checklist tab's RosterCard. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${name}, ${boxes} packed, ${formatPackMinutes(minutes)} standard`}
        className={cn(
          'ds-raw-button flex min-h-14 w-full items-center gap-3 border border-border-hairline bg-surface-card px-3 py-2.5 text-left',
          MOBILE_ROW_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        <StaffAvatar staffId={staffId} name={name} size="sm" alt="" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-role-caption font-medium leading-tight text-text-default">
            {name}
          </span>
          <span className={cn('block truncate', FACT)}>
            {small} small · {medium} medium · {large} large
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm font-semibold tabular-nums text-text-default">
            {boxes} {boxes === 1 ? 'box' : 'boxes'}
          </span>
          <span className={cn('block tabular-nums', FACT)}>
            {formatPackMinutes(minutes)}
            {shareOfDay != null ? ` · ${Math.round(shareOfDay * 100)}%` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

export function MobilePackerDayReport({ dateKey }: { dateKey: string }) {
  const { data, isLoading, isError } = usePackingKpi(dateKey);
  const packing = data?.ok ? data : null;
  /** The packer whose packs the drill-down sheet is showing. */
  const [openPacker, setOpenPacker] = useState<{ staffId: number; name: string } | null>(null);

  const totals = packing?.totals;
  const dayBoxes = totals ? totals.small_count + totals.medium_count + totals.large_count : 0;
  const dayMinutes = totals?.weighted_minutes ?? 0;
  const capacity = packing?.capacity.daily_capacity_minutes ?? 0;
  const rows = packing?.by_packer ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        {/* The day, before the people: "did we pack enough?" is the first
            question, and it is answered by one line, not by adding up cards. */}
        {packing ? (
          <div
            className={cn(
              'mb-3 border border-border-hairline bg-surface-card px-3 py-2.5',
              MOBILE_ROW_CORNER,
            )}
          >
            <p className="font-mono text-lg font-semibold tabular-nums text-text-default">
              {dayBoxes} {dayBoxes === 1 ? 'box' : 'boxes'}
            </p>
            <p className={cn(FACT, 'tabular-nums')}>
              {formatPackMinutes(dayMinutes)} of {formatPackMinutes(capacity)} capacity
              {capacity > 0 ? ` · ${Math.round((dayMinutes / capacity) * 100)}%` : ''}
            </p>
            <p className={FACT}>
              {packing.capacity.packer_headcount} packers ·{' '}
              {formatPackMinutes(totals?.remaining_minutes ?? 0)} left
            </p>
          </div>
        ) : null}

        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const boxes = r.small_count + r.medium_count + r.large_count;
            return (
              <PackerCard
                key={r.staff_id}
                staffId={r.staff_id}
                name={r.staff_name || `Staff #${r.staff_id}`}
                boxes={boxes}
                minutes={r.weighted_minutes}
                small={r.small_count}
                medium={r.medium_count}
                large={r.large_count}
                shareOfDay={dayMinutes > 0 ? r.weighted_minutes / dayMinutes : null}
                onOpen={() =>
                  setOpenPacker({
                    staffId: r.staff_id,
                    name: r.staff_name || `Staff #${r.staff_id}`,
                  })
                }
              />
            );
          })}
        </ul>

        {isLoading ? (
          <p className="pt-6 text-role-caption text-text-muted">Loading the day…</p>
        ) : null}
        {isError || (!isLoading && !packing) ? (
          <p role="alert" className="pt-6 text-role-caption text-text-muted">
            Could not load that day.
          </p>
        ) : null}
        {packing && rows.length === 0 ? (
          <p className="pt-6 text-role-caption text-text-muted">Nobody packed that day.</p>
        ) : null}

        {/* Says what the number is. See the file header — this is standard
            time, not a stopwatch, and the surface must not imply otherwise. */}
        {packing && rows.length > 0 ? (
          <p className="pt-4 text-role-micro text-text-faint">
            Tap a packer to see what they packed. Minutes are each SKU&apos;s time to pack × boxes
            packed — the standard, not a measured pace.
          </p>
        ) : null}
      </div>

      <MobilePackerItemsSheet
        dateKey={dateKey}
        packer={openPacker}
        onClose={() => setOpenPacker(null)}
      />
    </div>
  );
}
