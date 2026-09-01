/**
 * Ready field catalog — the bindable recently-tested facts, as DATA. The
 * FOURTH family on the slot engine and the first of the Wave-3 ports
 * (`docs/kill-list/07-slot-table-hand-models.md` — the `ready` row;
 * `docs/todo/seller-table-program-PLAN.md` wave 1.1).
 *
 * Ready is FIRST in that wave and not for size: `READY_GRID_COLUMNS` mounted a
 * literal `{ key: 'tested', … }` track and painted `data-col="tested"` — the
 * forbidden pattern, live, off To-ship, teaching every next agent to copy it.
 * A track whose key IS a field is a frozen layout: an org cannot unbind Tested
 * or bind Velocity without a deploy.
 *
 * Every entry names a fact the channel-allocation history feed already returns
 * on `AllocationHit`; nothing here mints a column. `paths` documents the row
 * properties the resolver reads — resolution itself is `./ready-resolve.ts`,
 * kept separate so this module stays a LEAF (the org layout API route imports
 * it server-side; the grid layout module imports it at module scope — neither
 * may drag in client code or the resolver's formatting chain).
 *
 * Ready is a SHEET morph. `ready.unit` is the IDENTITY fact — the unit a hit
 * is about, which the structural Product track paints as title + identifier
 * trail (SKU · serial · FNSKU · ASIN); it is not a free slot. Status bindings
 * open `status:N` after Product and before the structural Stage-FBA action
 * track; subtitle bindings would open `subtitle:N` in the same gap, ahead of
 * them.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const READY_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'ready.unit',
    family: 'ready',
    label: 'Unit',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { sku: 'sku', serial: 'serialNumber', fnsku: 'fnsku', asin: 'asin', fallbackId: 'entityId' },
  },
  {
    id: 'ready.verdict',
    family: 'ready',
    label: 'Verdict',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'verdict' },
  },
  {
    id: 'ready.destination',
    family: 'ready',
    label: 'Destination',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'disposition', fallback: 'allocationState', unitStatus: 'unitStatus' },
  },
  // The WHY behind Destination — rationale you open when a destination
  // surprises you, not a column you scan. The hand model shipped both
  // `tier: 'optional'` (off by default); here that is simply an unbound fact.
  {
    id: 'ready.reasons',
    family: 'ready',
    label: 'Reasons',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'reasons' },
  },
  {
    id: 'ready.velocity',
    family: 'ready',
    label: 'Velocity',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'velocityTier' },
  },
  {
    id: 'ready.condition',
    family: 'ready',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'conditionGrade' },
  },
  {
    id: 'ready.tested',
    family: 'ready',
    label: 'Tested',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'testedAt', by: 'testedByName' },
  },
];

/**
 * The PRODUCT default Ready layout — visual parity with the retired hand
 * model's CORE view (`select · title · verdict · destination · condition ·
 * tested · action`): what the operator scanning tested history actually asks —
 * which unit, did it pass, where is it going, what grade, and when. `reasons`
 * and `velocity` stay in the catalog for an org or staffer to bind, which is
 * the old `tier: 'optional'` ship-hidden set expressed as unbound facts.
 * `amountFieldId` is null — tested history carries no money track.
 * Guard: `ready.test.ts` parses this against the catalog.
 */
export const READY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'ready.unit',
  statusBindings: [
    { fieldId: 'ready.verdict' },
    { fieldId: 'ready.destination' },
    { fieldId: 'ready.condition' },
    { fieldId: 'ready.tested' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Ready entry. */
export const READY_TABLE_LAYOUT_ID = 'ready';
