/**
 * Station builder registries — public surface (Operations Studio layer 2).
 *
 * Importing this module registers the builtin data sources and actions as a
 * side effect (same pattern as src/lib/workflow/index.ts), so every consumer
 * sees one consistent registry set.
 *
 * The BLOCK registry and the slot-composition renderer were deleted 2026-08-22:
 * slots carried no geometry and could not express a tile layout, and the whole
 * path was flag-gated off in every deployment. Sources and actions survive
 * because live code reads them.
 */

import { registerBuiltinDataSources } from './data-sources';
import { registerBuiltinActions } from './actions';
import { registerBuiltinProcedures } from './procedure';

let builtinsRegistered = false;
export function registerStationBuiltins(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerBuiltinDataSources();
  registerBuiltinActions();
  registerBuiltinProcedures();
}

// Side-effect registration on import — consumers just import and read.
registerStationBuiltins();

export { getDataSource, listDataSources, listDataSourceMeta } from './data-sources';
export { getAction, listActionMeta, actionsForSource } from './actions';
// The procedure registry is deliberately NOT re-exported here: its only
// consumers are the Studio's Procedure lens and the lineage guard, and both
// import '@/lib/stations/procedure' directly. Re-exporting it would put a
// second, unused path to the same module in every station bundle.
export * from './contract';

// ─── Operator surfaces ───────────────────────────────────────────────────────
// The closed surface registry + the archetype decision. This registry is the
// seed of the Warehouse OS session-type registry — see docs/warehouse-os/.
export * from './archetype';
export * from './surface-keys';
// surface-resolver is deliberately NOT re-exported: it imports tenancy/db
// (server-only Neon driver), and this barrel is consumed by client station
// surfaces — re-exporting it shipped the DB driver in every station bundle.
// Server callers import '@/lib/stations/surface-resolver' directly.
