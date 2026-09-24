/**
 * The FAMILY RECORD — one entity's whole slot-table registration, as DATA.
 *
 * Operator 2026-09-15: *"focus on the base and the roots … so I would be able
 * to use the same engine across the entire codebase without any further forks
 * or issues when I bring up and stand up a slot data table in a different
 * page."* This module is that base.
 *
 * ## What it replaces
 *
 * Standing a table up used to cost a family two hand-written modules before it
 * painted a single row:
 *
 * - `use{Family}TableLayout.ts` — 47 of them, **zero logic** between them: six
 *   data keys handed to {@link useSlotTableLayout}. Measured 2026-09-15.
 * - `{family}-grid-layout.ts` — 41 of them, and for the 25 that mount the
 *   canonical compound skeleton the delta against the engine's own output was
 *   nothing but STRINGS: a chrome relabel, a chrome sort fact, the identity
 *   morph every one of them re-typed identically.
 *
 * Both are the fork `TABLE_ENGINE_LAW.descriptorCarriesDataNotBehavior` names:
 * a family restating engine behavior in order to supply four labels. Stated as
 * a record instead, the behavior stays in ONE implementation
 * (`slot-table-columns.ts`) and the family contributes what only it knows.
 *
 * ## The rule this type enforces
 *
 * Every field here is DATA — a string, an id, an enum, a catalog. There is no
 * render prop, no resolver callback, no `override?: (col) => col`. That is not
 * an accident of the current families: the moment a descriptor can carry a
 * closure, the per-family module walks back in wearing a property, and the
 * engine is polymorphic again. A capability the engine lacks is added to the
 * ENGINE, for everyone.
 *
 * A family therefore registers: this record, a row adapter
 * (`row → CompoundRowView`), a slot resolver, and a registry entry. Nothing
 * else — {@link TABLE_ENGINE_ACCEPTANCE}.
 */

import type { FieldCatalog, FieldDef, FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

/**
 * The compound skeleton's four DATA chrome tracks — the ones a family paints
 * its own facts into.
 *
 * `select`, `thumb` and `_fill` are absent on purpose: they are structural
 * (`isSlotTableChromeTrack`), carry no fact, and never sort. A family that
 * wants to say something about them is asking for a geometry cut, which is
 * `COMPOUND_SKELETON_FILTER_DEBT`, not a binding.
 */
export type SlotTableChromeKey = 'fulfillment' | 'item' | 'dates' | 'state';

/**
 * What a family paints into one chrome header.
 *
 * `field` is the whole point: a chrome track BINDS a catalog fact exactly as a
 * slot track does, so the header's word and the fact its click sorts by come
 * from the same place and cannot drift. Of the 98 chrome tracks measured
 * across the canonical families, 79 read their label straight off the bound
 * field — {@link label} exists for the 19 where the desk's word differs from
 * the catalog's ("Item" over a track that sorts by SKU), not as a licence to
 * name a header something the catalog never heard of.
 */
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

/**
 * What a family may say about the IDENTITY header: which fact it binds, and
 * nothing else.
 *
 * There is deliberately no `label` here. The word is `Id` on every peer
 * (`SLOT_TABLE_ID_HEADER_WORD`), and a `label?: string` on this key would be
 * the exact door the 22 column modules walked through — the type refuses it,
 * so the drift cannot come back as a property after it was deleted as a
 * module.
 */
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
  /** The `PRODUCT_TABLES` / `tableLayouts` key ('orders', 'sku-exceptions', …). */
  tableId: string;
  catalog: FieldCatalog;
  productLayout: SlotLayout;
  /**
   * The ONE morph this mount can paint. A stored document with any other
   * morph — hand-written prefs, an older build — must not open tracks nothing
   * renders (or drop tracks a sheet needs); coerce, don't crash. The org write
   * gate refuses foreign morphs outright (`slotMorphsFor`); staff prefs have
   * no server-side morph gate, so the client coercion is the guard.
   */
  paintMorph: SlotLayout['morph'];
  /** Fallback identity-row copy when the identity field is missing. */
  identityFallbackLabel: string;
  /**
   * Band headings for the Fields popover. The compound default ("Status
   * columns" / "Under the title") reads wrong on a sheet, where subtitle
   * bindings open real columns.
   */
  bandLabels?: { status?: string; subtitle?: string };
  /**
   * What this family paints into the shared chrome headers.
   *
   * `fulfillment` is narrower than the rest on purpose: it takes a FACT and
   * no word, because the identity header is the engine's `Id`. Omit it and
   * the engine binds the layout's identity field, which is what all 22
   * column modules hand-wrote before this law.
   */
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
