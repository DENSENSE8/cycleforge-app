/**
 * Surface index — derived from the TypeScript cohorts, not per-page markdown.
 *
 * A route or workspace path maps to eval command + graph symbols. The graph
 * is the page spec: if a path is not here, it is not a station / engine job.
 *
 *   surfaceForRoute('/shipping/scan-out')
 *   surfaceForPath('src/components/packer/PackOrderWorkspace.tsx')
 */

import { SHORTCUT_DISPLAY_ENGINE } from '@/lib/keyboard/shortcut-display-cohort';
import {
  SCAN_STATION_OVERLAY_COHORT,
  stationEvalManifest,
} from '@/lib/station/scan-station-overlay-cohort';
import { SLOT_TABLE_ENGINE } from '@/lib/tables/slot-table-cohort';

export type SurfaceKind = 'station' | 'slot-table-engine' | 'shortcuts-engine' | 'composer';

export type SurfaceRow = {
  id: string;
  kind: SurfaceKind;
  route: string | null;
  workspace: string;
  exportName: string;
  evalCommand: string;
  cohort: string;
  graphSymbols: readonly string[];
};

export function surfaceIndex(): SurfaceRow[] {
  const stations: SurfaceRow[] = SCAN_STATION_OVERLAY_COHORT.map((m) => {
    const manifest = stationEvalManifest(m);
    return {
      id: m.id,
      kind: 'station',
      route: m.route,
      workspace: m.workspace,
      exportName: m.exportName,
      evalCommand: `pnpm run eval:station ${m.id}`,
      cohort: `station:${m.id}`,
      graphSymbols: manifest.graphSymbols,
    };
  });

  return [
    ...stations,
    {
      id: 'slot-table',
      kind: 'slot-table-engine',
      route: null,
      workspace: SLOT_TABLE_ENGINE.compoundCells,
      exportName: 'CompoundItem',
      evalCommand: 'pnpm run eval:cohort slot-table',
      cohort: 'slot-table',
      graphSymbols: SLOT_TABLE_ENGINE.graphSymbols,
    },
    {
      id: 'shortcuts',
      kind: 'shortcuts-engine',
      route: null,
      workspace: SHORTCUT_DISPLAY_ENGINE.keyboardKey,
      exportName: 'KeyboardKey',
      evalCommand: 'pnpm run eval:cohort shortcuts',
      cohort: 'shortcuts',
      graphSymbols: SHORTCUT_DISPLAY_ENGINE.graphSymbols,
    },
    {
      id: 'composer',
      kind: 'composer',
      route: null,
      workspace: 'src/components/composer/StationComposerHost.tsx',
      exportName: 'StationComposerHost',
      evalCommand: 'pnpm run eval:station scan-out',
      cohort: 'composer',
      graphSymbols: ['StationComposerHost', 'ComposerModeRow'],
    },
  ];
}

export function surfaceForRoute(route: string): SurfaceRow | undefined {
  const want = route.replace(/\/+$/, '') || '/';
  return surfaceIndex().find((s) => s.route === want);
}

export function surfaceForPath(path: string): SurfaceRow[] {
  const p = path.replaceAll('\\', '/').replace(/^\.\//, '');
  const hits: SurfaceRow[] = [];
  const seen = new Set<string>();
  const push = (row: SurfaceRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    hits.push(row);
  };

  for (const row of surfaceIndex()) {
    if (p === row.workspace || p.endsWith(`/${row.workspace}`)) push(row);
  }

  const slotFiles = enginePaths(SLOT_TABLE_ENGINE as unknown as Record<string, unknown>);
  if (slotFiles.some((f) => p === f || p.endsWith('/' + f))) {
    const row = surfaceIndex().find((s) => s.id === 'slot-table');
    if (row) push(row);
  }
  const shortcutFiles = enginePaths(SHORTCUT_DISPLAY_ENGINE as unknown as Record<string, unknown>);
  if (shortcutFiles.some((f) => p === f || p.endsWith('/' + f))) {
    const row = surfaceIndex().find((s) => s.id === 'shortcuts');
    if (row) push(row);
  }

  return hits;
}

function enginePaths(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of Object.values(record)) {
    if (typeof v === 'string' && v.includes('/')) out.push(v);
    else if (Array.isArray(v)) {
      for (const x of v) if (typeof x === 'string' && x.includes('/')) out.push(x);
    }
  }
  return out;
}
