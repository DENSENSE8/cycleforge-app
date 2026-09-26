/** Nav-keys regions — the canonical armable region set + their region keys. */

export type NavRegionId = 'left' | 'middle' | 'right';

interface NavRegionDef {
  id: NavRegionId;
  /** Bare letter that arms this region during the leader's region-pick step. */
  key: string;
  /** Operator-facing name (region-pick hints, a11y). */
  label: string;
}

export const NAV_REGIONS: readonly NavRegionDef[] = [
  { id: 'left', key: 'l', label: 'Left rail' },
  { id: 'middle', key: 'm', label: 'Middle' },
  { id: 'right', key: 'r', label: 'Right' },
] as const;

const REGION_BY_KEY = new Map(NAV_REGIONS.map((r) => [r.key, r.id]));

/** The region a bare region-pick key selects, or null when it names none. */
export function regionForKey(key: string): NavRegionId | null {
  return REGION_BY_KEY.get(key.toLowerCase()) ?? null;
}
