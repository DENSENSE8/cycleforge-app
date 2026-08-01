/**
 * Refresh domains — the typed replacement for `app-refresh-data`.
 *
 * There was never an `['app-data']` query key. `app-refresh-data` was a single
 * global broadcast with **ten** listeners spanning eight unrelated data domains,
 * so every emit — a Zoho sync, a photo move, a walk-in cart change — woke the
 * repair list, the packer logs, the replenish counts, the work-order calendar
 * and the phone history alike. Each site now names the domains it actually
 * touched, and only those listeners run.
 *
 * A domain is **what changed**, not who is watching. Emitters name the
 * consequence of their write; listeners subscribe to the domain they render.
 * Neither has to know the other exists.
 *
 * Adding a domain is one entry here plus at least one emitter and one listener —
 * the guard test fails on a domain with nobody on either end, so a domain that
 * loses its last consumer cannot rot in place.
 */

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

/**
 * Convenience bundles for writes that genuinely fan out.
 *
 * These are **not** a licence to re-broadcast: each bundle is a claim that one
 * write really does change all of those domains. Reach for a bundle only when
 * that is true, and prefer naming the domains at the call site when it is not.
 */
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
