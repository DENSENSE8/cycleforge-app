/**
 * Station entity-context header — **SoT**.
 *
 * The condensed one-row identity bar from Unbox (listing · PO# · tracking ·
 * CLAIM · photos · platform/type/priority). Every station that shows inbound
 * carton **or** `/test` Shipping active-order chrome composes this — never fork
 * a parallel header.
 *
 * ```ts
 * import { CartonContextCard } from '@/components/station/entity-context';
 * ```
 *
 * Thin adapters wire domain controllers → this presentational card:
 *   - Unbox / Triage → `LineCartonContextSection`
 *   - Testing → `TestingCartonHeader`
 *   - Shipping (active order) → `ShippingEntityContextHeader`
 *   - Packing (active order) → `PackingEntityContextHeader`
 *
 * Implementation stays under `receiving/workspace/line-edit/` (claim, photos,
 * classify, receiving catalogs). This barrel is the public waist so stations
 * import a station path, not a receiving-private deep path.
 */

export { CartonContextCard } from '@/components/receiving/workspace/line-edit/CartonContextCard';
