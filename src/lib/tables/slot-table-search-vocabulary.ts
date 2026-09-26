/** What the ONE search box matches — engine law for every PRODUCT_TABLES peer. */
/** The minimum column shape this law reads — every family's model satisfies it. */
export interface SlotTableSearchColumn {
  key: string;
  fieldId?: string;
}

export interface SlotTableSearchVocabularySource<C extends SlotTableSearchColumn> {
  /** The MOUNTED columns. Bound tracks carry `fieldId`; chrome tracks do not. */
  columns: readonly C[];
  /**
   * The family's `(col) → fact` map. This is where a compound row's title,
   * identity, state and date stamp name the fact they paint. Generic in the
   * column type so a family can keep its own narrowed model.
   */
  sortFactFor: (col: C) => string | null;
  /** Bound under-title field ids — painted inside the item cell, not as tracks. */
  subtitleFieldIds?: readonly string[];
  /** Facts the family's ADAPTER paints that no track and no subtitle names — the fourth and last source. */
  adapterPaintedFieldIds?: readonly string[];
}

/**
 * Every fact id the operator can read off a row, de-duplicated, in mount order
 * (bound track, then its structural fact, then the subtitle band, then the
 * adapter's own painted facts).
 */
export function slotTableSearchFactIds<C extends SlotTableSearchColumn>({
  columns,
  sortFactFor,
  subtitleFieldIds,
  adapterPaintedFieldIds,
}: SlotTableSearchVocabularySource<C>): string[] {
  const ids = new Set<string>();
  for (const col of columns) {
    if (col.fieldId) ids.add(col.fieldId);
    const structural = sortFactFor(col);
    if (structural) ids.add(structural);
  }
  for (const fieldId of subtitleFieldIds ?? []) ids.add(fieldId);
  for (const fieldId of adapterPaintedFieldIds ?? []) ids.add(fieldId);
  return [...ids];
}
