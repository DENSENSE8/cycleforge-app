/** Tech-All field catalog — the bindable cross-store triage facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const TECH_ALL_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'tech-all.item',
    family: 'tech-all',
    label: 'Item',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'id' },
  },
  {
    id: 'tech-all.type',
    family: 'tech-all',
    label: 'Type',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'typeLabel', code: 'type' },
  },
  {
    id: 'tech-all.stage',
    family: 'tech-all',
    label: 'Stage',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'stage' },
  },
  // A RANK, not a magnitude: lower means do it first. That inverts the house
  // default direction for a number, and the inversion rides the FACT — see
  // `defaultDirForTechAllColumn`.
  {
    id: 'tech-all.urgency',
    family: 'tech-all',
    label: 'Urgency',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'urgencyRank' },
  },
];

/** The PRODUCT default Tech-All layout — visual parity with the retired hand model (`select · identity · type · stage · urgency`), which is… */
export const TECH_ALL_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'tech-all.item',
  statusBindings: [
    { fieldId: 'tech-all.type' },
    { fieldId: 'tech-all.stage' },
    { fieldId: 'tech-all.urgency' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Tech · All entry. */
export const TECH_ALL_TABLE_LAYOUT_ID = 'tech-all';
