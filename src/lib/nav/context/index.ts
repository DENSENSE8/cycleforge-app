/**
 * The contextual sidebar contract — import from here. Framework-free and
 * DB-free (the HTTP loader lives in `./service`, server-only).
 */

export * from './schema';
export { resolveNavContext } from './resolve';
export type { ResolveNavContextInput } from './build';
export {
  NAV_CONTEXT_ROLLOUT,
  NAV_ROLLOUT_SETTING_VALUES,
  navRolloutOverride,
  navRolloutSettingKey,
} from './rollout';
export { NAV_PARITY, parityGaps, type ParityKind, type ParityRow } from './parity';
export { NAV_SCAN_GRAMMARS, type NavScanGrammar } from './pages';
