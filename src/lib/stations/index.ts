/**
 * Station builder registries — public surface (Operations Studio layer 2).
 *
 * Importing this module registers the builtin blocks, data sources and
 * actions as a side effect (same pattern as src/lib/workflow/index.ts), so
 * any consumer — the renderer, the palette, the /api/stations validator —
 * sees one consistent registry set.
 *
 * Blocks/sources/actions are CODE (registered here, PR-reviewed); station
 * compositions are DATA (station_definitions rows, edited in the builder,
 * published without deploys). See docs/operations-studio/station-builder-ui-plan.md.
 */

import { registerBuiltinDataSources } from './data-sources';
import { registerBuiltinActions } from './actions';
import { registerBuiltinProcedures } from './procedure';
import { registerChecklistBlock } from './blocks/checklist.block';
import { registerScanBandBlock } from './blocks/scan-band.block';
import { registerRailFeedBlock } from './blocks/rail-feed.block';

let builtinsRegistered = false;
export function registerStationBuiltins(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerBuiltinDataSources();
  registerBuiltinActions();
  registerBuiltinProcedures();
  registerChecklistBlock();
  registerScanBandBlock();
  registerRailFeedBlock();
}

// Side-effect registration on import — consumers just import and read.
registerStationBuiltins();

export {
  registerBlock,
  getBlock,
  hasBlock,
  listBlocks,
  listBlockMeta,
} from './blocks/registry';
export {
  registerDataSource,
  getDataSource,
  listDataSources,
  listDataSourceMeta,
} from './data-sources';
export {
  registerAction,
  getAction,
  listActions,
  listActionMeta,
  actionsForSource,
} from './actions';
// The procedure registry is deliberately NOT re-exported here: its only
// consumers are the Studio's Procedure lens and the lineage guard, and both
// import '@/lib/stations/procedure' directly. Re-exporting it would put a
// second, unused path to the same module in every station bundle.
export * from './contract';

// ─── Operator surfaces (Studio-driven operator surfaces refactor) ────────────
// Surface keys/registry (capability declaration), the archetype decision, and
// the legacy-vs-composed resolver. Surfaces are CODE (the closed set the app can
// render); per-org compositions are DATA (station_definitions rows).
export * from './archetype';
export * from './surface-keys';
// surface-resolver is deliberately NOT re-exported: it imports tenancy/db
// (server-only Neon driver), and this barrel is consumed by client station
// surfaces — re-exporting it shipped the DB driver in every station bundle.
// Server callers import '@/lib/stations/surface-resolver' directly
// (src/app/api/surfaces/[key]/resolve/route.ts).
