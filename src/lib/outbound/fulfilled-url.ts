/**
 * Fulfilled's URL reads that know the journey buckets — apart from
 * `fulfilled-params.ts`, which the shipping desk paths import (the bucket
 * table reaches back into them).
 */

import { FULFILLED_BUCKET_IDS, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import type { RecordsSort } from '@/lib/nav/records/params';
import {
  FULFILLED_AXIS_PARAM,
  FULFILLED_COLUMN_PARAM,
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_PLATFORM_PARAM,
  FULFILLED_SORT_PARAM,
  type FulfilledAxis,
} from '@/lib/outbound/fulfilled-params';

/** The `?col=` bucket, or null when the URL names none (or no bucket). */
export function readFulfilledColumn(url: Pick<URLSearchParams, 'get'>): FulfilledBucketId | null {
  const raw = url.get(FULFILLED_COLUMN_PARAM)?.trim() ?? '';
  return (FULFILLED_BUCKET_IDS as readonly string[]).includes(raw) ? (raw as FulfilledBucketId) : null;
}

/** Fulfilled's sort words before it took the Records vocabulary (2026-10-07) → the Records sort each one was. */
const LEGACY_SORT: Readonly<Record<string, RecordsSort>> = {
  shipped: 'date',
  ordered: 'placed',
  shipBy: 'ship_by',
  channel: 'platform',
  customer: 'party',
  status: 'journey',
  packer: 'packed_by',
  lastEvent: 'last_event',
};
const LEGACY_AXIS: Readonly<Record<string, FulfilledAxis>> = { ordered: 'placed', shipBy: 'ship_by' };

/**
 * A link written before Fulfilled took the Records params (2026-10-07) →
 * the same view's search string today; null when nothing needs rewriting.
 * `channel` → `platform`; the old axis and sort words → the Records ones;
 * the sheet's status chip (`status`) → the bucket narrowing (`col`) on the
 * sheet. One way: the page redirects once and the old words never return.
 */
export function fulfilledLegacySearch(url: URLSearchParams): string | null {
  const next = new URLSearchParams(url);
  let changed = false;
  const channel = next.get('channel');
  if (channel !== null) {
    next.delete('channel');
    if (channel.trim() && !next.has(FULFILLED_PLATFORM_PARAM)) next.set(FULFILLED_PLATFORM_PARAM, channel.trim().toLowerCase());
    changed = true;
  }
  const axis = LEGACY_AXIS[next.get(FULFILLED_AXIS_PARAM) ?? ''];
  if (axis) {
    next.set(FULFILLED_AXIS_PARAM, axis);
    changed = true;
  }
  const sort = LEGACY_SORT[next.get(FULFILLED_SORT_PARAM) ?? ''];
  if (sort) {
    next.set(FULFILLED_SORT_PARAM, sort);
    changed = true;
  }
  const status = next.get('status');
  if (status !== null) {
    next.delete('status');
    if ((FULFILLED_BUCKET_IDS as readonly string[]).includes(status) && !next.has(FULFILLED_COLUMN_PARAM)) {
      next.set(FULFILLED_COLUMN_PARAM, status);
      next.set(FULFILLED_LAYOUT_PARAM, 'sheet');
    }
    changed = true;
  }
  return changed ? next.toString() : null;
}
