/**
 * The Unbox step RAIL-LEAF registry — the KNOW half of the cockpit.
 *
 * Contract: `.claude/rules/display/scan-cockpit.md` (DO / KNOW split). The work
 * plane (centre + dock) holds the one armed action for the active step; the
 * right-edge Displays column is a **step-driven cockpit** that auto-shows the
 * reference THIS step needs — the manual · spec · position · one de-risking
 * fact. This registry is the reference half, exactly parallel to the dock's
 * `UNBOX_STEP_DOCK_CONTROLS`: one map says which Displays leaf a step references,
 * a sibling either-or map declares the steps whose reference IS the work plane.
 *
 * ## Why `Partial` + an either-or twin (same shape as the dock)
 *
 * Not every step has a distinct RAIL reference. `label`'s reference is the
 * centre `UnboxLabelPreview` — the operator reads the printed face in the work
 * plane, so forcing a rail leaf there would open an unrelated Display. A step
 * with no rail reference declares that in `UNBOX_STEPS_WITHOUT_RAIL_LEAF` **with
 * a reason**; neither map, or both, fails `scan-cockpit.guard.test.ts`. The
 * either-or is over the CAPTURE-phase steps (the cockpit's `activeKey` set),
 * mirroring `procedure-step-dock.guard`.
 *
 * The values must be real `UnboxSideTab` leaves (the cockpit IS the existing
 * `StationDisplaysPushColumn` — no new region, no new grammar).
 */

import type { UnboxSideTab } from '../../unbox-side-tabs';

/**
 * Active capture step → the Displays leaf the cockpit rail auto-shows as its
 * reference. Dogfood-tunable (which reference each step wants is a bench call,
 * not frozen) — but every capture step is either here or in the either-or twin.
 */
export const UNBOX_STEP_RAIL_LEAF: Partial<Record<string, UnboxSideTab>> = {
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
export const UNBOX_STEPS_WITHOUT_RAIL_LEAF: Readonly<Record<string, string>> = {
  classify:
    'urgency · platform · type are InlinePillPicker menus on the carton identity ' +
    'bar, one row above the work plane — the Displays Classify leaf was a second ' +
    'editor for the same three fields and was dropped 2026-08-19',
  label:
    'the printed face is the centre UnboxLabelPreview — the operator reads the ' +
    'label in the work plane, so there is no distinct rail reference; a forced ' +
    'leaf here would open an unrelated Display beside the very thing being read',
};

/**
 * The Displays leaf the cockpit should show for the active step, or `null` when
 * the step is settled (`activeKey === null`) or references the work plane
 * (declared reference-less). Pure — the ONE derivation drives both the centre
 * action and this leaf, never a second store.
 */
export function resolveStepRailLeaf(activeKey: string | null): UnboxSideTab | null {
  if (activeKey == null) return null;
  return UNBOX_STEP_RAIL_LEAF[activeKey] ?? null;
}
