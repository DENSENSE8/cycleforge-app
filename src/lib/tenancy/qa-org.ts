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
 * Per-org feature flags force-enabled on the QA tenant so gated surfaces are
 * exercisable without flipping global env vars. Names match organization_feature_flags.flag.
 */
export const QA_FEATURE_FLAGS: ReadonlyArray<string> = [
  'studio',
  'surface_composed_render',
  'incoming_universal',
  'ai_search_commandbar',
  'buyer_note_signals',
];

/** Fixture SKUs — QA-BOSE overlaps a common USAV catalog string for isolation tests. */
export const QA_FIXTURE_SKUS = {
  speaker: 'QA-BOSE-SLM2-BK',
  earbuds: 'QA-APPL-APP2-WH',
  overlapProbe: 'BOSE-SLM2-BK',
} as const;

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

export function resolveQaOrgId(): OrgId {
  const fromEnv = process.env.QA_ORG_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv;
  return QA_ORG_ID;
}
