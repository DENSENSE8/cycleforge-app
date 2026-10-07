/**
 * THE ROUTE TREE — one source for every URL, nav name and domain word
 * (owner 2026-10-03: "the Design System MCP server would house the exact
 * routing … and vocabulary", plan: docs/routing/ROUTE-TREE-PHASE-1-PLAN.md).
 *
 * Four consumers read this module and nothing else:
 *   1. the app — the path constants and builders below are the only way a
 *      registered URL is written;
 *   2. verify `Routes` — `scripts/route-tree-guard.ts` checks the tree against
 *      the file system, the phone menu and the literal-path baseline;
 *   3. the design MCP — `ds_route`, `ds_vocabulary` and `ds_route_tree` spawn
 *      the same guard, so the answer a session reads cannot disagree with the
 *      gate;
 *   4. session start — `--digest` prints the lane summary every session sees.
 *
 * Phase 1 began with the Warehouse lane on the phone; first-class Sales and
 * Scan stations destinations join the same registry. Every node carries the path
 * it LIVES at today (`path`) and the canonical path it MOVES to (`target`);
 * phase 2 flips the routes and turns the old paths into permanent aliases
 * (printed QR codes carry them — an alias is never deleted).
 *
 * Grow this file; never re-declare a registered path or term anywhere else.
 */

// ── Vocabulary ──────────────────────────────────────────────────────────────

export type TermId =
  | 'customer'
  | 'quality-control'
  | 'warehouse'
  | 'stock'
  | 'room'
  | 'aisle'
  | 'bay'
  | 'level'
  | 'position'
  | 'location'
  | 'rack'
  | 'container'
  | 'lpn'
  | 'location-labels'
  | 'print-station'
  | 'support-item'
  | 'internal-record'
  | 'check-in'
  | 'inbound'
  | 'outbound'
  | 'purchase'
  | 'fulfilled-order'
  | 'platform'
  | 'record';

export interface VocabularyTerm {
  id: TermId;
  /** The one word the UI paints. */
  label: string;
  plural: string;
  definition: string;
  /** URL segment (collections) or query param (address parts). */
  segment?: string;
  /** Words that must not stand in for this term in nav labels or new UI copy. */
  banned: readonly string[];
  /** Industry names for the same thing — for the reader, never for the UI. */
  industry?: string;
  /** Lane that owns the term's canonical route. */
  owner: LaneId;
  decided: { by: 'owner'; date: string; note?: string };
}

