/**
 * Tech-All field catalog — the bindable cross-store triage facts, as DATA.
 * Wave 1.4's fifth family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `tech-all` row: "a strip
 * over several stores. Still one information table; status slots are the strip,
 * not a private All-only column file.").
 *
 * Every entry names a fact `TechAllTriageRow` already carries — a view model
 * the triage builder assembles from four different stores, which is exactly why
 * the strip must be slots: the row is already a normalization, and a private
 * column file on top of it would be a second one.
 *
 * Tech-All is a SHEET morph. `tech-all.item` is the IDENTITY fact — the row's
 * stable `${type}:${entityId}` handle — and the structural Identity track paints
 * the title over its quiet second line (SKU · customer · tracking).
 */

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

/**
 * The PRODUCT default Tech-All layout — visual parity with the retired hand
 * model (`select · identity · type · stage · urgency`), which is the whole
 * strip: what kind of work it is, where it has got to, and how soon.
 * Guard: `tech-all.test.ts` parses this against the catalog.
 */
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
