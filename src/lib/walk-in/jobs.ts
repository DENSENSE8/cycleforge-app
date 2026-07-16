/**
 * Walk-In front-desk jobs — SoT for the Receiving Walk-In station sub-modes.
 *
 * Receiving mode `pickup` (label "Walk-In") is the place; `?job=` picks the job.
 * Sales / Local Pickup / Repair share a counter shell and diverge on process.
 */

import { DollarSign, Package, Wrench } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';

export const WALK_IN_JOBS = ['sales', 'pickup', 'repair'] as const;
export type WalkInJob = (typeof WALK_IN_JOBS)[number];

export const DEFAULT_WALK_IN_JOB: WalkInJob = 'pickup';

export const WALK_IN_JOB_ITEMS: HorizontalSliderItem[] = [
  { id: 'sales', label: 'Sales', icon: DollarSign },
  { id: 'pickup', label: 'Local Pickup', icon: Package },
  { id: 'repair', label: 'Repair', icon: Wrench },
];

export function isWalkInJob(value: string | null | undefined): value is WalkInJob {
  return value != null && (WALK_IN_JOBS as readonly string[]).includes(value);
}

export function parseWalkInJob(raw: string | null | undefined): WalkInJob {
  return isWalkInJob(raw) ? raw : DEFAULT_WALK_IN_JOB;
}

/** Graduated station route for front-desk Walk-In work (still `/pickup` for path stability). */
export const WALK_IN_STATION_PATH = '/pickup';

/**
 * Build a station URL for a job, optionally carrying intake/deep-link params.
 * Clears the other job's params so each job opens clean.
 */
export function walkInStationHref(
  job: WalkInJob,
  extra?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  if (job !== DEFAULT_WALK_IN_JOB) params.set('job', job);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value == null || value === '') continue;
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${WALK_IN_STATION_PATH}?${qs}` : WALK_IN_STATION_PATH;
}
