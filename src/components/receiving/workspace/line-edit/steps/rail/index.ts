/** The Unbox step RAIL-LEAF registry — the KNOW half of the cockpit. */

import type { UnboxSideTab } from '../../unbox-side-tabs';

/**
 * Active capture step → the Displays leaf the cockpit rail auto-shows as its
 * reference. Dogfood-tunable (which reference each step wants is a bench call,
 * not frozen) — but every capture step is either here or in the either-or twin.
 */
const UNBOX_STEP_RAIL_LEAF: Partial<Record<string, UnboxSideTab>> = {
  // Found/Return door + packing walk: KNOW is listing links (what you are
  // receiving) — not the Photos gallery. Catalog-only / item photo steps still
  // reference Photos (and item_photos opens Compare via LineEditPanel).
  arrival_label_photo: 'listings',
  arrival_box_photo: 'listings',
  packing_material: 'listings',
  shipping_label_photo: 'photos',
  box_photo: 'photos',
  item_photos: 'photos',
  // What SHOULD be in the box — the PO dossier.
  contents: 'inventory',
  // Serial + grade reference the per-unit list (how many units, which serials).
  serial: 'units',
  condition: 'units',
};

/**
 * Capture steps whose reference is the WORK PLANE, not a rail leaf — declared
 * with a reason so the either-or cannot quietly grow a gap. Same discipline as
 * `UNBOX_STEPS_WITHOUT_DOCK_ACTION`.
 */
const UNBOX_STEPS_WITHOUT_RAIL_LEAF: Readonly<Record<string, string>> = {
  classify:
    'urgency · platform · type are InlinePillPicker menus on the carton identity ' +
    'bar, one row above the work plane — the Displays Classify leaf was a second ' +
    'editor for the same three fields and was dropped 2026-08-19',
  label:
    'the printed face is the centre UnboxLabelPreview — the operator reads the ' +
    'label in the work plane, so there is no distinct rail reference; a forced ' +
    'leaf here would open an unrelated Display beside the very thing being read',
};

/** The Displays leaf the cockpit should show for the active step, or `null` when the step is settled (`activeKey === null`) or references… */
export function resolveStepRailLeaf(activeKey: string | null): UnboxSideTab | null {
  if (activeKey == null) return null;
  return UNBOX_STEP_RAIL_LEAF[activeKey] ?? null;
}