export const VOCABULARY: readonly VocabularyTerm[] = [
  {
    id: 'customer',
    label: 'Customer',
    plural: 'Customers',
    definition: 'A buyer identity joined to contact details, channel identities and complete order history.',
    segment: 'customers',
    banned: ['account (as the customer record name)', 'contact (as the customer record name)'],
    owner: 'sales',
    decided: { by: 'owner', date: '2026-10-04', note: 'Customers is a first-class Sales destination on desktop and mobile.' },
  },
  {
    id: 'quality-control',
    label: 'Quality control',
    plural: 'Quality control',
    definition: 'The testing workflow for returned, repaired and newly unboxed serialized units.',
    segment: 'quality-control',
    banned: ['QC (as a navigation label)', 'testing (as the page name)'],
    owner: 'scan-stations',
    decided: { by: 'owner', date: '2026-10-04', note: 'Quality control is a first-class Scan stations destination; testing remains the work performed there.' },
  },
  {
    id: 'inbound',
    label: 'Inbound',
    plural: 'Inbound',
    definition: 'The scan direction for packages arriving at the door: a carrier label opens or confirms the arrival.',
    banned: ['In (as the scan direction)', 'receive (as the scan direction)'],
    owner: 'scan-stations',
    decided: { by: 'owner', date: '2026-10-04', note: 'The Scan switcher reads Inbound | Outbound on web and iOS.' },
  },
  {
    id: 'outbound',
    label: 'Outbound',
    plural: 'Outbound',
    definition: 'The scan direction for packages leaving the building: a scan confirms the shipment went out.',
    banned: ['Out (as the scan direction)', 'scan out (as the direction name)'],
    owner: 'scan-stations',
    decided: { by: 'owner', date: '2026-10-04', note: 'The Scan switcher reads Inbound | Outbound on web and iOS.' },
  },
  {
    id: 'purchase',
    label: 'Purchase',
    plural: 'Purchases',
    definition:
      'One purchase-order line we bought from a vendor (Zoho, eBay, Amazon, Walmart…), followed from ordered through delivered to unboxed — received or not.',
    banned: [],
    industry: 'purchase order (PO) line',
    owner: 'receiving',
    decided: {
      by: 'owner',
      date: '2026-10-05',
      note: 'Purchasing is its own Receiving mode at /purchasing (peer of Deliveries · Local Pickup · Repair service), never a Deliveries view. ⌘K also finds it by purchases, purchase orders, POs, unreceived, vendors.',
    },
  },
  {
    id: 'fulfilled-order',
    label: 'Fulfilled order',
    plural: 'Fulfilled orders',
    definition:
      'A channel order that left the building — scanned out at the dock, or marked shipped by its channel and never scanned out — followed from hand-off through carrier movement to delivered or returned. One row per order (its lines combined) or per order line.',
    banned: ['Shipped (as the page name)', 'package archive'],
    owner: 'fulfillment',
    decided: {
      by: 'owner',
      date: '2026-10-05',
      note: 'Fulfilled (/fulfilled) is the outbound twin of Purchasing: one datasheet, status chips over the header, carrier truth (No movement · Stalled · Untracked …). `/shipping/shipped` forwards here.',
    },
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    plural: 'Warehouse',
    definition: 'The lane for the building and everything stored in it: stock, locations, racks, containers.',
    segment: 'warehouse',
    banned: ['inventory (as a lane name)'],
    industry: 'D365 warehouse · SAP EWM warehouse number',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Inventory is renamed Warehouse; the URL tree grows from /m/warehouse.' },
  },
  {
    id: 'stock',
    label: 'Stock',
    plural: 'Stock',
    definition: 'One SKU\'s quantity at one location. "On hand" is the number; a stock row is what Adjust, Move and Photos edit.',
    segment: 'stock',
    banned: ['quant', 'inventory row', 'bin contents'],
    industry: 'SAP quant · D365 on-hand · Zoho stock on hand',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Stock is only stock: searchable, editable per location, never a list of empty places.' },
  },
  {
    id: 'room',
    label: 'Room',
    plural: 'Rooms',
    definition: 'The top of the address: a room or area that holds aisles (Room › Aisle › Bay › Level › Position).',
    segment: 'room',
    banned: ['zone', 'area', 'storage type'],
    industry: 'Zoho zone · D365 zone · SAP storage type',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Rooms over Zone.' },
  },
  {
    id: 'aisle',
    label: 'Aisle',
    plural: 'Aisles',
    definition: 'Second address part: a row of bays inside a room.',
    segment: 'aisle',
    banned: ['row'],
    industry: 'D365 location-format segment',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03' },
  },
  {
    id: 'bay',
    label: 'Bay',
    plural: 'Bays',
    definition: 'Third address part: one section of fixed racking in an aisle (Left / Right by parity).',
    segment: 'bay',
    banned: ['rack (for fixed racking)', 'section'],
    industry: 'D365 location-format segment',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03' },
  },
  {
    id: 'level',
    label: 'Level',
    plural: 'Levels',
    definition: 'Fourth address part: the shelf height inside a bay.',
    segment: 'level',
    banned: ['shelf (for fixed racking)'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: '"Shelf" stays only for a movable rack\'s tiers (RK12-3).' },
  },
  {
    id: 'position',
    label: 'Position',
    plural: 'Positions',
    definition: 'Fifth address part: the slot on a level.',
    segment: 'position',
    banned: ['slot', 'spot'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03' },
  },
  {
    id: 'location',
    label: 'Location',
    plural: 'Locations',
    definition: 'Any scannable address stock can sit at: a room-coded place (C0310300), a movable rack shelf (RK12-3) or a free-written place.',
    segment: 'locations',
    banned: ['bin', 'storage bin', 'slot'],
    industry: 'D365 location · SAP storage bin · Zoho bin location',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: '`/bin/*` survives only as an alias.' },
  },
  {
    id: 'rack',
    label: 'Rack',
    plural: 'Racks',
    definition: 'A MOVABLE rack (RK12) whose shelves are locations. Fixed racking is bays.',
    segment: 'racks',
    banned: ['bay racking', 'movable (as a label)'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Desktop ?tab=racks is the legacy BAY alias on printed QR codes; never reuse that query value.' },
  },
  {
    id: 'container',
    label: 'Tote',
    plural: 'Containers',
    definition: 'A tote (H-#### handling unit): holds units, moves between locations, is never itself a location.',
    segment: 'containers',
    banned: ['LPN (for a tote)', 'licence-plated box', 'handling unit (in UI copy)'],
    industry: 'SAP handling unit',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Totes are containers; LPNs are Receiving\'s.' },
  },
  {
    id: 'lpn',
    label: 'LPN',
    plural: 'LPNs',
    definition: 'License plate number: the R-* plate Receiving puts on an arriving carton.',
    segment: 'lpns',
    banned: ['licence (British spelling)', 'carton (as the record name — pending owner ruling)'],
    industry: 'WMS license plate number',
    owner: 'receiving',
    decided: { by: 'owner', date: '2026-10-03', note: 'LPNs are what Receiving introduced; spelling is "license".' },
  },
  {
    id: 'location-labels',
    label: 'Location labels',
    plural: 'Location labels',
    definition: 'Stickers for a location, a bay or a movable rack. Labels always name their owner; "Labels" alone is banned.',
    segment: 'labels',
    banned: ['labels (unqualified)', 'bin tags'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Labels belong to Locations, not to Stock.' },
  },
  {
    id: 'print-station',
    label: 'Print station',
    plural: 'Print stations',
    definition: 'A computer the org sends label and document jobs to; it prints them silently on its label / paper printers. Named once for the whole org.',
    segment: 'stations',
    banned: ['workstation', 'print server'],
    industry: 'ShipStation Connect workstation · PrintNode computer',
    owner: 'print-station',
    decided: { by: 'owner', date: '2026-10-04', note: 'One control plane for print stations, with print icons and solid org-wide names; G then switches Print station between printing (FNSKU labels) and managing (Stations).' },
  },
  // Tasks → Support (operator prompt 2026-10-04, the closed loop): the local record is the truth; a
  // provider's ticket number is optional metadata on it.
  {
    id: 'support-item',
    label: 'Support item',
    plural: 'Support items',
    definition:
      'One customer conversation or internal support record, stored locally with its messages, exact orders and one primary task (Support, /support). Zendesk, eBay, Amazon, Ecwid, email, phone and walk-in are transports for it, never its truth; "Zendesk #9942" is optional metadata.',
    segment: 'ticket',
    banned: ['ticket (as the Support record name)', 'case (as the Support record name)', 'Zendesk ticket (as the record name)', 'Update ticket (as a customer-visible action)'],
    industry: 'Zendesk ticket · Gorgias ticket · Help Scout conversation',
    owner: 'support',
    decided: {
      by: 'owner',
      date: '2026-10-04',
      note: 'Support is its own top-level workspace at /support (record /support?item=<support item id>), built on the local model; the old Zendesk console tree stays deleted and /?tab=ticket forwards here. "Conversation" is an accepted synonym for a customer Support item.',
    },
  },
  {
    id: 'internal-record',
    label: 'Internal record',
    plural: 'Internal records',
    definition:
      'A Support item that is not for a customer (purpose internal_record): staff notes and updates only — never a customer draft or send. Answers "Is this for a customer?" with No; the other answer is "Customer conversation".',
    banned: ['internal ticket', 'private ticket', 'note ticket'],
    owner: 'support',
    decided: { by: 'owner', date: '2026-10-04', note: 'Staff acknowledge the purpose; a suggestion never decides it.' },
  },
  {
    id: 'check-in',
    label: 'Check-in',
    plural: 'Check-ins',
    definition:
      'A proactive post-purchase Support item for one exact order (orders.id): opened when the order is delivered or picked up, chased until the customer answers or it is closed with a reason.',
    banned: ['survey', 'follow-up email (as the program name)', 'touch base'],
    owner: 'support',
    decided: { by: 'owner', date: '2026-10-04', note: 'Shown as the "Post-purchase check-ins" Support view.' },
  },
  {
    id: 'platform',
    label: 'Platform',
    plural: 'Platforms',
    definition: 'The marketplace or storefront an order came from (orders.account_source): Amazon, eBay, Ecwid, Shopify, Square.',
    segment: 'channel',
    banned: ['channel (as the order source label)', 'marketplace (as the column name)'],
    owner: 'fulfillment',
    decided: { by: 'owner', date: '2026-10-05', note: 'Channel renamed to Platform on sheets, facets and sort; the ?channel= param stays.' },
  },
  {
    id: 'record',
    label: 'Record',
    plural: 'Records',
    definition: 'One line of an inbound or outbound order, as the Records sheet shows it.',
    segment: 'records',
    banned: ['pasted list (as the page name)', 'row (as the thing a record is)'],
    owner: 'search',
    decided: {
      by: 'owner',
      date: '2026-10-06',
      note: 'The Records sheet (/records) replaces the Pasted list; a pasted list is one way of filling it (`?refs=`).',
    },
  },
] as const;

// ── Tree ────────────────────────────────────────────────────────────────────

export type LaneId = 'sales' | 'scan-stations' | 'warehouse' | 'receiving' | 'fulfillment' | 'search' | 'print-station' | 'tasks' | 'support';

export type RouteNodeKind =
  /** A lane: the menu group, and (target) its landing page. */
  | 'lane'
  /** A list of one kind of thing. */
  | 'collection'
  /** One thing, addressed by an id/code segment. */
  | 'record'
  /** A full-screen job on a collection or record (capture, builder, cleanup). */
  | 'task'
  /** A route kept only so old links land; it forwards to `forwardsTo`. */
  | 'compat';

export type RouteNodeStatus = 'live' | 'planned';

export interface RouteNode {
  id: string;
  parent: string | null;
  kind: RouteNodeKind;
  /** The nav / heading name. Records are named by their data, not here. */
  label: string;
  owns?: TermId;
  /** Where it lives today (Next.js pattern, `[param]` for segments). Null = not built. */
  path: string | null;
  /** Canonical path after phase 2. */
  target: string;
  /** `src/app/...` file serving `path`. */
  page: string | null;
  status: RouteNodeStatus;
  /** Query params the page owns (the slice of the list, never the thing). */
  query?: readonly string[];
  /** Other nodes this one may link to (records only: list pages link inside their own subtree). */
  links?: readonly string[];
  /** What a session should know before touching it. */
  note?: string;
  forwardsTo?: string;
}

export const ROUTE_TREE: readonly RouteNode[] = [
  {
    id: 'sales',
    parent: null,
    kind: 'lane',
    label: 'Sales',
    path: null,
    target: '/customers',
    page: null,
    status: 'planned',
    note: 'Desktop and phone share the same Sales taxonomy; Customers is a peer destination, not a view inside the counter page.',
  },
  {
    id: 'customers',
    parent: 'sales',
    kind: 'collection',
    label: 'Customers',
    owns: 'customer',
    path: '/customers',
    target: '/customers',
    page: 'src/app/customers/page.tsx',
    status: 'live',
    query: ['q', 'customer'],
    links: ['customers-mobile'],
  },
  {
    id: 'customers-mobile',
    parent: 'sales',
    kind: 'collection',
    label: 'Customers',
    path: '/m/customers',
    target: '/m/customers',
    page: 'src/app/m/(shell)/customers/page.tsx',
    status: 'live',
    query: ['q'],
    links: ['customer-mobile'],
    note: 'The mobile-first customer directory; it carries the same identity and order-throughput model as the desktop desk.',
  },
  {
    id: 'customer-mobile',
    parent: 'customers-mobile',
    kind: 'record',
    label: 'Customer',
    path: '/m/customers/[id]',
    target: '/m/customers/[id]',
    page: 'src/app/m/(shell)/customers/[id]/page.tsx',
    status: 'live',
  },
  {
    id: 'scan-stations',
    parent: null,
    kind: 'lane',
    label: 'Scan stations',
    path: null,
    target: '/test',
    page: null,
    status: 'planned',
    note: 'The operator benches. Quality control is one first-class station on desktop and mobile.',
  },
  {
    id: 'quality-control',
    parent: 'scan-stations',
    kind: 'task',
    label: 'Quality control',
    owns: 'quality-control',
    path: '/test',
    target: '/test',
    page: 'src/app/test/page.tsx',
    status: 'live',
    links: ['quality-control-mobile'],
  },
  {
    id: 'quality-control-mobile',
    parent: 'scan-stations',
    kind: 'task',
    label: 'Quality control',
    path: '/m/qc',
    target: '/m/qc',
    page: 'src/app/m/(shell)/qc/page.tsx',
    status: 'live',
    links: ['quality-control-line-mobile', 'quality-control-lpn-mobile'],
    note: 'The mobile-first serialized-unit testing queue.',
  },
  {
    id: 'quality-control-line-mobile',
    parent: 'quality-control-mobile',
    kind: 'record',
    label: 'Quality control line',
    path: '/m/qc/line/[id]',
    target: '/m/qc/line/[id]',
    page: 'src/app/m/(shell)/qc/line/[id]/page.tsx',
    status: 'live',
  },
  {
    id: 'quality-control-lpn-mobile',
    parent: 'quality-control-mobile',
    kind: 'record',
    label: 'Quality control LPN',
    path: '/m/qc/lpn/[id]',
    target: '/m/qc/lpn/[id]',
    page: 'src/app/m/(shell)/qc/lpn/[id]/page.tsx',
    status: 'live',
  },
  {
    id: 'prepack-mobile',
    parent: 'scan-stations',
    kind: 'task',
    label: 'Prepack',
    path: '/m/prepack',
    target: '/m/prepack',
    page: 'src/app/m/(shell)/prepack/page.tsx',
    status: 'live',
    query: ['unit', 'catalogId', 'serialRequestId'],
    links: ['prepack-desktop'],
    note: 'One fast prepack form: scan the serial (or pick the product), set how many packages — one label each, own condition and serials — confirm contents (pairing missing parts or the manual inline) and print. No modes, no steps, no photo requirement; packing puts the packages away. `unit` is the scanned serial and `catalogId` the product, so a reload restores the form; `serialRequestId` is the phone serial handoff reply. Build every URL with prepackHref(); /m/qc remains Quality control.',
  },
  {
    id: 'prepack-desktop',
    parent: 'scan-stations',
    kind: 'task',
    label: 'Prepack',
    path: '/inventory/qc-labels',
    target: '/inventory/qc-labels',
    page: 'src/app/inventory/qc-labels/page.tsx',
    status: 'live',
    query: ['task', 'unit', 'catalogId'],
    links: ['prepack-mobile'],
    note: 'The same prepack form on the desk inside the QC labels ledger (`?task=prepack`): form left, context column right. Same query contract as /m/prepack minus the phone-only handoff reply.',
  },
  {
    id: 'warehouse',
    parent: null,
    kind: 'lane',
    label: 'Warehouse',
    owns: 'warehouse',
    path: null,
    target: '/m/warehouse',
    page: null,
    status: 'planned',
    note: 'Today the phone menu group is `inventory` (DOMAIN_GROUPS label "Inventory"). Phase 2 renames the lane to Warehouse on both surfaces; the desktop row now called "Warehouse" must become "Locations" in the same change (nav-name law).',
  },
  {
    id: 'stock',
    parent: 'warehouse',
    kind: 'collection',
    label: 'Stock',
    owns: 'stock',
    path: '/m/stock',
    target: '/m/warehouse/stock',
    page: 'src/app/m/(shell)/stock/page.tsx',
    status: 'live',
    query: ['q', 'room', 'aisle', 'side', 'bay'],
    note: 'Rooms › Aisles › Side › Bays › Locations drill of every place (empty ones say Empty). An aisle opens on two full-height choices split down the middle — Odd bays · Left side | Even bays · Right side (`?side=left|right`, BAY_SIDE_FACE) — then that side\'s bays in number order; never (Left) on every bay, never a grid of bays. Room container nodes are not places. Search lists stocked places. No doors to other things: Labels, Racks and Manage live in the menu.',
  },
  {
    id: 'stock-photos',
    parent: 'stock',
    kind: 'task',
    label: 'Stock photos',
    owns: 'stock',
    path: '/m/stock/[stockId]/photos',
    target: '/m/warehouse/stock/[stockId]/photos',
    page: 'src/app/m/(immersive)/stock/[stockId]/photos/page.tsx',
    status: 'live',
    query: ['sku', 'back'],
  },
  {
    id: 'stock-detail',
    parent: 'stock',
    kind: 'compat',
    label: 'Stock detail',
    path: '/m/stock/detail',
    target: '/m/warehouse/locations/[code]',
    page: 'src/app/m/(shell)/stock/detail/page.tsx',
    status: 'live',
    query: ['open', 'page'],
    forwardsTo: 'location',
    note: 'Old `?open=<location:sku:source>` row links forward to the location record.',
  },
  {
    id: 'locations',
    parent: 'warehouse',
    kind: 'collection',
    label: 'Locations',
    owns: 'location',
    path: null,
    target: '/m/warehouse/locations',
    page: null,
    status: 'planned',
    query: ['room', 'aisle', 'bay', 'status'],
    note: 'Every place, empty ones included; `?status=empty|unassigned` replaces the cleanup page.',
  },
  {
    id: 'location',
    parent: 'locations',
    kind: 'record',
    label: 'Location',
    owns: 'location',
    path: '/m/loc/[code]',
    target: '/m/warehouse/locations/[code]',
    page: 'src/app/m/(shell)/loc/[code]/page.tsx',
    status: 'live',
    query: ['back', 'verified'],
    links: ['location-labels', 'rack', 'container', 'stock'],
    note: 'One record for C0310300, RK12 and RK12-3. Its path chips go UP into the stock drill; its title picker goes sideways.',
  },
  {
    id: 'location-info',
    parent: 'location',
    kind: 'task',
    label: 'Location details',
    owns: 'location',
    path: '/m/loc/[code]/info',
    target: '/m/warehouse/locations/[code]/info',
    page: 'src/app/m/(shell)/loc/[code]/info/page.tsx',
    status: 'live',
  },
  {
    id: 'location-cleanup',
    parent: 'locations',
    kind: 'task',
    label: 'Manage locations',
    owns: 'location',
    path: '/m/stock/locations',
    target: '/m/warehouse/locations',
    page: 'src/app/m/(shell)/stock/locations/page.tsx',
    status: 'live',
    note: 'Rename and clear empty positions (`bin.remove`). Phase 2 folds it into the Locations list as `?status=empty`.',
  },
  {
    id: 'location-labels',
    parent: 'locations',
    kind: 'task',
    label: 'Location labels',
    owns: 'location-labels',
    path: '/m/labels',
    target: '/m/warehouse/locations/labels',
    page: 'src/app/m/(shell)/labels/page.tsx',
    status: 'live',
    query: ['code', 'kind', 'back'],
  },
  {
    id: 'rack-labels',
    parent: 'location-labels',
    kind: 'compat',
    label: 'Rack labels',
    owns: 'location-labels',
    path: '/m/stock/labels',
    target: '/m/warehouse/locations/labels',
    page: 'src/app/m/(shell)/stock/labels/page.tsx',
    status: 'live',
    query: ['rack', 'back'],
    forwardsTo: 'location-labels',
    note: 'A second label builder. Phase 2 merges it into Location labels as `?kind=rack`.',
  },
  {
    id: 'racks',
    parent: 'locations',
    kind: 'collection',
    label: 'Racks',
    owns: 'rack',
    path: '/m/racks',
    target: '/m/warehouse/locations/racks',
    page: 'src/app/m/(shell)/racks/page.tsx',
    status: 'live',
  },
  {
    id: 'rack-new',
    parent: 'racks',
    kind: 'task',
    label: 'New rack',
    owns: 'rack',
    path: '/m/racks/new',
    target: '/m/warehouse/locations/racks/new',
    page: 'src/app/m/(shell)/racks/new/page.tsx',
    status: 'live',
  },
  {
    id: 'rack',
    parent: 'racks',
    kind: 'record',
    label: 'Rack',
    owns: 'rack',
    path: '/m/loc/[code]',
    target: '/m/warehouse/locations/[code]',
    page: 'src/app/m/(shell)/loc/[code]/page.tsx',
    status: 'live',
    note: 'A rack (RK12) is addressed like any location; the location record renders the rack face.',
  },
  {
    id: 'containers',
    parent: 'warehouse',
    kind: 'collection',
    label: 'Containers',
    owns: 'container',
    path: null,
    target: '/m/warehouse/containers',
    page: null,
    status: 'planned',
  },
  {
    id: 'container',
    parent: 'containers',
    kind: 'record',
    label: 'Tote',
    owns: 'container',
    path: '/m/h/[id]',
    target: '/m/warehouse/containers/[code]',
    page: 'src/app/m/(shell)/h/[id]/page.tsx',
    status: 'live',
    links: ['location'],
    note: 'H-#### handling unit = a tote. UI copy says Tote, never LPN.',
  },
  {
    id: 'receiving',
    parent: null,
    kind: 'lane',
    label: 'Receiving',
    path: null,
    target: '/incoming',
    page: null,
    status: 'planned',
    note: 'Desktop. One lane door (Deliveries, `/incoming`); its mode card reaches every mode — G D Deliveries · G U Purchasing · G P Local Pickup · G R Repair service · G S Sourcing (`NAV_GO_KEYS.inbound`). Its modes never paint at the top level.',
  },
  {
    id: 'purchasing',
    parent: 'receiving',
    kind: 'collection',
    label: 'Purchasing',
    owns: 'purchase',
    path: '/purchasing',
    target: '/purchasing',
    page: 'src/app/purchasing/page.tsx',
    status: 'live',
    query: ['axis', 'from', 'to', 'source', 'vendor', 'unboxedBy', 'recon', 'find', 'colsort', 'coldir'],
    note: 'Owner 2026-10-05: every purchase-order line in a window on one date axis (ordered · delivered · unboxed), as the shared sheet (`PurchasesSheet`). A Receiving MODE on the lane\'s mode card, never a top-level row. URL contract: `src/lib/receiving/purchases-params.ts`. Legacy `/incoming?lane=purchases` forwards here (308).',
  },
  {
    id: 'purchase-new',
    parent: 'purchasing',
    kind: 'task',
    label: 'Add purchase order',
    owns: 'purchase',
    path: '/purchasing/new',
    target: '/purchasing/new',
    page: 'src/app/purchasing/new/page.tsx',
    status: 'live',
    query: ['type', 'id'],
    note: 'Owner 2026-10-06: the one desk form that adds or fixes an inbound order (PO or Return) — form 2/3 left, live confirmation 1/3 right. Opened from Add (top right) on Purchasing. `?id=` reopens a landed order. Lands through ingestInboundOrder.',
  },
  {
    id: 'purchase-new-mobile',
    parent: 'purchasing',
    kind: 'task',
    label: 'Add purchase order',
    owns: 'purchase',
    path: '/m/receiving/order',
    target: '/m/receiving/order',
    page: 'src/app/m/(shell)/receiving/order/page.tsx',
    status: 'live',
    query: ['type', 'id', 'fill'],
    note: 'The phone face of `purchase-new`: same draft, checklist and writer. `?fill=1` opens Paste or photo first.',
  },
  {
    id: 'purchase-import',
    parent: 'purchasing',
    kind: 'task',
    label: 'Import orders',
    owns: 'purchase',
    path: '/purchasing/import',
    target: '/purchasing/import',
    page: 'src/app/purchasing/import/page.tsx',
    status: 'live',
    note: 'One file import for every inbound export (Amazon seller-fulfilled / Prime / FBA returns, eBay, Goodwill, our template): preview, then land through runInboundDraftBatch. Lists recent uploads; each opens its upload check.',
  },
  {
    id: 'purchase-import-mobile',
    parent: 'purchasing',
    kind: 'task',
    label: 'Import orders',
    owns: 'purchase',
    path: '/m/receiving/import-csv',
    target: '/m/receiving/import-csv',
    page: 'src/app/m/(shell)/receiving/import-csv/page.tsx',
    status: 'live',
    note: 'The phone face of `purchase-import`.',
  },
  {
    id: 'purchase-import-check',
    parent: 'purchase-import',
    kind: 'record',
    label: 'Upload check',
    owns: 'purchase',
    path: '/purchasing/import/[batchId]',
    target: '/purchasing/import/[batchId]',
    page: 'src/app/purchasing/import/[batchId]/page.tsx',
    status: 'live',
    query: ['show'],
    note: 'One uploaded file, row by row: every file cell beside the value saved in inbound_order / receiving_line / receiving_line_return, mismatches marked (inbound_import_row).',
  },
  {
    id: 'fulfillment',
    parent: null,
    kind: 'lane',
    label: 'Fulfillment',
    path: null,
    target: '/shipping/orders',
    page: null,
    status: 'planned',
    note: 'Desktop. The outbound lane: FBM (`/shipping/orders`, its landing) · Fulfilled · FBA are peers (`domainGroup: fulfillment` in sidebar-navigation).',
  },
  {
    id: 'fulfilled',
    parent: 'fulfillment',
    kind: 'collection',
    label: 'Fulfilled',
    owns: 'fulfilled-order',
    path: '/fulfilled',
    target: '/fulfilled',
    page: 'src/app/fulfilled/page.tsx',
    status: 'live',
    query: ['axis', 'from', 'to', 'channel', 'carrier', 'packer', 'mine', 'scan', 'grain', 'layout', 'done', 'untracked', 'cards', 'group', 'status', 'q', 'shipment', 'openOrderId', 'back', 'colsort', 'coldir'],
    note: 'Owner 2026-10-05: every shipped order in a window on one date axis (shipped · delivered · ordered · ship-by). Opens on the full-screen BOARD (`FulfilledBoard`, `src/features/fulfilled-board`, built in the image of the Live feed: a headline, then one column per bucket under Act now · Watch · Done, each card its clock); `?layout=sheet` is the shared sheet (`PastedListSheet` over `GET /api/nav/fulfilled`, grain toggle orders · lines, status chips). URL contract: `src/lib/outbound/fulfilled-params.ts`. A card or row opens its package (`?shipment=`) in split — what a triage card opens (`recordDetailsHref` → `?openOrderId=`). `/shipping/shipped` forwards here.',
  },
  {
    id: 'fulfilled-mobile',
    parent: 'fulfillment',
    kind: 'collection',
    label: 'Fulfilled',
    path: '/m/fulfilled',
    target: '/m/fulfilled',
    page: 'src/app/m/(shell)/fulfilled/page.tsx',
    status: 'live',
    note: 'Phone face of the post-ship journey (operator 2026-10-05, SURFACE_LAW): the same `GET /api/nav/fulfilled` at its defaults as Act now · Watch · Done bands of RecordCardMobile cards, worst clock first. A card opens its package (`/m/shipping/shipments/<id>`), or on a check-in stage its Support item (`/m/t/<id>`). Same name as the desk list: one collection, two surfaces.',
  },
  {
    id: 'search',
    parent: null,
    kind: 'lane',
    label: 'Search',
    path: null,
    target: '/search',
    page: null,
    status: 'planned',
    note: 'Desktop. The search field (NavFind) and the ⌘K palette are its faces; `/search` itself is parked (it forwards to the record a `?sel=` names). Its one live page is Records (`/records`) — a held pasted list opens there.',
  },
  {
    id: 'records',
    parent: 'search',
    kind: 'collection',
    label: 'Records',
    owns: 'record',
    path: '/records',
    target: '/records',
    page: 'src/app/records/page.tsx',
    status: 'live',
    query: ['refs', 'back', 'q', 'grain', 'axis', 'from', 'to', 'event', 'by', 'efrom', 'eto', 'colsort', 'coldir'],
    note: 'Owner 2026-10-06 (docs/refactors/records): every LINE of an inbound or outbound order as ONE sheet — Query mode narrowed by the sidebar, Paste mode (`?refs=`, the search bar\'s held list or a paste into the sheet). Identifiers frozen left, Internal | External pinned right, grain per line · order · item number · product, Linear selection + the floating dock. URL contract: `src/lib/nav/records/params.ts`; `?back=` is where Esc returns.',
  },
  {
    id: 'pasted-list',
    parent: 'records',
    kind: 'compat',
    label: 'Records from a paste',
    path: '/search/list',
    target: '/records',
    page: 'src/app/search/list/page.tsx',
    status: 'live',
    query: ['refs', 'back'],
    forwardsTo: 'records',
    note: 'The old full-screen pasted list (owner 2026-10-04). Forwards to Records with `?refs=` and `?back=` kept (2026-10-06).',
  },
  {
    id: 'print-station',
    parent: null,
    kind: 'lane',
    label: 'Print station',
    path: null,
    target: '/print-station',
    page: null,
    status: 'planned',
    note: 'Desktop. Two modes on one sidebar card, `G` then a letter (owner 2026-10-04): G F FNSKU labels (printing) · G S Stations (managing the org\'s print stations).',
  },
  {
    id: 'fnsku-labels',
    parent: 'print-station',
    kind: 'collection',
    label: 'FNSKU labels',
    path: '/print-station',
    target: '/print-station',
    page: 'src/app/print-station/page.tsx',
    status: 'live',
    query: ['view', 'q', 'condition', 'fnsku', 'page'],
    note: 'Find an Amazon FBA unit label and print it at a station; views All FNSKUs (bare) · Reprinted.',
  },
  {
    id: 'print-stations',
    parent: 'print-station',
    kind: 'collection',
    label: 'Stations',
    owns: 'print-station',
    path: '/print-station/stations',
    target: '/print-station/stations',
    page: 'src/app/print-station/stations/page.tsx',
    status: 'live',
    query: ['q', 'station', 'page'],
    note: 'The control plane: every org print station, its printers, online state and the org default per stock; the open station (`?station=`) renames, sets defaults and test-prints.',
  },
  {
    id: 'print-station-device',
    parent: 'print-station',
    kind: 'task',
    label: 'Station device',
    path: '/print-station/device',
    target: '/print-station/device',
    page: 'src/app/print-station/device/page.tsx',
    status: 'live',
    query: ['code'],
    note: 'The enrolled print station itself, on the computer that prints — no staff signed in, public chrome even when a staff session exists. Unpaired: the pairing code entry (`?code=` from the QR pairs at once). Paired: the always-on station — name, online, label printer, the last jobs.',
  },
  {
    id: 'support',
    parent: null,
    kind: 'lane',
    label: 'Support',
    path: null,
    target: '/support',
    page: null,
    status: 'planned',
    note: 'Owner 2026-10-04: Support is a top-level workspace, not a Tasks mode. Desktop /support and phone /m/support read the same local model (support_tickets + primary task).',
  },
  {
    id: 'support-items',
    parent: 'support',
    kind: 'collection',
    label: 'Support items',
    owns: 'support-item',
    path: '/support',
    target: '/support',
    page: 'src/app/support/page.tsx',
    status: 'live',
    query: ['view', 'status', 'platform', 'account', 'assignee', 'sort', 'group', 'q', 'item'],
    note: 'Records only. Status pills New · Open · Pending · On-hold · Solved · Closed (`?status=`, local statuses, supportLocalStatus) sit above the cards like Allocate; views, sort, group-by and facets live in the left sidebar. `?item=` is the Support item id (support_tickets.id), never the task id; legacy /?tab=ticket[&task=] forwards here.',
  },
  {
    id: 'support-items-mobile',
    parent: 'support',
    kind: 'collection',
    label: 'Support items',
    path: '/m/support',
    target: '/m/support',
    page: 'src/app/m/(shell)/support/page.tsx',
    status: 'live',
    query: ['status', 'q', 'item'],
    note: 'Phone Support (SURFACE_LAW): the list, one record read (local thread), internal note and Log customer message. `?item=` is the Support item id. Same name as the desk list: one collection, two surfaces.',
  },
];

// ── Paths and builders (the only way to write a registered URL) ─────────────

function livePath(id: string): string {
  const node = ROUTE_TREE.find((n) => n.id === id);
  if (!node?.path) throw new Error(`route-tree: ${id} has no live path`);
  return node.path;
}

/** Static live paths, read once from the tree. */
export const WAREHOUSE_PATHS = {
  stock: livePath('stock'),
  stockDetail: livePath('stock-detail'),
  locationCleanup: livePath('location-cleanup'),
  locationLabels: livePath('location-labels'),
  rackLabels: livePath('rack-labels'),
  racks: livePath('racks'),
  newRack: livePath('rack-new'),
} as const;

/** Desktop Search lane live paths. */
export const SEARCH_PATHS = {
  records: livePath('records'),
  pastedList: livePath('pasted-list'),
} as const;

/** Receiving lane live paths (its modes registered here; Deliveries · Local Pickup · Repair service predate the tree). */
export const RECEIVING_PATHS = {
  purchasing: livePath('purchasing'),
  purchaseNew: livePath('purchase-new'),
  purchaseNewMobile: livePath('purchase-new-mobile'),
  purchaseImport: livePath('purchase-import'),
  purchaseImportMobile: livePath('purchase-import-mobile'),
} as const;

/** The upload check of one import batch. */
export function purchaseImportCheckHref(batchId: number): string {
  return livePath('purchase-import-check').replace('[batchId]', String(batchId));
}

/** Customer surfaces share this route contract across desktop and mobile. */
export const CUSTOMER_PATHS = {
  desktop: livePath('customers'),
  mobile: livePath('customers-mobile'),
} as const;

/** Quality-control surfaces share this route contract across desktop and mobile. */
export const QUALITY_CONTROL_PATHS = {
  desktop: livePath('quality-control'),
  mobile: livePath('quality-control-mobile'),
} as const;

/** Fulfilled's two faces: the desk board/sheet and the phone journey. */
export const FULFILLED_PATHS = {
  desktop: livePath('fulfilled'),
  mobile: livePath('fulfilled-mobile'),
} as const;

/** The single mobile-first prepack form: on the phone at /m/prepack, on the desk inside QC labels. */
export const PREPACK_PATHS = {
  form: livePath('prepack-mobile'),
  desktop: livePath('prepack-desktop'),
} as const;

export type PrepackSurface = 'mobile' | 'desktop';

export interface PrepackRouteState {
  /** The scanned serial (OEM serial, unit_uid or `U-` handle) the form was started from. */
  unit?: string | null;
  catalogId?: number | null;
  /** Phone only: reply to this desk serial request. */
  serialRequestId?: string | null;
}

/** Every query key the prepack form owns — a surface strips these when it leaves the task. */
export const PREPACK_QUERY_KEYS = ['task', 'unit', 'catalogId', 'serialRequestId'] as const;

/**
 * `/m/prepack?…` or `/inventory/qc-labels?task=prepack&…`. `keep` carries the
 * desk ledger's own params (`q`, `view`) through the task untouched.
 */
export function prepackHref(surface: PrepackSurface, state: PrepackRouteState = {}, keep?: URLSearchParams): string {
  const query = new URLSearchParams();
  if (keep) {
    for (const [key, value] of keep) {
      if (!(PREPACK_QUERY_KEYS as readonly string[]).includes(key)) query.set(key, value);
    }
  }
  if (surface === 'desktop') query.set('task', 'prepack');
  const params: Record<string, string | null | undefined> = {
    unit: state.unit?.trim(),
    catalogId: positiveId(state.catalogId),
    serialRequestId: surface === 'mobile' ? state.serialRequestId?.trim() : null,
  };
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const path = surface === 'desktop' ? PREPACK_PATHS.desktop : PREPACK_PATHS.form;
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Print station's two modes, printing (FNSKU labels) and managing (Stations), plus the enrolled station's own page. */
export const PRINT_STATION_PATHS = {
  fnskuLabels: livePath('fnsku-labels'),
  stations: livePath('print-stations'),
  device: livePath('print-station-device'),
} as const;

function fill(pattern: string, param: string, value: string): string {
  return pattern.replace(`[${param}]`, encodeURIComponent(value));
}

function withQuery(path: string, params?: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) if (value) query.set(key, value);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Desktop and phone Support share this route contract. */
export const SUPPORT_PATHS = {
  desktop: livePath('support-items'),
  mobile: livePath('support-items-mobile'),
} as const;

function positiveId(value: number | string | null | undefined): string | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? String(n) : null;
}

/**
 * `/support[?view=][&status=][&item=][&q=]` — the Support workspace. `item` is the
 * Support item id (support_tickets.id), never the task id. `q` drops a leading
 * `#` / `T-` so a pasted provider number finds its item.
 */
export function supportHref(params?: {
  item?: number | string | null;
  q?: string | number | null;
  view?: string | null;
  status?: string | null;
}): string {
  const q = String(params?.q ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/^T-/i, '');
  return withQuery(SUPPORT_PATHS.desktop, {
    view: params?.view?.trim() || null,
    status: params?.status?.trim() || null,
    item: positiveId(params?.item),
    q: q || null,
  });
}

/**
 * `/m/support[?status=][&item=][&q=]` — phone Support; `item` is the Support item id, `status` the
 * comma list of local statuses the list's chips show (kept on the record so its X returns to the same cut).
 */
export function supportMobileHref(params?: {
  item?: number | string | null;
  q?: string | null;
  status?: string | null;
}): string {
  return withQuery(SUPPORT_PATHS.mobile, {
    status: params?.status?.trim() || null,
    item: positiveId(params?.item),
    q: params?.q?.trim() || null,
  });
}

/** `/print-station/device?code=` — the enrolled print station's page; a `code` pairs it on arrival (the QR). */
export function printStationDeviceHref(params?: { code?: string | null }): string {
  return withQuery(PRINT_STATION_PATHS.device, params);
}

/** `/m/loc/<code>` — a location or movable rack record. */
export function locationPath(code: string): string {
  return fill(livePath('location'), 'code', code);
}

/** `/m/loc/<code>/info`. */
export function locationInfoPath(code: string): string {
  return fill(livePath('location-info'), 'code', code);
}

/** `/m/h/<id>` — a tote. */
export function containerPath(id: string | number): string {
  return fill(livePath('container'), 'id', String(id));
}

/** `/m/customers/<id>` — one customer identity and its order history. */
export function customerMobilePath(id: string | number): string {
  return fill(livePath('customer-mobile'), 'id', String(id));
}

/** `/m/qc/line/<id>` — one serialized inbound line at the testing bench. */
export function qualityControlLineMobilePath(id: string | number): string {
  return fill(livePath('quality-control-line-mobile'), 'id', String(id));
}

/** `/m/qc/lpn/<id>` — one receiving LPN at the testing bench. */
export function qualityControlLpnMobilePath(id: string | number): string {
  return fill(livePath('quality-control-lpn-mobile'), 'id', String(id));
}

/** `/m/stock/<stockId>/photos?sku=&back=`. */
export function stockPhotosHref(stockId: string | number, params: { sku?: string | null; back?: string | null }): string {
  return withQuery(fill(livePath('stock-photos'), 'stockId', String(stockId)), params);
}

/** `/m/labels?code=&kind=&back=` — the location / bay sticker builder. */
export function locationLabelsHref(params?: { code?: string | null; kind?: string | null; back?: string | null }): string {
  return withQuery(WAREHOUSE_PATHS.locationLabels, params);
}

/** `/m/stock/labels?rack=&back=` — rack shelf stickers (merges into Location labels in phase 2). */
export function rackLabelsHref(params?: { rack?: string | null; back?: string | null }): string {
  return withQuery(WAREHOUSE_PATHS.rackLabels, params);
}

/**
 * `/records?refs=&back=` — the Records sheet. `refs` as the bar holds them
 * (comma-joined, the `?ref_in=` shape; empty = Query mode), `back` where Esc
 * returns. Every other param is the sidebar's (`src/lib/nav/records/params.ts`).
 */
export function recordsHref(params: { refs?: readonly string[]; back?: string | null } = {}): string {
  return withQuery(SEARCH_PATHS.records, { refs: params.refs?.join(','), back: params.back });
}

// ── Lookups (the guard and the MCP read these) ──────────────────────────────

export function routeNode(id: string): RouteNode | undefined {
  return ROUTE_TREE.find((node) => node.id === id);
}

export function routeChildren(id: string | null): RouteNode[] {
  return ROUTE_TREE.filter((node) => node.parent === id);
}

/** Root-first chain of a node and its parents. */
export function routeAncestry(id: string): RouteNode[] {
  const chain: RouteNode[] = [];
  let node = routeNode(id);
  while (node) {
    chain.unshift(node);
    node = node.parent ? routeNode(node.parent) : undefined;
  }
  return chain;
}

function patternRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\\?\[[^\]]+\\?\]/g, '[^/]+');
  return new RegExp(`^${escaped}/?$`);
}

