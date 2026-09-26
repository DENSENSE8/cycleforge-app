/**
 * The peers of the mobile exoskeleton law (`detail-hub-law.ts`): every phone
 * route that is ONE scanned entity's record. A ported peer holds at zero
 * violations; an unported peer is the baseline the law shrinks.
 *
 * Porting a peer: move its hub onto `DetailHubScreen`, give it an `/info`
 * screen, flip `status` to `'ported'`, and drop
 * {@link DETAIL_HUB_UNPORTED_BASELINE} by one in the same commit. The guard
 * refuses a peer that passes while still marked unported, so the baseline
 * cannot silently rot above the real count.
 */

export interface DetailHubPeer {
  /** What was scanned. */
  entity: string;
  route: string;
  /** Repo-relative hub page. */
  hub: string;
  /** Repo-relative `/info` page — required once ported. */
  info: string | null;
  status: 'ported' | 'unported';
}

export const DETAIL_HUB_PEERS: readonly DetailHubPeer[] = [
  {
    entity: 'repair',
    route: '/m/rs/[id]',
    hub: 'src/app/m/(shell)/rs/[id]/page.tsx',
    info: 'src/app/m/(shell)/rs/[id]/info/page.tsx',
    status: 'ported',
  },
  {
    entity: 'SKU exception',
    route: '/m/on-hold/[sku]',
    hub: 'src/app/m/(shell)/on-hold/[sku]/page.tsx',
    info: 'src/app/m/(shell)/on-hold/[sku]/info/page.tsx',
    status: 'ported',
  },
  { entity: 'unit', route: '/m/u/[id]', hub: 'src/app/m/(shell)/u/[id]/page.tsx', info: null, status: 'unported' },
  {
    entity: 'handling unit',
    route: '/m/h/[id]',
    hub: 'src/app/m/(shell)/h/[id]/page.tsx',
    info: null,
    status: 'unported',
  },
  {
    entity: 'receiving carton',
    route: '/m/r/[id]',
    hub: 'src/app/m/(shell)/r/[id]/page.tsx',
    info: 'src/app/m/(shell)/r/[id]/info/page.tsx',
    status: 'ported',
  },
  {
    entity: 'bin / barcode',
    route: '/m/b/[barcode]',
    hub: 'src/app/m/(shell)/b/[barcode]/page.tsx',
    info: null,
    status: 'unported',
  },
  {
    // A scanned location (operator 2026-09-25: "a full page, not just a
    // mounted display at the bottom"). Not `/m/b/`: proxy rewrites it to /bin/.
    entity: 'location',
    route: '/m/loc/[code]',
    hub: 'src/app/m/(shell)/loc/[code]/page.tsx',
    info: 'src/app/m/(shell)/loc/[code]/info/page.tsx',
    status: 'ported',
  },
  {
    // A scanned Amazon FBA unit label; the dock reprints it at the print station.
    entity: 'FBA label (FNSKU)',
    route: '/m/fnsku/[fnsku]',
    hub: 'src/app/m/(shell)/fnsku/[fnsku]/page.tsx',
    info: 'src/app/m/(shell)/fnsku/[fnsku]/info/page.tsx',
    status: 'ported',
  },
  {
    entity: 'order',
    route: '/m/orders/[orderId]',
    hub: 'src/app/m/(shell)/orders/[orderId]/page.tsx',
    info: 'src/app/m/(shell)/orders/[orderId]/info/page.tsx',
    status: 'ported',
  },
  {
    // The pack job wears the order's exoskeleton: its card, doors and /info
    // are the order hub's; the dock is Paperwork · Take photos.
    entity: 'order (pack job)',
    route: '/m/pack/start/[orderId]',
    hub: 'src/app/m/(shell)/pack/start/[orderId]/page.tsx',
    info: 'src/app/m/(shell)/orders/[orderId]/info/page.tsx',
    status: 'ported',
  },
  {
    // One carrier tracking number (`shipping_tracking_numbers.id`) — the
    // phone twin of the Shipped desk record; an unmatched pack scan resolves
    // from its dock.
    entity: 'package (tracking number)',
    route: '/m/shipping/shipments/[shipmentId]',
    hub: 'src/app/m/(shell)/shipping/shipments/[shipmentId]/page.tsx',
    info: 'src/app/m/(shell)/shipping/shipments/[shipmentId]/info/page.tsx',
    status: 'ported',
  },
  {
    entity: 'scan-out order',
    route: '/m/id/scan-out/[orderId]',
    hub: 'src/app/m/(shell)/id/scan-out/[orderId]/page.tsx',
    info: null,
    status: 'unported',
  },
];

/**
 * Unported entity hubs when the law landed (2026-09-24). SHRINK-ONLY: raising
 * it is the one edit this module exists to stop. At 0 every scanned thing on a
 * phone wears the exoskeleton by machine.
 */
export const DETAIL_HUB_UNPORTED_BASELINE = 4;
