/**
 * The FAMILY RECORD — one entity's whole slot-table registration, as DATA.
 * Operator 2026-09-15: *"focus on the base and the roots … so I would be able
 */

import type { FieldCatalog, FieldDef, FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

/** The compound skeleton's four DATA chrome tracks — the ones a family paints its own facts into. */
export type SlotTableChromeKey = 'fulfillment' | 'item' | 'dates' | 'state';

/** What a family paints into one chrome header. */
export interface SlotTableChromeBinding {
  /** Catalog field id this header paints and sorts by. */
  field?: string;
  /** The desk's word, when it differs from the bound field's catalog label. */
  label?: string;
  /** The narrow word for the grid header, when it differs from {@link label}. */
  gridLabel?: string;
  /**
   * Paint hint for the cell, when the chrome track shows a typed value the
   * bound field does not describe (a computed fill percentage as a number).
   */
  displayType?: FieldDisplayType;
  /**
   * `false` when this header paints no fact on this desk — inert chrome, no
   * click-to-sort, and `SLOT_TABLE_PAINT_LAW.headerSort` is satisfied because
   * the header is blank rather than a dead sort over a painted fact.
   */
  sortable?: false;
}

/** The identity column's header word — the engine's, on every peer. */
export const SLOT_TABLE_ID_HEADER_WORD = 'Id' as const;

/** What a family may say about the IDENTITY header: */
export interface SlotTableIdentityBinding {
  /** Catalog field id the id chip paints and sorts by. Defaults to the layout's identity. */
  field?: string;
}

/**
 * One entity family's registration. The mount passes this to
 * {@link useSlotTableLayout} and to the column engine; nothing else about the
 * family is declared anywhere.
 */
export interface SlotTableFamily {
  /** The `PRODUCT_TABLES` / `tableLayouts` key ('orders', 'sku-bins', …). */
  tableId: string;
  catalog: FieldCatalog;
  productLayout: SlotLayout;
  /** The ONE morph this mount can paint. */
  paintMorph: SlotLayout['morph'];
  /** Fallback identity-row copy when the identity field is missing. */
  identityFallbackLabel: string;
  /**
   * Band headings for the Fields popover. The compound default ("Status
   * columns" / "Under the title") reads wrong on a sheet, where subtitle
   * bindings open real columns.
   */
  bandLabels?: { status?: string; subtitle?: string };
  /** What this family paints into the shared chrome headers. */
  chrome?: { fulfillment?: SlotTableIdentityBinding } & Partial<
    Record<Exclude<SlotTableChromeKey, 'fulfillment'>, SlotTableChromeBinding>
  >;
}

/** The catalog field a chrome header binds, or null when it paints no fact. */
export function slotTableChromeField(
  family: SlotTableFamily,
  key: SlotTableChromeKey,
): FieldDef | null {
  if (key === 'fulfillment') {
    return slotTableIdentityField(family, family.productLayout);
  }
  const binding = family.chrome?.[key];
  if (binding?.sortable === false) return null;
  if (!binding?.field) return null;
  return family.catalog.find((f) => f.id === binding.field) ?? null;
}

/**
 * The identity field of a MOUNTED layout — the fact the `fulfillment` chip
 * shows. Reads the effective layout, not the product default, because a saved
 * view may rebind identity.
 */
export function slotTableIdentityField(
  family: SlotTableFamily,
  layout: SlotLayout,
): FieldDef | null {
  const fieldId = family.chrome?.fulfillment?.field ?? layout.identityFieldId;
  return family.catalog.find((f) => f.id === fieldId) ?? null;
}
