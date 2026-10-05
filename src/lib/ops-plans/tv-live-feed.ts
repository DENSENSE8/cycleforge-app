/**
 * The Live feed's summary for the Operations TV wall board — PURE, client-safe.
 *
 * The wall's kiosk session holds only `operations.tv.view`, so it reads the
 * package floor through `GET /api/operations/tv-board/live-feed`, which
 * projects the Live feed board (`loadLiveFeedBoard`, unfiltered) down to what
 * an unattended screen shows: numbers only — no cards, no customers.
 */

import type { PackageBoard } from '@/lib/live-feed/types';
import { PACKAGE_STAGES, type PackageStage } from '@/lib/live-feed/stages';

export interface TvLiveFeedStage {
  stage: PackageStage;
  count: number;
  /** Open stages: past ship-by. */
  lateCount: number;
  /** Open stages: sat past `PACKAGE_STALL_HOURS`. */
  stalledCount: number;
}

export interface TvLiveFeedPickup {
  carrier: string;
  cutoffAt: string;
  /** Warehouse wall-clock `HH:MM`. */
  cutoffLocal: string;
  /** To pick + picked — not in a box yet. */
  notPacked: number;
  /** Packed, waiting at the dock. */
  packed: number;
}

export interface TvLiveFeed {
  generatedAt: string;
  /** The four stages in pipeline order. */
  stages: TvLiveFeedStage[];
  scannedOut: { today: number; yesterday: number };
  /** Packages scanned out per warehouse hour (index 0–23). */
  pace: { today: number[]; yesterday: number[] };
  /** Today's pickups still ahead, or missed with packages left — soonest first. */
  pickups: TvLiveFeedPickup[];
}

export function toTvLiveFeed(board: PackageBoard): TvLiveFeed {
  const stages = PACKAGE_STAGES.map((stage) => {
    const column = board.columns.find((c) => c.stage === stage);
    return {
      stage,
      count: column?.count ?? 0,
      lateCount: column?.lateCount ?? 0,
      stalledCount: column?.stalledCount ?? 0,
    };
  });
  const done = board.columns.find((c) => c.stage === 'scanned_out');
  return {
    generatedAt: board.generatedAt,
    stages,
    scannedOut: { today: done?.count ?? 0, yesterday: done?.previousCount ?? 0 },
    pace: { today: [...board.pace.today], yesterday: [...board.pace.yesterday] },
    pickups: [...board.pickups]
      .sort((a, b) => Date.parse(a.cutoffAt) - Date.parse(b.cutoffAt))
      .map(({ carrier, cutoffAt, cutoffLocal, notPacked, packed }) => ({ carrier, cutoffAt, cutoffLocal, notPacked, packed })),
  };
}

/** The wall's headline numbers: everything still in the building, and how much of it is late or stalled. */
export function tvLiveFeedTotals(feed: TvLiveFeed): { inBuilding: number; late: number; stalled: number } {
  const open = feed.stages.filter((s) => s.stage !== 'scanned_out');
  return {
    inBuilding: open.reduce((sum, s) => sum + s.count, 0),
    late: open.reduce((sum, s) => sum + s.lateCount, 0),
    stalled: open.reduce((sum, s) => sum + s.stalledCount, 0),
  };
}
