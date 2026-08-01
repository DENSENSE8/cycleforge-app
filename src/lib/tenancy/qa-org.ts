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
