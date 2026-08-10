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
  'ai_search_commandbar',
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

/**
 * One active Zoho `items` mirror row — the pairing fixture for the Add-inbound
 * Product picker. Its `sku` matches the `speaker` `sku_catalog` fixture so the
 * picker's `searchField=zoho_catalog` INNER JOIN (`items` ⋈ `sku_catalog`)
 * returns it. `title` is `items.name` (what the operator searches on).
 */
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

/**
 * Demo outbound volume — fills Awaiting / Pending / Packed / Shipped so the QA
 * sandbox looks like a running warehouse. Separate ID prefix from `QA-TEST-*`
 * so Playwright fixtures stay stable; re-provision is idempotent.
 *
 * Tracking uses USPS-shaped digits in a reserved block (`…03xxxx`) that does
 * not overlap `QA_FIXTURE_TRACKING_*` (`…0199` / `…0205` / `…0212` / `…0229`).
 */
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

/**
 * Two INCOMING purchase orders — issued in Zoho, untouched by the warehouse
 * (`workflow_status = 'EXPECTED'`, `quantity_received = 0`, no dock scan), which
 * is exactly what `view=incoming` selects.
 *
 * Two of them, on DISTINCT POs, because `/incoming` folds lines by PO: one
 * multi-line PO renders as a single collapsed group, and the row→row inspector
 * spec needs two independently-clickable rows. Without these the QA org showed
 * "No incoming POs" and every `/incoming` spec skipped — the coverage gap
 * `verify.md` says to seed away rather than skip around.
 */
export const QA_FIXTURE_INCOMING_POS = [
  { id: 'QA-MOCK-PO-8101', number: 'QA-PO-MOCK-INC-1', lineId: 'QA-MOCK-INC-LINE-1' },
  { id: 'QA-MOCK-PO-8102', number: 'QA-PO-MOCK-INC-2', lineId: 'QA-MOCK-INC-LINE-2' },
] as const;

/**
 * A THIRD line on the receiving carton, physically received and still flagged
 * `needs_test` — which is exactly what `view=needs-test` selects, so the
 * Testing workbench's Pending tab has deterministic rows on this tenant.
 *
 * Its own line, not a mutation of `QA-MOCK-LINE-1`/`-2`: those two carry the
 * note-vs-label grain walk (`receiving-note-label-grain.spec.ts`) and the
 * receive-to-Zoho burn, and marking either one received would rewrite the state
 * those specs assert from. `needs-test` is un-tester-scoped (unlike History,
 * which defaults to the signed-in tester), so any QA admin sees it.
 */
export const QA_FIXTURE_TESTING_LINE = {
  itemId: 'QA-MOCK-ITEM-3',
  lineId: 'QA-MOCK-LINE-3',
  title: 'QA Sony WH-1000XM4 (awaiting test)',
  sku: QA_FIXTURE_SKUS.speaker,
} as const;

/**
 * A fourth line carrying a recorded `testing_results` verdict by the QA ADMIN,
 * which is what the Testing workbench's History tab (`view=testing`) selects.
 *
 * Attributed to the admin on purpose: History defaults to the signed-in tester,
 * and `?staff=all` cannot rescue a spec here — the route's ambient `staff` param
 * is `paramPositiveInt`, so the literal `all` token `useStaffFilter({ allToken:
 * 'all' })` writes is dropped at the boundary before the list ever reads it.
 */
export const QA_FIXTURE_TESTED_LINE = {
  itemId: 'QA-MOCK-ITEM-4',
  lineId: 'QA-MOCK-LINE-4',
  title: 'QA Bose SoundLink Mini II (tested)',
  sku: QA_FIXTURE_SKUS.speaker,
} as const;

/**
 * A loose serialized UNIT for Phase-2 unit pack placement. `unitUid` is in the
 * printed unit-id shape ({base}-{YYWW}-{SEQ6}) so `looksLikeUnitId` matches it
 * and the Ready-to-Pack loose-unit trigger fires; the move route resolves it by
 * `unit_uid`. `current_status` stays on-floor so it counts at a bench.
 */
export const QA_FIXTURE_UNIT = {
  unitUid: 'QAUNIT-2621-000042',
  normalizedSerial: 'QAUNIT2621000042',
} as const;

export const QA_FIXTURE_ORDERS = {
  awaiting: 'QA-TEST-UNSHIP-AWAIT',
  pending: 'QA-TEST-UNSHIP-PENDING',
  /**
   * A SECOND tracked pending order. The Pending lane filters out rows with no
   * tracking, so `awaiting` never reaches the grid — which left every
   * record→record spec (keyboard `j`/`k` swap, click-through past the inspector)
   * with `test.skip('needs at least two pending rows')`, i.e. permanently
   * unrun. Two tracked rows is the minimum that lane's contract needs.
   */
  pendingSecond: 'QA-TEST-UNSHIP-PENDING-2',
  /** Third tracked pending row — the keyboard specs need to focus a row that is
   *  neither the first nor the second to prove they open THAT row. */
  pendingThird: 'QA-TEST-UNSHIP-PENDING-3',
  /**
   * A PACKED order — tracking + a PACK station-activity row, no SHIP_CONFIRM,
   * which is exactly the `?stagedOnly=true` predicate the Packed lane queries.
   * Without it `/dashboard?packed` is empty on the QA org and every post-pack
   * assertion (lifecycle-scoped bulk actions) failed on an unrendered grid.
   */
  packed: 'QA-TEST-PACKED',
} as const;

/**
 * Product titles for the order fixtures. Exported so a spec can locate a row
 * without re-typing prose that lives in the provisioner — `createFixtureOrder`
 * is `ON CONFLICT DO NOTHING`, so these strings are effectively immutable once a
 * QA org exists and a copy that drifts is a silently-unfindable row.
 */
export const QA_FIXTURE_ORDER_TITLES = {
  awaiting: 'QA — Unshipped AWAITING (add tracking here)',
  pending: 'QA — Unshipped PENDING (tracking assigned)',
  pendingSecond: 'QA — Unshipped PENDING #2 (record→record navigation)',
  pendingThird: 'QA — Unshipped PENDING #3 (focus-a-middle-row keyboard specs)',
  packed: 'QA — PACKED (staged for the dock)',
} as const;

/**
 * Today (`/`) fixtures — the `work_assignments` rows `aggregateMyDayFeed` reads.
 *
 * Before these existed, `my-day-today.spec.ts` had to stub the `GET /api/my-day`
 * body outright: the QA org provisioned no `work_assignments`, so all four lanes
 * and all three due horizons were empty. That stub stayed green through a real
 * bug — `myDayTasksFromFeed` emitted the top work order TWICE on any real feed,
 * because `doNext` is a POINTER into `assigned` (`topWorkOrderForStaff` ranks the
 * same predicate `isMineRow` filters), and every hand-written fixture happened to
 * give `doNext` an id no other row used.
 *
 * **Three TEST assignments, one per due horizon, on the three tracked pending
 * orders.** Those three are the only order fixtures `getOrders` can return:
 * `awaiting` has no `shipment_id`, and `packed` carries a `PACK_COMPLETED`
 * station-activity row, both of which that query excludes.
 *
 * `doNext` is DERIVED, never seeded: with equal status and priority,
 * `compareWorkOrderRows` breaks the tie on deadline, so the overdue row is both
 * `doNext` and `assigned[0]` — which is exactly the pointer relationship the
 * duplicate-row regression lives in, now reproduced against real data.
 */
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
  /**
   * An UNDATED interrupt — a support follow-up assigned to the QA admin. It
   * carries no `deadlineAt`, which is the point: `myDayDueHorizon` must return
   * null rather than folding it into `upcoming` and claiming a due date the
   * record does not have.
   */
  interruptTicketId: 9100,
  /** `listSupportFollowupsForStaff` LEFT-JOINs `support_tickets`, so with no
   *  cached subject the row titles itself from the ticket id. */
  interruptTitle: 'Ticket #9100',
  /** Lower than the default 100 so the fixtures outrank any incidental row. */
  priority: 10,
} as const;

/**
 * Support · Assist vision-loop fixture.
 *
 * The ticket id is the same My Day interrupt — one Zendesk id, two consumers
 * (Today lane + `/support?ticket=`). Provisioning mirrors ZENDESK_* into the
 * QA org vault when those env vars are set, so `/api/support/suggest` clears
 * the helpdesk-connected gate instead of 503-ing vacuously.
 *
 * E2E still stubs the ticket bundle + photo upload: the assertion worth having
 * is the **request contract** (`stagedPhotoIds`, never a URL), not a live draft.
 */
export const QA_FIXTURE_SUPPORT = {
  ticketId: QA_FIXTURE_MY_DAY.interruptTicketId,
  subject: 'QA Assist — carton label paste contract',
} as const;

/**
 * Org custom-column fixture — one `custom_field_defs` row plus a value on two
 * receiving lines, so a LedgerGrid column sort has something to order.
 *
 * **The values are decimals on purpose.** `2.5` vs `2.25` is the one pair that
 * distinguishes a real numeric compare from the string fallback: `numeric: true`
 * collation treats `.` as a separator and reads them as `5` vs `25`, inverting
 * the pair. Whole numbers (`2` vs `10`) would pass either way and prove nothing
 * — the unit suite learned that by mutation
 * (`receiving-grid-compare.test.ts`), and the E2E asserts the same contract
 * through the real stack.
 *
 * Values ride on the two lines that already exist for the testing feeds rather
 * than on `QA-MOCK-LINE-1`/`-2`: a custom value is additive (its own table, no
 * workflow state touched), so this cannot disturb the note-vs-label grain walk
 * the way mutating those two would.
 *
 * The def is `tier: 'optional'` once merged into the column model, so the
 * provisioner also opts the QA admin in via `staff_preferences` — under BOTH
 * the `receiving` and `testing` buckets, which is what proves the Unbox History
 * and Testing History mounts of the same binding each resolve it.
 */
export const QA_FIXTURE_CUSTOM_FIELD = {
  entityType: 'RECEIVING',
  key: 'qa_rack_slot',
  label: 'QA Rack Slot',
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

export interface QaStationStaffSeed {
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

/**
 * Media Library evidence fixtures (2026-08-09) — a real photo stream on
 * `/ops/photos` for the QA org.
 *
 * Before this, `provision-qa-org.ts` seeded **zero** photos (the word did not
 * appear in the file), so every Media Library spec either failed on
 * `--project=qa-desktop` or skipped itself with "no photos seeded in this
 * environment". That is the coverage gap `verify.md` says to seed away rather
 * than skip around.
 *
 * **Metadata-only, deliberately — there are no storage bytes.** The library list
 * query is `FROM photos p` with no `photo_storage` join
 * (`src/lib/photos/queries/library.ts:839`), so a row lists and every routing,
 * filter, day-band and count assertion works while its thumbnail 404s. Seeding
 * bytes would put a GCS dependency in the provisioner and buy no assertion.
 *
 * **The limit of metadata-only, measured 2026-08-09.** Routing / filter / count
 * / day-band assertions pass on these rows — `photos-library-deep-link.spec.ts`
 * is 6/6 green in ~18s, three consecutive runs. **Viewer specs do not**:
 * clicking a tile opens the lightbox, which waits on an image that will never
 * load, so `photos-library-context-panel.spec.ts` and
 * `photo-viewer-dismiss.spec.ts` time out on the click rather than failing an
 * assertion. That is not a bug in those specs and not something a bigger
 * fixture of this shape can fix — they need real bytes (the
 * `photos-gcs-upload.spec.ts` path) or an explicit broken-image tolerance in
 * the viewer. Do not "fix" them by seeding more metadata rows.
 *
 * **Stage is DERIVED, never stored.** `stageFromPhotoType` →
 * `receivingStageFromPhotoType` (`src/lib/receiving/photo-intent.ts:161`):
 * `RECEIVING_LINE` ⇒ `unbox_item` (any photo_type) · `RECEIVING` +
 * `receiving_unbox_carton` ⇒ `unbox_carton` · `RECEIVING` +
 * `receiving_package` ⇒ `arrival_package`. `sourceScope` is derived the same
 * way — a link to `RECEIVING` or `RECEIVING_LINE` yields `unboxing`
 * (`library.ts:832-834`). So the shape of the links below IS the fixture; do
 * not add a `stage` column expecting it to be read.
 *
 * `poRef` doubles as the idempotency scope: re-provisioning deletes by
 * `(organization_id, po_ref)` and re-inserts, and `photo_entity_links` cascades
 * on `photo_id`.
 *
 * `captured` decides whether `client_captured_at` is stamped. The mix is
 * deliberate: `clientCapturedAt` is the device shutter clock and is NOT
 * server-attested, so NULL is the correct and common value for desktop uploads
 * (see the column's docblock in `drizzle/schema.ts`). A fixture where every row
 * was "Captured" would let a Captured-vs-Uploaded assertion pass without ever
 * exercising the absent case.
 */
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
export const QA_FIXTURE_PHOTO_COUNT =
  QA_FIXTURE_PHOTOS.carton.length + QA_FIXTURE_PHOTOS.line.length;

export function resolveQaOrgId(): OrgId {
  const fromEnv = process.env.QA_ORG_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv;
  return QA_ORG_ID;
}
