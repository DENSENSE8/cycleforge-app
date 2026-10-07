/** Refresh domains — the typed replacement for `app-refresh-data`. */

/** Every refresh domain. Alphabetical; the guard pins emitters + listeners. */
export const REFRESH_DOMAINS = [
  /** Outbound order tables — pending / unshipped / shipped / FBA queues. */
  'orders.outbound',
  /** Packer station logs. */
  'packer.logs',
  /** Receiving lines list (the station + history tables). */
  'receiving.lines',
  /** PO lines inside an open receiving workspace. */
  'receiving.poLines',
  /** Repair orders + queue. */
  'repairs',
  /** Replenish sidebar counts (need-to-order). */
  'replenish',
  /** Quality Control lines this operator opened / recorded results on (the QC Recent rail). */
  'testing.lines',
  /** Work-order assignments + the scheduling calendar. */
  'work-orders',
] as const;

export type RefreshDomain = (typeof REFRESH_DOMAINS)[number];

/**
 * The DOM event the bus rides. One event name for every domain — subscribers
 * filter on the payload, so adding a domain never adds a listener to `window`.
 */
export const REFRESH_EVENT = 'cf:refresh' as const;

export interface RefreshEventDetail {
  domains: readonly RefreshDomain[];
}

/** Convenience bundles for writes that genuinely fan out. */
export const REFRESH_BUNDLES = {
  /**
   * An order moved through the outbound pipeline (packed, shipped, assigned).
   * The order tables and the packer log that records the work all read the same rows.
   */
  outboundOrderWrite: ['orders.outbound', 'packer.logs'],
  /**
   * A carton / PO line changed. The receiving list and any open workspace read
   * the same rows.
   */
  receivingWrite: ['receiving.lines', 'receiving.poLines'],
} as const satisfies Record<string, readonly RefreshDomain[]>;
