/**
 * What the ONE search box matches — engine law for every PRODUCT_TABLES peer.
 *
 * `DataTable`'s search claims to cover "exactly what the operator can see", and
 * for a while it did not: it read the `fieldId` of each mounted column, which
 * is narrower than what a compound row PAINTS in two ways.
 *
 * 1. **Structural facts carry no `fieldId`.** A compound row's title, its
 *    identity chip, its state pill and its date stamp are painted by chrome
 *    tracks the skeleton owns (`item` / `fulfillment` / `state` / `dates`), and
 *    a family fills them by declaring a fact in {@link sortFactFor}. So typing
 *    a product title matched nothing on the very cell being read. The mapping
 *    already exists because those headers must click-sort
 *    (`SLOT_TABLE_PAINT_LAW.headerSort`) — a header that sorts a fact the
 *    search box cannot find is one fact with two different answers.
 * 2. **Subtitle facts are not tracks.** Compound paints the under-title band
 *    inside the item cell and `materializeTracks` opens `subtitle:N` columns
 *    for the SHEET morph only, so the line qty — the most-read number on a
 *    countable row — was unsearchable on every compound peer.
 *
 * The union of the three sources is the vocabulary. Still keyed to the LAYOUT
 * and never to a hardcoded list: an org that binds notes searches notes, and
 * one that unbinds a fact stops matching on it.
 *
 * A pure function rather than an inline `useMemo` body because this IS the law
 * and it is the same law on 47 peers — `slot-table-search-vocabulary.test.ts`
 * pins it, which an expression inside a hook cannot be.
 */
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
  /**
   * Facts the family's ADAPTER paints that no track and no subtitle names —
   * the fourth and last source.
   *
   * The Id track stacks TWO identifiers and `sortFactFor` can only name one,
   * so a family using `identitySubFace` (Inventory › Stock puts the SKU under
   * the bin code) has a visible, copyable handle the search box would
   * otherwise never match. Same rule as the other three: name the FACT, not
   * the text, so the resolver stays the single source for search and sort.
   */
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
