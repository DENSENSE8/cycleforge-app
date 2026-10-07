/**
 * The Live feed's four stages — where an outbound carrier package is in the
 * building: the outbound internal pipeline (`OUTBOUND_PIPELINE`,
 * `src/lib/status/record-status.ts`), its keys and words. The three open
 * stages are Allocate's own `?stage=` partition of the To-ship scope
 * (`sqlOrderDeskStage`, `DESK_STAGE_STATUS`); Scanned out is the dock's
 * SHIP_CONFIRM. A package past the dock is done here — the carrier's own
 * statuses are not tracked. Client-safe.
 */

import { OUTBOUND_INTERNAL_STATUS, OUTBOUND_PIPELINE } from '@/lib/status/record-status';

export const PACKAGE_STAGES = OUTBOUND_PIPELINE;
export type PackageStage = (typeof OUTBOUND_PIPELINE)[number];

/** Open = still in the building (the whole backlog shows); done = scanned out today. */
export type PackageStageKind = 'open' | 'done';

export interface PackageStageMeta {
  /** The status word (`OUTBOUND_INTERNAL_STATUS`). */
  label: string;
  /** The step's name on a package's track (what happened to reach this stage). */
  step: string;
  /** What the column is waiting on, for its empty state. */
  empty: string;
  kind: PackageStageKind;
}

const status = OUTBOUND_INTERNAL_STATUS;

export const PACKAGE_STAGE_META: Readonly<Record<PackageStage, PackageStageMeta>> = {
  to_pick: { label: status.to_pick.label, step: 'Ordered', empty: 'Nothing waiting on a pick.', kind: 'open' },
  picked: { label: status.picked.label, step: status.picked.label, empty: 'Nothing picked and waiting to pack.', kind: 'open' },
  packed: { label: status.packed.label, step: status.packed.label, empty: 'Nothing packed and waiting at the dock.', kind: 'open' },
  scanned_out: { label: status.scanned_out.label, step: status.scanned_out.label, empty: 'Nothing scanned out yet today.', kind: 'done' },
};

export function isPackageStage(raw: string | null | undefined): raw is PackageStage {
  return raw != null && (PACKAGE_STAGES as readonly string[]).includes(raw);
}

/**
 * How long a package may sit in a stage before it reads STALLED. To pick is
 * not here: its pressure is the ship-by SLA (Late / Due today). A picked box
 * not packed, or a packed box not scanned out, after this many hours is stuck
 * on the floor whatever its ship-by says.
 */
export const PACKAGE_STALL_HOURS: Readonly<Partial<Record<PackageStage, number>>> = {
  picked: 4,
  packed: 4,
};

/**
 * A column's order (owner 2026-10-05: "latest scanned, or late and most important").
 * `urgent` = late, then due today, then longest in the stage; `latest` = the newest
 * arrival in the stage first (for Scanned out: the latest scan-out); `oldest` = the reverse.
 */
export type PackageSort = 'urgent' | 'latest' | 'oldest';

/** Each column's choices, its default first. Scanned out has no SLA left to rank by. */
export const PACKAGE_STAGE_SORTS: Readonly<Record<PackageStage, readonly PackageSort[]>> = {
  to_pick: ['urgent', 'latest', 'oldest'],
  picked: ['urgent', 'latest', 'oldest'],
  packed: ['urgent', 'latest', 'oldest'],
  scanned_out: ['latest', 'oldest'],
};

export const PACKAGE_SORT_LABEL: Readonly<Record<PackageSort, string>> = {
  urgent: 'Most urgent',
  latest: 'Latest',
  oldest: 'Oldest',
};

/** Every column's order: the chosen one where it is a valid choice, else the column's default. */
export type PackageSorts = Readonly<Record<PackageStage, PackageSort>>;

export function resolvePackageSorts(chosen: Readonly<Partial<Record<PackageStage, PackageSort>>> | null): PackageSorts {
  const sorts = {} as Record<PackageStage, PackageSort>;
  for (const stage of PACKAGE_STAGES) {
    const pick = chosen?.[stage];
    sorts[stage] = pick && PACKAGE_STAGE_SORTS[stage].includes(pick) ? pick : PACKAGE_STAGE_SORTS[stage][0]!;
  }
  return sorts;
}

/** Viewing the feed needs the outbound pack desk's view permission. */
export const LIVE_FEED_PERMISSION = 'packing.view';
