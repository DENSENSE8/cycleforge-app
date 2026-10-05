/**
 * The Live feed's four stages — where an outbound carrier package is in the
 * building, in pipeline order. The three open stages are Allocate's own
 * `?stage=` partition of the To-ship scope (`sqlOrderDeskStage`: pending →
 * To pick, picked, packed); Scanned out is the dock's SHIP_CONFIRM. A package
 * past the dock is done here — the carrier's own statuses are not tracked.
 * Client-safe.
 */

export const PACKAGE_STAGES = ['to_pick', 'picked', 'packed', 'scanned_out'] as const;
export type PackageStage = (typeof PACKAGE_STAGES)[number];

/** Open = still in the building (the whole backlog shows); done = scanned out today. */
export type PackageStageKind = 'open' | 'done';

export interface PackageStageMeta {
  label: string;
  /** The step's name on a package's track (what happened to reach this stage). */
  step: string;
  /** What the column is waiting on, for its empty state. */
  empty: string;
  kind: PackageStageKind;
}

export const PACKAGE_STAGE_META: Readonly<Record<PackageStage, PackageStageMeta>> = {
  to_pick: { label: 'To pick', step: 'Ordered', empty: 'Nothing waiting on a pick.', kind: 'open' },
  picked: { label: 'Picked', step: 'Picked', empty: 'Nothing picked and waiting to pack.', kind: 'open' },
  packed: { label: 'Packed', step: 'Packed', empty: 'Nothing packed and waiting at the dock.', kind: 'open' },
  scanned_out: { label: 'Scanned out', step: 'Scanned out', empty: 'Nothing scanned out yet today.', kind: 'done' },
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

/** Viewing the feed needs the outbound pack desk's view permission. */
export const LIVE_FEED_PERMISSION = 'packing.view';
