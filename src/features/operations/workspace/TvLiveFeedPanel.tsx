'use client';

/**
 * The Live feed on the Operations TV wall board: the package floor at a
 * glance from across the room — what is in the building, how much is late or
 * stalled, what left today, each stage of To pick → Picked → Packed → Scanned
 * out (the same glyph and hue as the Live feed and Allocate), the dock's pace
 * and today's carrier pickup countdowns. Nothing here is interactive or
 * hover-only; it reads the wall's own route (`useOperationsTvLiveFeed`).
 */

import { Fragment } from 'react';
import { Panel } from '@/design-system/primitives';
import { SectionCard } from '@/design-system/components/monitor';
import { ArrowRight, Package, Truck } from '@/components/Icons';
import { STAGE_LOOK } from '@/features/live-feed/stage-look';
import { useNow } from '@/features/live-feed/live-feed-hooks';
import { PACKAGE_STAGE_META } from '@/lib/live-feed/stages';
import {
  formatDurationMinutes,
  pacePerHour,
  pickupTone,
  warehouseClockHours,
  yesterdayByNow,
  type PickupTone,
} from '@/lib/live-feed/pace';
import { tvLiveFeedTotals, type TvLiveFeed, type TvLiveFeedPickup, type TvLiveFeedStage } from '@/lib/ops-plans/tv-live-feed';
import { formatTime12hPST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { useOperationsTvLiveFeed } from './useOperationsTvBoard';

const PICKUP_TONE: Record<PickupTone, string> = {
  calm: 'border-border-soft bg-surface-canvas text-text-default',
  soon: 'border-border-warning bg-surface-warning text-text-warning',
  urgent: 'border-border-danger bg-surface-danger text-text-danger',
};

export function TvLiveFeedPanel() {
  const query = useOperationsTvLiveFeed();
  const now = useNow();
  const feed = query.data;

  // The org lacks the wall-board flag; the board itself already says so.
  if (feed === null) return null;

  return (
    <SectionCard stagger icon={Package} eyebrow="Live feed" title="Packages">
      {feed ? (
        <TvLiveFeedBody feed={feed} now={now} />
      ) : (
        <p className="py-6 text-center text-lg font-semibold text-text-faint">
          {query.isError ? 'Couldn’t load packages — retrying…' : 'Loading packages…'}
        </p>
      )}
    </SectionCard>
  );
}

function TvLiveFeedBody({ feed, now }: { feed: TvLiveFeed; now: number | null }) {
  const totals = tvLiveFeedTotals(feed);
  const headline: Array<{ label: string; value: number; tone: string; suffix?: string }> = [
    { label: 'In the building', value: totals.inBuilding, tone: 'text-text-default' },
    { label: 'Late', value: totals.late, tone: totals.late > 0 ? 'text-text-danger' : 'text-text-faint' },
    { label: 'Stalled', value: totals.stalled, tone: totals.stalled > 0 ? 'text-text-warning' : 'text-text-faint' },
    {
      label: 'Scanned out today',
      value: feed.scannedOut.today,
      tone: 'text-text-success',
      suffix: `/ ${feed.scannedOut.yesterday.toLocaleString()} yesterday`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        {headline.map((item) => (
          <div key={item.label}>
            <p className="text-xl font-semibold text-text-soft">{item.label}</p>
            <p className={cn('mt-1 text-6xl font-semibold tabular-nums leading-none', item.tone)}>
              {item.value.toLocaleString()}
              {item.suffix ? <span className="ml-3 text-2xl font-semibold text-text-soft">{item.suffix}</span> : null}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-stretch gap-3">
        {feed.stages.map((stage, i) => (
          <Fragment key={stage.stage}>
            {i > 0 ? <ArrowRight className="h-8 w-8 shrink-0 self-center text-text-faint" aria-hidden /> : null}
            <StageTile stage={stage} />
          </Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PaceBlock feed={feed} inBuilding={totals.inBuilding} now={now} />
        <PickupsBlock pickups={feed.pickups} now={now} />
      </div>
    </div>
  );
}

function StageTile({ stage }: { stage: TvLiveFeedStage }) {
  const look = STAGE_LOOK[stage.stage];
  const meta = PACKAGE_STAGE_META[stage.stage];
  const done = meta.kind === 'done';
  return (
    <Panel radius="2xl" padding="sm" className="min-w-0 flex-1">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', look.tile)}>
          <look.Icon className="h-7 w-7" />
        </span>
        <p className="text-2xl font-semibold text-text-default">{meta.label}</p>
      </div>
      <p className={cn('mt-3 text-6xl font-semibold tabular-nums leading-none', stage.count > 0 ? look.ink : 'text-text-faint')}>
        {stage.count.toLocaleString()}
      </p>
      <div className="mt-3 flex min-h-9 flex-wrap items-center gap-2">
        {done ? <span className="text-lg font-semibold text-text-soft">today</span> : null}
        {stage.lateCount > 0 ? (
          <span className="rounded-lg border border-border-danger bg-surface-danger px-2.5 py-1 text-lg font-semibold tabular-nums text-text-danger">
            {stage.lateCount.toLocaleString()} late
          </span>
        ) : null}
        {stage.stalledCount > 0 ? (
          <span className="rounded-lg border border-border-warning bg-surface-warning px-2.5 py-1 text-lg font-semibold tabular-nums text-text-warning">
            {stage.stalledCount.toLocaleString()} stalled
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

function PaceBlock({ feed, inBuilding, now }: { feed: TvLiveFeed; inBuilding: number; now: number | null }) {
  // Drawn after mount only (`now`), so the server's HTML never carries a clock.
  if (now == null) return <div />;
  const clock = warehouseClockHours(now);
  const currentHour = Math.floor(clock);
  const { today, yesterday } = feed.pace;
  const rate = pacePerHour(today, clock);

  // The working day, widened to any hour with scan-outs today or yesterday.
  const busy = [currentHour, ...today.flatMap((n, h) => (n > 0 ? [h] : [])), ...yesterday.flatMap((n, h) => (n > 0 ? [h] : []))];
  const from = Math.max(0, Math.min(...busy, 8) - 1);
  const to = Math.min(23, Math.max(...busy, 17) + 1);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const peak = Math.max(1, ...hours.map((h) => Math.max(today[h] ?? 0, yesterday[h] ?? 0)));

  return (
    <div>
      <p className="text-xl font-semibold text-text-soft">Pace</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums leading-none text-text-default">
        {rate == null ? 'No scan-outs yet' : `~${rate < 10 ? rate.toFixed(1) : Math.round(rate)}/hr`}
      </p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-text-soft">
        {rate != null && inBuilding > 0 ? `Clears in ~${formatDurationMinutes((inBuilding / rate) * 60)} · ` : null}
        Yesterday by now: {yesterdayByNow(yesterday, clock).toLocaleString()}
      </p>
      {/* No scan-outs today or yesterday: nothing to chart (`busy` is only the current hour). */}
      {busy.length > 1 ? (
        <>
          <div
            className="mt-4 flex h-24 items-end gap-1"
            role="img"
            aria-label="Scanned out per hour: today in green, yesterday in grey behind"
          >
            {hours.map((h) => (
              <div key={h} className="relative flex h-full flex-1 items-end">
                <span aria-hidden className="absolute inset-x-0 bottom-0 rounded-sm bg-surface-strong" style={{ height: `${((yesterday[h] ?? 0) / peak) * 100}%` }} />
                <span
                  aria-hidden
                  className={cn('relative w-full rounded-sm', h === currentHour ? 'bg-emerald-400' : 'bg-emerald-600')}
                  style={{ height: `${((today[h] ?? 0) / peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {hours.map((h) => (
              <span key={h} className="flex-1 text-center text-sm font-semibold tabular-nums text-text-faint">
                {h % 3 === 0 ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}` : ''}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PickupsBlock({ pickups, now }: { pickups: TvLiveFeedPickup[]; now: number | null }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xl font-semibold text-text-soft">
        <Truck className="h-6 w-6" aria-hidden />
        Pickups today
      </p>
      {pickups.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-lg font-semibold text-text-faint">
          No carrier pickups left today.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pickups.map((pickup) => (
            <PickupRow key={`${pickup.carrier}-${pickup.cutoffAt}`} pickup={pickup} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PickupRow({ pickup, now }: { pickup: TvLiveFeedPickup; now: number | null }) {
  const remaining = pickup.notPacked + pickup.packed;
  const left = now == null ? null : Date.parse(pickup.cutoffAt) - now;
  const tone = left == null ? 'calm' : pickupTone(left, remaining);
  return (
    <li className={cn('flex items-center gap-4 rounded-xl border px-4 py-3', PICKUP_TONE[tone])}>
      <span className="w-28 shrink-0 truncate text-2xl font-semibold">{pickup.carrier}</span>
      <span className="shrink-0 text-xl font-semibold tabular-nums">{formatTime12hPST(pickup.cutoffAt)}</span>
      <span className="shrink-0 text-2xl font-semibold tabular-nums">
        {left == null ? null : left <= 0 ? 'Missed' : `in ${formatDurationMinutes(left / 60_000)}`}
      </span>
      <span className="ml-auto text-right text-xl font-semibold tabular-nums">
        {remaining === 0
          ? 'All out'
          : [
              pickup.notPacked > 0 ? `${pickup.notPacked.toLocaleString()} to pack` : null,
              pickup.packed > 0 ? `${pickup.packed.toLocaleString()} at the dock` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
      </span>
    </li>
  );
}
