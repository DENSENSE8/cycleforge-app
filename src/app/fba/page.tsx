/**
 * `/fba` — permanent rehome to Outbound FBA mode (surface split).
 * Preserves legacy `?mode=plan|combine|shipped` as `fbaMode`, plus openShipmentId.
 */

import { redirect } from 'next/navigation';
import {
  FBA_LEGACY_REDIRECT_FORWARDED_PARAMS,
  fbaOutboundHref,
  resolveFbaMode,
} from '@/lib/fba/fba-modes';

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function FbaRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const legacyMode = first(raw.mode);
  const fbaMode = resolveFbaMode(
    first(raw.fbaMode) ??
      (legacyMode === 'plan' || legacyMode === 'combine' || legacyMode === 'shipped'
        ? legacyMode
        : null),
  );
  const openShipmentId = first(raw.openShipmentId);
  const extra: Record<string, string | null> = {};
  for (const key of FBA_LEGACY_REDIRECT_FORWARDED_PARAMS) {
    const v = first(raw[key]);
    if (v) extra[key] = v;
  }
  redirect(fbaOutboundHref({ fbaMode, openShipmentId, extra }));
}