/** The node a concrete pathname belongs to (live path first, then target). Query strings are ignored. */
export function routeForPath(pathname: string): RouteNode | undefined {
  const bare = pathname.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  // Static segments beat dynamic ones (`/m/racks/new` before `/m/loc/[code]`).
  const ranked = [...ROUTE_TREE].sort(
    (a, b) => Number((a.path ?? '').includes('[')) - Number((b.path ?? '').includes('[')),
  );
  return (
    ranked.find((node) => node.path && patternRegex(node.path).test(bare)) ??
    ranked.find((node) => patternRegex(node.target).test(bare))
  );
}

/** The node whose page is this file. */
export function routeForFile(file: string): RouteNode | undefined {
  const rel = file.replace(/^\.\//, '');
  return ROUTE_TREE.find((node) => node.page === rel);
}

/** A word → its term: by id, label, plural, or as a banned synonym (which names the canonical term). */
export function lookupTerm(word: string): { term: VocabularyTerm; via: 'term' | 'banned' } | undefined {
  const w = word.trim().toLowerCase();
  if (!w) return undefined;
  for (const term of VOCABULARY) {
    if ([term.id, term.label, term.plural, term.segment ?? ''].some((v) => v.toLowerCase() === w)) return { term, via: 'term' };
  }
  for (const term of VOCABULARY) {
    if (term.banned.some((b) => b.toLowerCase().split(' (')[0] === w)) return { term, via: 'banned' };
  }
  return undefined;
}
