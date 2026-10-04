export type SpineNavigationBand = 'utility' | 'business' | 'bottom';

/** Canonical first-level order shared by desktop, mobile web and native clients. */
export const SPINE_NAVIGATION_BAND_ORDER: readonly SpineNavigationBand[] = [
  'utility',
  'business',
  'bottom',
] as const;

/**
 * The visual family an L1 sidebar block belongs to. Every block between the
 * pinned rows and the fixed utilities sits under Operations — the lanes, Scan
 * Stations and root pages such as the Live feed. There is no Management band
 * (operator 2026-10-03: its rows moved under the Operations subtitle).
 */
export function spineNavigationBand(id: string): SpineNavigationBand {
  if (id === 'top') return 'utility';
  if (id === 'bottom' || id === 'print-station' || id === 'reports') return 'bottom';
  return 'business';
}

/** Compact visible heading for each family of navigation rows. */
export function spineNavigationBandTitle(band: SpineNavigationBand): string {
  switch (band) {
    case 'utility':
      return 'Workspace';
    case 'business':
      return 'Operations';
    case 'bottom':
      return 'Utilities';
  }
}
