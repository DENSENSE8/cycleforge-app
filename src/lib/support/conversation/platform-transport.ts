/**
 * Platform → transport (owner 2026-10-04, "first class platform"). A Support
 * item references the org's `platforms` row (where the customer bought /
 * wrote); `support_tickets.provider` stays the TRANSPORT (how a reply can be
 * carried). A new item's transport is derived from its platform, never picked:
 *
 *   internal record                    → 'internal'
 *   platform slug ebay | amazon | ecwid → that channel (Copy & open the marketplace)
 *   any other platform                 → 'manual' (pasted; the staffer replies elsewhere)
 *
 * Pure and client-safe.
 */
import type { SupportChannel, SupportPurpose } from './model';

/** Org platform slugs whose marketplace is a Support transport of the same name. */
const PLATFORM_TRANSPORTS = ['ebay', 'amazon', 'ecwid'] as const satisfies readonly SupportChannel[];

export function supportTransportForPlatform(purpose: SupportPurpose, platformSlug: string | null | undefined): SupportChannel {
  if (purpose === 'internal_record') return 'internal';
  const slug = platformSlug?.trim().toLowerCase() ?? '';
  return PLATFORM_TRANSPORTS.find((channel) => channel === slug) ?? 'manual';
}
