/**
 * The paste-a-list bucket filter's URL vocabulary (`NavSearch.locate.statusParam`:
 * Incoming `?recon=`, Shipping `?located=`). A pressed status chip writes ONE
 * bucket id; route hygiene must keep every id the locator can answer with,
 * or the chip snaps back to All on the next URL sync (2026-10-04: Awaiting
 * tracking did, because hygiene knew only received / not_received / exceptions).
 *
 * A value is either one of the locator's OWN bucket ids, or — a ref the
 * section holds nowhere, found in another section the caller can read —
 * `<locator>:<id>` with that other locator's own id (`inbound:received`).
 */

import { z } from 'zod';
import { NAV_LOCATE_NOWHERE, NAV_LOCATORS, type NavLocator } from '@/lib/nav/context/schema';
import { INBOUND_BUCKET_IDS } from '@/lib/nav/locate/inbound';
import { OUTBOUND_LOCATE_STATUSES } from '@/lib/nav/locate/outbound-params';
import { SUPPORT_LOCATE_STATUSES } from '@/lib/nav/locate/support-params';

/** Every locator's own bucket ids — the locators' declarations, never re-typed here. */
const LOCATE_BUCKET_IDS: Readonly<Record<NavLocator, readonly string[]>> = {
  inbound: INBOUND_BUCKET_IDS,
  outbound: OUTBOUND_LOCATE_STATUSES,
  support: SUPPORT_LOCATE_STATUSES,
};

/**
 * Is `value` a status the `locator`'s list can filter on: one of its buckets,
 * another section's prefixed bucket, or Not found ({@link NAV_LOCATE_NOWHERE})?
 */
export function isLocateBucketId(locator: NavLocator, value: string): boolean {
  if (value === NAV_LOCATE_NOWHERE || LOCATE_BUCKET_IDS[locator].includes(value)) return true;
  const at = value.indexOf(':');
  if (at < 0) return false;
  const other = value.slice(0, at) as NavLocator;
  return other !== locator && NAV_LOCATORS.includes(other) && LOCATE_BUCKET_IDS[other].includes(value.slice(at + 1));
}

/** Route-hygiene schema for a locator's bucket filter param (trimmed, lower-cased). */
export function paramLocateBucket(locator: NavLocator): z.ZodType<string> {
  return z
    .string()
    .transform((raw) => raw.trim().toLowerCase())
    .refine((value) => isLocateBucketId(locator, value));
}
