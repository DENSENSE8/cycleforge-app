/** Station builder registries — public surface (Operations Studio layer 2). */

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

export { getBlock, listBlockMeta } from './blocks/registry';
export { getDataSource, listDataSources, listDataSourceMeta } from './data-sources';
export { getAction, listActionMeta, actionsForSource } from './actions';
// The procedure registry is deliberately NOT re-exported here:
export * from './contract';

// ─── Operator surfaces (Studio-driven operator surfaces refactor) ──────────── Surface keys/registry (capability declaration), the…
export * from './archetype';
export * from './surface-keys';
// surface-resolver is deliberately NOT re-exported:
