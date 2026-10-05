/**
 * QA sandbox tenant configuration — single source for slug, defaults, and
 * per-org feature-flag overrides used by scripts/provision-qa-org.ts and E2E.
 */

import { QA_ORG_ID, type OrgId } from './constants';

export { QA_ORG_ID };

export const QA_ORG_SLUG = 'cycleforge-qa';
export const QA_ORG_NAME = 'CycleForge QA Sandbox';

/** Default QA admin — override via env for your local/CI mailbox. */
export const QA_ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? 'qa-admin@cycleforge.test';
export const QA_ADMIN_NAME = process.env.QA_ADMIN_NAME ?? 'QA Admin';
/** Non-obvious dev PIN; override via QA_ADMIN_PIN in .env. */
export const QA_ADMIN_PIN = process.env.QA_ADMIN_PIN ?? '847291';
/**
 * Email+password for `/signin` into org `…0002` (CycleForge QA Sandbox).
 * Local default is sandbox-only — override via `QA_ADMIN_PASSWORD` in `.env`.
 * Never reuse this on dogfood / production tenants.
 */
export const QA_ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD ?? 'CycleForge-QA-local!';

/**
 * Per-org feature flags force-enabled on the QA tenant so gated surfaces are
 * exercisable without flipping global env vars. Names match organization_feature_flags.flag.
 */
export const QA_FEATURE_FLAGS: ReadonlyArray<string> = [
  'studio',
  'surface_composed_render',
  'incoming_universal',
  'buyer_note_signals',
  // Thrown tasks land here as durable `reason:'assigned'` rows (WS-TASKS Part A).
  'home_inbox',
];

/** Fixture SKUs — QA-BOSE overlaps a common USAV catalog string for isolation tests. */
export const QA_FIXTURE_SKUS = {
  speaker: 'QA-BOSE-SLM2-BK',
  earbuds: 'QA-APPL-APP2-WH',
  overlapProbe: 'BOSE-SLM2-BK',
} as const;

/** One active Zoho `items` mirror row — the pairing fixture for the Add-inbound Product picker. */
export const QA_FIXTURE_ZOHO_ITEM = {
  zohoItemId: 'QA-MOCK-ZITEM-1',
  sku: QA_FIXTURE_SKUS.speaker,
  title: 'QA Bose SoundLink Mini II',
} as const;

/**
 * Extra catalog SKUs for demo-volume order titles — keeps outbound grids from
 * looking like five copies of the same two products. Not referenced by E2E.
 */
export const QA_DEMO_SKUS = {
  keyboard: 'QA-LOG-MXK-BK',
  headset: 'QA-SNY-WH1000',
  tablet: 'QA-SAM-TAB-A8',
  charger: 'QA-ANK-737',
  mouse: 'QA-LOG-MX3',
  webcam: 'QA-LGT-C920',
} as const;

/** Product titles paired with `QA_DEMO_SKUS` (and the E2E fixture SKUs) for rotation. */
export const QA_DEMO_SKU_CATALOG: ReadonlyArray<{ sku: string; title: string }> = [
  { sku: QA_FIXTURE_SKUS.speaker, title: 'QA Bose SoundLink Mini II' },
  { sku: QA_FIXTURE_SKUS.earbuds, title: 'QA Apple AirPods Pro (2nd Gen)' },
  { sku: QA_DEMO_SKUS.keyboard, title: 'QA Logitech MX Keys' },
  { sku: QA_DEMO_SKUS.headset, title: 'QA Sony WH-1000XM5' },
  { sku: QA_DEMO_SKUS.tablet, title: 'QA Samsung Galaxy Tab A8' },
  { sku: QA_DEMO_SKUS.charger, title: 'QA Anker 737 Power Bank' },
  { sku: QA_DEMO_SKUS.mouse, title: 'QA Logitech MX Master 3' },
  { sku: QA_DEMO_SKUS.webcam, title: 'QA Logitech C920 HD Webcam' },
];

/** Demo outbound volume — fills Awaiting / Pending / Packed / Shipped so the QA sandbox looks like a running warehouse. */
export const QA_DEMO_ORDER_VOLUME = {
  awaiting: 12,
  pending: 24,
  packed: 8,
  shipped: 16,
  idPrefixes: {
    awaiting: 'QA-DEMO-ORD-A',
    pending: 'QA-DEMO-ORD-P',
    packed: 'QA-DEMO-ORD-K',
    shipped: 'QA-DEMO-ORD-S',
  },
  /**
   * 18-digit stem; `qaDemoTrackingNumber(i)` appends a 4-digit sequence → 22
   * digits total (USPS IMpb shape that `detectCarrier` accepts).
   */
  trackingBase: '940010000000000003',
} as const;

/** Deterministic USPS-shaped tracking for demo order index `i` (0-based). */
export function qaDemoTrackingNumber(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 9999) {
    throw new RangeError(`qaDemoTrackingNumber: index out of range (${index})`);
  }
  return `${QA_DEMO_ORDER_VOLUME.trackingBase}${String(index).padStart(4, '0')}`;
}

/** Zero-padded demo order_id, e.g. `QA-DEMO-ORD-P007`. */
export function qaDemoOrderId(
  lane: keyof typeof QA_DEMO_ORDER_VOLUME.idPrefixes,
  index: number,
): string {
  const n = index + 1;
  return `${QA_DEMO_ORDER_VOLUME.idPrefixes[lane]}${String(n).padStart(3, '0')}`;
}

export const QA_FIXTURE_TRACKING = 'QA-MOCK-TRK-PO';
export const QA_FIXTURE_PO_ID = 'QA-MOCK-PO-8001';
export const QA_FIXTURE_PO_NUMBER = 'QA-PO-MOCK-001';

/** Two INCOMING purchase orders — issued in Zoho, untouched by the warehouse (`workflow_status = 'EXPECTED'`, `quantity_received = 0`, no… */
export const QA_FIXTURE_INCOMING_POS = [
  { id: 'QA-MOCK-PO-8101', number: 'QA-PO-MOCK-INC-1', lineId: 'QA-MOCK-INC-LINE-1' },
  { id: 'QA-MOCK-PO-8102', number: 'QA-PO-MOCK-INC-2', lineId: 'QA-MOCK-INC-LINE-2' },
] as const;

/** A THIRD line on the receiving carton, physically received and still flagged `needs_test` — which is exactly what `view=needs-test`… */
export const QA_FIXTURE_TESTING_LINE = {
  itemId: 'QA-MOCK-ITEM-3',
  lineId: 'QA-MOCK-LINE-3',
  title: 'QA Sony WH-1000XM4 (awaiting test)',
  sku: QA_FIXTURE_SKUS.speaker,
} as const;

/** A fourth line carrying a recorded `testing_results` verdict by the QA ADMIN, which is what the Testing workbench's History tab… */
export const QA_FIXTURE_TESTED_LINE = {
  itemId: 'QA-MOCK-ITEM-4',
  lineId: 'QA-MOCK-LINE-4',
  title: 'QA Bose SoundLink Mini II (tested)',
  sku: QA_FIXTURE_SKUS.speaker,
} as const;

/** A loose serialized UNIT for Phase-2 unit pack placement. */
export const QA_FIXTURE_UNIT = {
  unitUid: 'QAUNIT-2621-000042',
  normalizedSerial: 'QAUNIT2621000042',
} as const;

export const QA_FIXTURE_ORDERS = {
  awaiting: 'QA-TEST-UNSHIP-AWAIT',
  pending: 'QA-TEST-UNSHIP-PENDING',
  /** A SECOND tracked pending order. */
  pendingSecond: 'QA-TEST-UNSHIP-PENDING-2',
  /** Third tracked pending row — the keyboard specs need to focus a row that is
   *  neither the first nor the second to prove they open THAT row. */
  pendingThird: 'QA-TEST-UNSHIP-PENDING-3',
  /** A PACKED order — tracking + a PACK station-activity row, no SHIP_CONFIRM, which is exactly the `?stagedOnly=true` predicate the Packed… */
  packed: 'QA-TEST-PACKED',
} as const;

/** Product titles for the order fixtures. */
export const QA_FIXTURE_ORDER_TITLES = {
  awaiting: 'QA — Unshipped AWAITING (add tracking here)',
  pending: 'QA — Unshipped PENDING (tracking assigned)',
  pendingSecond: 'QA — Unshipped PENDING #2 (record→record navigation)',
  pendingThird: 'QA — Unshipped PENDING #3 (focus-a-middle-row keyboard specs)',
  packed: 'QA — PACKED (staged for the dock)',
} as const;

/** Today (`/`) fixtures — the `work_assignments` rows `aggregateMyDayFeed` reads. */
export const QA_FIXTURE_MY_DAY = {
  overdue: {
    orderId: QA_FIXTURE_ORDERS.pending,
    title: QA_FIXTURE_ORDER_TITLES.pending,
    dueInDays: -2,
  },
  dueToday: {
    orderId: QA_FIXTURE_ORDERS.pendingSecond,
    title: QA_FIXTURE_ORDER_TITLES.pendingSecond,
    dueInDays: 0,
  },
  upcoming: {
    orderId: QA_FIXTURE_ORDERS.pendingThird,
    title: QA_FIXTURE_ORDER_TITLES.pendingThird,
    dueInDays: 3,
  },
  /** An UNDATED interrupt — a Support item whose primary task the QA admin owns. */
  interruptTicketId: 9100,
  /** `listSupportFollowupsForStaff` reads the item's cached subject; the fixture
   *  caches none, so the row titles itself from the ticket number. */
  interruptTitle: 'Ticket #9100',
  /** Lower than the default 100 so the fixtures outrank any incidental row. */
  priority: 10,
} as const;

/** Support · Assist vision-loop fixture. */
export const QA_FIXTURE_SUPPORT = {
  ticketId: QA_FIXTURE_MY_DAY.interruptTicketId,
  subject: 'QA Assist — carton label paste contract',
} as const;

/** Org custom-column fixture — one `custom_field_defs` row plus a value on two receiving lines, so a LedgerGrid column sort has something… */
export const QA_FIXTURE_CUSTOM_FIELD = {
  entityType: 'RECEIVING',
  key: 'qa_rack_slot',
  label: 'QA Bay Slot',
  type: 'number',
  /** The grid column key the def merges in as (`custom:<key>`). */
  columnKey: 'custom:qa_rack_slot',
  /** Staff-prefs buckets opted in, so the optional column renders unaided. */
  prefsTableIds: ['receiving', 'testing'],
  /** Lower value — sorts FIRST ascending. Rides the tested line. */
  lower: { value: 2.25, title: QA_FIXTURE_TESTED_LINE.title },
  /** Higher value — sorts FIRST descending. Rides the awaiting-test line. */
  upper: { value: 2.5, title: QA_FIXTURE_TESTING_LINE.title },
} as const;

export const QA_FIXTURE_TRACKING_PENDING = '9400100000000000000199';
export const QA_FIXTURE_TRACKING_PENDING_SECOND = '9400100000000000000205';
export const QA_FIXTURE_TRACKING_PENDING_THIRD = '9400100000000000000229';
export const QA_FIXTURE_TRACKING_PACKED = '9400100000000000000212';

interface QaStationStaffSeed {
  name: string;
  role: string;
  homePath: string;
}

/** Optional station personas for multi-role manual QA (no PIN — pinless rollout). */
export const QA_STATION_STAFF: ReadonlyArray<QaStationStaffSeed> = [
  { name: 'QA Receiver', role: 'receiver', homePath: '/receiving' },
  { name: 'QA Packer', role: 'packer', homePath: '/packing' },
  { name: 'QA Technician', role: 'technician', homePath: '/tech' },
  { name: 'QA Shipper', role: 'shipper', homePath: '/shipping' },
];

/** Media Library evidence fixtures (2026-08-09) — a real photo stream on `/ops/photos` for the QA org. */
export const QA_FIXTURE_PHOTOS = {
  /** Idempotency scope AND an honest value — these are that PO's captures. */
  poRef: QA_FIXTURE_PO_NUMBER,
  /**
   * Ages in days, so the flat stream renders more than one sticky
   * `DateGroupHeader` band. Day bands are warehouse civil days
   * (`groupPhotosByCaptureDay`), so two distinct offsets are enough.
   */
  carton: [
    { photoType: 'receiving_package', ageDays: 0, stage: 'arrival_package', captured: true },
    { photoType: 'receiving_unbox_carton', ageDays: 0, stage: 'unbox_carton', captured: false },
    { photoType: 'receiving_package', ageDays: 2, stage: 'arrival_package', captured: true },
  ],
  /** Linked to a receiving LINE ⇒ stage `unbox_item`, which the deep-link spec asserts. */
  line: [
    { photoType: 'receiving_item', ageDays: 0, stage: 'unbox_item', captured: true },
    { photoType: 'receiving_item', ageDays: 2, stage: 'unbox_item', captured: false },
  ],
} as const;

/** Total seeded photos — the count a "N photos in view" assertion can rely on. */
const QA_FIXTURE_PHOTO_COUNT =
  QA_FIXTURE_PHOTOS.carton.length + QA_FIXTURE_PHOTOS.line.length;

/** Triage decision fixtures (Foundation 0 item 4, HANDOFF-cross-client-outbound- foundation.md) — one deterministic record per decision the… */
export const QA_TRIAGE_FIXTURES = {
  /** Arrived, door-scanned, not unboxed; tagged RETURN through tagInboundAsReturn. */
  returnPackage: {
    tracking: '9400100000000000000304',
    itemName: 'QA Return — Bose SoundLink Mini II',
    sku: QA_FIXTURE_SKUS.speaker,
    sourceType: 'ebay',
    sourceOrderId: 'QA-TRIAGE-RETURN-1',
    returnReason: 'Buyer return — changed mind',
  },
  /** Arrived package for a repair ticket (`REP-<id>` scans open /m/rs/<id>). */
  repairIntake: {
    tracking: '9400100000000000000311',
    ticketNumber: 'RS-QA-TRIAGE-1',
    productTitle: 'QA Bose SoundLink Revolve — repair intake',
    issue: 'Will not charge',
  },
  /** Arrived package anchored to a support ticket, handed to the QA admin's inbox. */
  supportTicketPackage: {
    tracking: '9400100000000000000328',
    externalTicketId: 'QA-TRIAGE-TICKET-1',
    subject: 'QA — customer sent the wrong unit back',
    itemName: 'QA Apple AirPods Pro — ticket package',
    sku: QA_FIXTURE_SKUS.earbuds,
    note: 'QA fixture — ticket package arrived; decide return or repair',
  },
  /** Caged, unpaired (item number, no sku_catalog_id) but labelled → missing ['pairing']. */
  unpairedOrder: {
    orderId: 'QA-TRIAGE-UNPAIRED',
    title: 'QA — Order missing catalog pairing',
    sku: 'QA-UNPAIRED-LISTING-1',
    itemNumber: 'QA-ITEM-UNPAIRED-1',
    tracking: '9400100000000000000335',
  },
  /** Paired, no shipment, no label document → acknowledge 409 missing ['label']. */
  labelLessOrder: {
    orderId: 'QA-TRIAGE-NO-LABEL',
    title: 'QA — Order missing a shipping label',
    sku: QA_FIXTURE_SKUS.speaker,
  },
  /** Placeholder minted by createProvisionalSku, with stock on hand to merge. */
  onHoldSku: {
    barcode: 'QA-HOLD-TRIAGE-1',
    productTitle: 'QA — On-hold placeholder (unreconciled)',
    stock: 5,
  },
} as const;

export function resolveQaOrgId(): OrgId {
  const fromEnv = process.env.QA_ORG_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv;
  return QA_ORG_ID;
}
