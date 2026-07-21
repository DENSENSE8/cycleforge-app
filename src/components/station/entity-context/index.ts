/**
 * Station entity-context — **SoT**.
 *
 * 1. **Identity** — {@link CartonContextCard}: condensed one-row listing · PO# ·
 *    tracking · CLAIM · photos · platform/type/priority. Every station that shows
 *    inbound carton **or** Shipping active-order chrome composes this — never fork
 *    a parallel header.
 * 2. **Bookmark chrome** — {@link StationContextBar} + {@link StationMoreDetails}:
 *    sticky identity bookmark + corner utilities flush under GlobalHeader
 *    (`density="bar"`). Mount **above** StationWorkbench; do not put identity in
 *    the workbench `entityContext` / `toolbar` slots for Unbox-family stations.
 *
 * ```ts
 * import {
 *   CartonContextCard,
 *   StationContextBar,
 *   StationMoreDetails,
 * } from '@/components/station/entity-context';
 * ```
 *
 * Thin adapters wire domain controllers → CartonContextCard:
 *   - Unbox / Triage → `LineCartonContextSection`
 *   - Testing → `TestingCartonHeader`
 *   - Shipping (active order) → `ShippingEntityContextHeader`
 *   - Packing (active order) → `PackOrderIdentity`
 *   - Local pickup → `PickupEntityContextHeader`
 *
 * Card implementation stays under `receiving/workspace/line-edit/` (claim, photos,
 * classify, receiving catalogs). This barrel is the public waist so stations
 * import a station path, not a receiving-private deep path.
 */

export { CartonContextCard } from '@/components/receiving/workspace/line-edit/CartonContextCard';
export { StationContextBar } from './StationContextBar';
export { StationMoreDetails } from './StationMoreDetails';
