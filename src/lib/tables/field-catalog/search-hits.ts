/**
 * Search-hits field catalog — the bindable facts of ONE cross-entity find
 * result, as DATA.
 *
 * Off a hand-rolled `<ul>` in `src/components/search/SearchResultsSurface.tsx`
 * on 2026-09-12. That markup was a loose list of `SearchHitLine` links with no
 * header sort, no Fields picker, no org binding and no column edge — and it
 * wanted columns, which is `READ_PLANE_IS_A_MOUNT` in one sentence: a display
 * surface earns sort, selection and verbs by JOINING the engine, not by being
 * promised to stay inert.
 *
 * ## One family over six entity types
 *
 * A `/search` row may be an order, a serial unit, a receiving carton, a SKU, a
 * repair or an FBA shipment. That is not six families: the ROW SHAPE is one
 * wire type ({@link AiSearchHit} — id, entityType, title, subtitle, href and a
 * flat facet bag), and heterogeneity is resolved at the ADAPTER boundary,
 * which is invariant 1 (`ENGINE_IS_MONOMORPHIC`) verbatim. Registering six
 * families for one wire shape would be six registrations of one dataset,
 * drifting — the fork invariant 2 names.
 *
 * So the catalog is the UNION of the facets the search wire carries
 * (`global-entity-search.ts`), and a hit that has none of a fact resolves it
 * to `null` and paints the honest empty face.
 *
 * ## Where each retired cell landed
 *
 * The retired line painted Status · Title · Entity noun · Identity · Age.
 *
 * | cell         | where it paints on the compound row                        |
 * |--------------|------------------------------------------------------------|
 * | Identity     | the IDENTITY slot = the `fulfillment` track, LEADING       |
 * | Status       | the STATE pill (`stateLabel` / `stateTone` on the adapter) |
 * | Title        | the item cell TITLE                                        |
 * | Entity noun  | `status:1` — a COLUMN, never a line repeated under a title |
 * | Age          | the DATES chrome: civil day over clock, exact stamp on tip |
 *
 * The entity noun moving from a per-row subtitle to a column is the whole
 * ruling: under a title it is the same word on every row of a scoped list, so
 * it costs a line and says nothing; as a track in a MIXED list it is the
 * discriminator, it sorts, and it costs no line at all.
 *
 * ## Facts this wire does not carry
 *
 * Bin and quantity are not on `AiSearchHit` and no searcher in
 * `global-entity-search.ts` emits them. They are deliberately NOT catalog
 * entries: a bound field whose resolver can only answer `null` is a
 * permanently dashed track, which is the dead-header failure this repo has
 * already paid for twice. They become fields the day the search doc carries
 * them.
 *
 * Resolution is `./search-hits-resolve.ts`, kept separate so this module stays
 * a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SEARCH_HITS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'search-hits.identifier',
    family: 'search-hits',
    label: 'Id',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: {
      order: 'facets.order_id',
      po: 'facets.po_number',
      sourceOrder: 'facets.source_order_id',
      serial: 'facets.serial_number',
      tracking: 'facets.tracking_number',
      fallback: 'id',
    },
  },
  {
    id: 'search-hits.entity',
    family: 'search-hits',
    label: 'Type',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'entityType' },
  },
  {
    id: 'search-hits.status',
    family: 'search-hits',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.status' },
  },
  {
    id: 'search-hits.description',
    family: 'search-hits',
    label: 'Description',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'title' },
  },
  {
    id: 'search-hits.channel',
    family: 'search-hits',
    label: 'Channel',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.source_platform' },
  },
  {
    id: 'search-hits.tracking',
    family: 'search-hits',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.tracking_number' },
  },
  {
    id: 'search-hits.serial',
    family: 'search-hits',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.serial_number' },
  },
  {
    id: 'search-hits.condition',
    family: 'search-hits',
    label: 'Condition',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.condition_grade' },
  },
  {
    /**
     * WHY this row is in the list — the field the query matched. On a find
     * plane that is an operational fact, not metadata: it is the difference
     * between "this order matched because you typed its tracking number" and
     * "this order matched on a product word", and an operator who cannot see
     * it re-reads the whole row to work it out.
     */
    id: 'search-hits.matched',
    family: 'search-hits',
    label: 'Matched',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'matchField' },
  },
  {
    id: 'search-hits.when',
    family: 'search-hits',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.happened_at' },
  },
];

/**
 * The PRODUCT default — the operator's requested reading order, as far as the
 * shared skeleton allows it.
 *
 * `COMPOUND_COLUMN_KEYS` is a HARD RULE (`select · ids · image · title · dates
 * · status · slack`), and a family re-ordering it would be the geometry fork
 * `compound-columns.ts` exists to refuse. So the IDENTIFIER leads, as asked,
 * and Status is the shared STATE pill five tracks over rather than track two:
 * moving the pill for one family is exactly the "layout difference walking
 * back in" the engine refuses, and the engine gaining a per-family track order
 * is a change to every desk in the product, not to this mount.
 *
 * The three bound tracks are the operational band: what KIND of record this
 * is, its carrier handle, and WHY the query matched it. Everything else the
 * find plane knows is painted by chrome the skeleton already mounts:
 *
 * - the identifier — the identity chip (`identityFieldId`);
 * - the description — the item cell TITLE;
 * - the status — the state pill (adapter chrome);
 * - `when` — the DATES chrome: civil day on the Hash line, clock on the
 *   Calendar line, and the full instant on both hovers. That is the law's
 *   "carry the exact timestamp with the relative stamp", and a bound `when`
 *   track beside it would print the same instant twice.
 *
 * All five stay catalog FACTS, so their headers sort and the one search box
 * matches them, and a staffer who wants an explicit Status or When column has
 * free slots to bind it into.
 *
 * Serial and condition are the SUBTITLE line — the two facts that used to be
 * buried inside a prose subtitle, now bound under the title where the entity
 * noun was.
 */
export const SEARCH_HITS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'search-hits.identifier',
  statusBindings: [
    { fieldId: 'search-hits.entity' },
    { fieldId: 'search-hits.tracking' },
    { fieldId: 'search-hits.matched' },
  ],
  subtitleBindings: [
    { fieldId: 'search-hits.serial' },
    { fieldId: 'search-hits.condition' },
  ],
  amountFieldId: null,
};

/** The tableId this catalog serves — `PRODUCT_TABLES`' find-plane entry. */
export const SEARCH_HITS_TABLE_LAYOUT_ID = 'search-hits';
