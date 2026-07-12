/**
 * Outbound queue preference keys + URL helpers for the dashboard workbench.
 * Sticky defaults live in localStorage; shareable filters stay in the URL.
 */

import type { StationScope } from '@/lib/station/table-url-params';

/** Sticky default for My work vs All staff when the URL has no explicit scope/staff. */
export const OUTBOUND_STAFF_DEFAULT_KEY = 'outbound-queue-staff-default';

export type OutboundStaffDefault = 'me' | 'all';

export function parseOutboundStaffDefault(raw: unknown): OutboundStaffDefault {
  return raw === 'all' ? 'all' : 'me';
}

/** Needs-attention focus: blocked OR late (To Ship) / exceptions (Shipped). */
export const ATTENTION_PARAM = 'attention';

export function isAttentionOnly(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  const v = searchParams.get(ATTENTION_PARAM);
  return v === '1' || v === 'true';
}

/** Flat list vs lane stack for To Ship. */
export const SURFACE_PARAM = 'surface';
export type OutboundSurface = 'lanes' | 'list';

export function parseOutboundSurface(raw: string | null | undefined): OutboundSurface {
  return raw === 'list' ? 'list' : 'lanes';
}

/** Map sticky staff default → station scope used as parse fallback. */
export function staffDefaultToScope(d: OutboundStaffDefault): StationScope {
  return d === 'me' ? 'mine' : 'all';
}

/** localStorage key for column preset labels (not the hidden set itself). */
export const OUTBOUND_COLUMN_PRESET_KEY = 'outbound-queue-column-preset';

export type OutboundColumnPreset = 'full' | 'ops' | 'minimal';

export const OUTBOUND_COLUMN_PRESET_HIDDEN: Record<OutboundColumnPreset, readonly string[]> = {
  full: [],
  /** Dense ops: drop platform chip noise, keep identity + meta. */
  ops: ['platform'],
  /** Floor scan: qty + title + tracking only. */
  minimal: ['platform', 'condition', 'rest'],
};
