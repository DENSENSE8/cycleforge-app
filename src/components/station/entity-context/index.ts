/**
 * Station entity-context — **SoT**.
 *
 * 1. **Identity** — {@link CartonContextCard}: two-row face — row 1 urgency ·
 *    platform · type → Photos; row 2 lifecycle · order#/PO# · tracking; under
 *    Photos (end-aligned) price · listing · Claim/ticket. Listing/tracking Edit
 *    navigate to Unbox SectionTabs (`tracking` / `listings`); PO# is copy/open-only.
 *    Every station that shows inbound carton **or** Shipping active-order chrome
 *    composes this — never fork a parallel header.
 * 2. **Identity chrome** — {@link StationContextBar} + {@link StationMoreDetails}:
 *    flush-under-header identity strip + corner utilities
 *    (`stationContextBarHostClass`). Top inset SoT:
 *    {@link STATION_IDENTITY_INSET_TOP} (`top-0`) = flush under GlobalHeader.
 *    Never stack host `py-*` under an absolute identity overlay. Unbox mounts
 *    {@link StationContextBar} with `placement="flow"` above StationWorkbench
 *    with `reserveIdentityClearance={false}` so the identity hairline abuts
 *    PO lines (zero air). Other Tier A hosts may still use absolute overlay +
 *    `reserveIdentityClearance="stacked"`. Do not put identity in the workbench
 *    `entityContext` / `toolbar` slots for Unbox-family stations. Mid-canvas
 *    secondary jumps use
 *    `StationRightEdgeAction` (import from
 *    `@/components/station/entity-context/StationRightEdgeAction`) on the panel
 *    root — not inside `moreDetails`.
 * 3. **Header utilities** — {@link StationHeaderToolbar} + workspace mode registry:
 *    refresh · more · info / prev-next driven by the mode registry.
 *
 * ```ts
 * import {
 *   CartonContextCard,
 *   StationContextBar,
 *   StationMoreDetails,
 *   StationHeaderToolbar,
 * } from '@/components/station/entity-context';
 * ```
 *
 * Thin adapters wire domain controllers → CartonContextCard:
 *   - Unbox / Triage → `LineCartonContextSection`
 *   - Testing → `TestingCartonHeader`
 *   - Shipping (active order) → `ShippingEntityContextHeader`
 *   - Packing (active order) → `PackOrderIdentity`
 *   - Review · Packing → `ReviewOrderIdentity` (`src/features/review/packer/`)
 *
 * Card implementation lives here. Pill class tokens stay in
 * `station-context-action-pill.ts` (import that module directly when needed).
 */

export { CartonContextCard } from './CartonContextCard';
export { StationContextBar } from './StationContextBar';
export { StationMoreDetails } from './StationMoreDetails';
export { StationHeaderToolbar } from './StationHeaderToolbar';
export {
  stationContextBarHostClass,
  stationMoreDetailsPaneHostClass,
  STATION_IDENTITY_INSET_TOP,
  STATION_IDENTITY_INSET_RIGHT,
  STATION_IDENTITY_SCROLL_CLEARANCE,
  STATION_IDENTITY_STACKED_SCROLL_CLEARANCE,
} from './station-identity-chrome';
export {
  WORKSPACE_MODES,
  type WorkspaceMode,
} from './workspace-mode-registry';
