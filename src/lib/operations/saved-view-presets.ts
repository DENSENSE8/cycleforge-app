import type { JourneyUrlFilters } from '@/components/sidebar/operations/useOperationsTimelineUrlState';

/** Code-defined SYSTEM saved-views — the former `/audit-log` sections re-expressed as Operations History browse presets (plan §3.3 + §4.1… */
export interface SystemSavedView {
  /** Stable id, applied via `?view=sys:<id>`. */
  id: string;
  /** Sidebar label. */
  name: string;
  /** The filter snapshot applied on select (a `Partial<JourneyUrlFilters>`). */
  filters: Partial<JourneyUrlFilters>;
}

export const SYSTEM_SAVED_VIEWS: readonly SystemSavedView[] = [
  { id: 'receiving-audit', name: 'Receiving', filters: { stations: ['RECEIVING'], sources: ['sal', 'inventory'] } },
  { id: 'pack-audit', name: 'Pack', filters: { stations: ['PACK'] } },
  { id: 'tech-audit', name: 'Tech', filters: { stations: ['TECH'] } },
  { id: 'shipping-carrier', name: 'Shipping & carrier', filters: { stations: ['SHIP'], sources: ['sal', 'inventory', 'carrier'] } },
  { id: 'floor-activity', name: 'Floor activity', filters: { sources: ['sal', 'inventory', 'carrier', 'warranty'] } },
];

const SYS_PREFIX = 'sys:';

/** The `?view=` param value for a system preset id. */
export function systemViewParam(id: string): string {
  return `${SYS_PREFIX}${id}`;
}

/** True when a `?view=` value names a system preset (vs a user view's numeric id). */
export function isSystemViewParam(viewParam: string | null | undefined): boolean {
  return !!viewParam && viewParam.startsWith(SYS_PREFIX);
}

/** Resolve a `?view=sys:<id>` param to its preset, or null (unknown / user view). */
export function resolveSystemSavedView(viewParam: string | null | undefined): SystemSavedView | null {
  if (!isSystemViewParam(viewParam)) return null;
  const id = viewParam!.slice(SYS_PREFIX.length);
  return SYSTEM_SAVED_VIEWS.find((v) => v.id === id) ?? null;
}
