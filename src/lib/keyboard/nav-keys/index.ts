/**
 * Nav-keys — leader-armed, per-region, single-letter selection keyboard waist.
 *
 * P0 landed the pure keymap resolver + reveal-on-arm keycap (Right/Displays as
 * the first consumer). P1 adds the `⌘;` leader store, the 3-region set, and
 * `useNavRegion` so any region opts in the same way. Spec:
 * `docs/todo/nav-keys-selection-keyboard-HANDOFF.md`.
 */

export { matchNavKey } from './resolveNavKeymap';
export { NAV_KEY_HINT_CLASS } from './nav-key-face';
export { useNavRegion } from './useNavRegion';
export type { NavRegionId } from './nav-regions';
