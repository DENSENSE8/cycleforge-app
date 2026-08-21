/**
 * Feature flag LIFECYCLE registry — who owns each flag, and how it ends.
 *
 * Dependency-free on purpose. `feature-flags.ts` imports `@/lib/db`, which
 * carries `server-only`, so a guard or a script that only wants the metadata
 * cannot import it without dragging the Neon pool along (and, in a test,
 * throwing outright). `build-gotchas.md` → bundle altitude is the general rule:
 * light values live in their own module and the heavy module re-exports them,
 * so call sites keep importing `@/lib/feature-flags`.
 *
 * The two-tier flag mechanism (`readBoolEnv` + `resolveForOrg`) was already
 * sound. What it had no answer for is *when a flag stops*. A flag keeps BOTH
 * branches reachable, so dead-code tooling sees two live paths for as long as
 * the flag exists — a permanent strangler is a fork made invisible on purpose.
 *
 * `bornAt` is not a guess: every date is the first commit that introduced the
 * predicate, read out of git history. `area` is a lane, not a person — "whose
 * call is this?" is answered better by the surface than by a name that goes
 * stale when someone changes teams.
 *
 * Enforced by `feature-flags.guard.test.ts`.
 *
 * NOTE — deliberately NOT LaunchDarkly. A vendor would be a second flag system
 * beside the SoT module, which `pattern-evolution.md` forbids outright.
 */

/**
 * The lifecycle SoT for every predicate above.
 *
 * The two-tier mechanism (`readBoolEnv` + `resolveForOrg`) was already sound.
 * What it had no answer for is *when a flag stops*. Several of these are
 * explicitly mid-strangler, and `backend-patterns.md` says the unified-engine
 * path is "mid-strangler, so it is not yet a hard requirement" — a strangler
 * with no deadline is how the losing branch becomes zombie code, because the
 * flag keeps BOTH branches reachable and dead-code tooling therefore sees two
 * live paths forever. That is the same blind spot as a fork with two imported
 * doors, wearing a config file.
 *
 * So each flag declares who owns the decision and what the ending is.
 * `feature-flag-age.guard.test.ts` walks this against the real exports.
 *
 * `bornAt` is not a guess: every date is the first commit that introduced the
 * predicate, read out of git history. `area` is a lane, not a person — the
 * question "whose call is this?" is answered better by the surface than by a
 * name that goes stale when someone changes teams.
 *
 * NOTE — this is deliberately NOT LaunchDarkly. A vendor here would be a second
 * flag system beside the SoT module, which the house rules forbid outright.
 */

type FlagDisposition =
  /** A kill-switch that is meant to live forever. Never ages out. */
  | { readonly kind: 'permanent'; readonly why: string }
  /** A rollout/strangler with a committed end date (civil `YYYY-MM-DD`). */
  | { readonly kind: 'rollout'; readonly plannedRemoval: string }
  /** No decision yet. The guard forces one once the flag passes the age limit. */
  | { readonly kind: 'undecided' };

interface FlagLifecycle {
  /** Env var (sync flags) or `organization_feature_flags.flag` key + env fallback. */
  readonly env: string;
  /** First commit introducing the predicate — civil date, derived from git. */
  readonly bornAt: string;
  /** The lane that owns the retire/keep decision. */
  readonly area: string;
  readonly disposition: FlagDisposition;
}

/** Days a flag may sit `undecided` before the guard demands an answer. */
export const FLAG_AGE_LIMIT_DAYS = 90;

export const FLAG_LIFECYCLE: Readonly<Record<string, FlagLifecycle>> = {
  // — Permanent kill-switches. Each `why` is the module's own docblock claim. —
  isWarrantyLogger: {
    env: 'WARRANTY_LOGGER',
    bornAt: '2026-06-07',
    area: 'support/warranty',
    disposition: {
      kind: 'permanent',
      why: 'GA and always on; the env var is honored as a kill-switch only.',
    },
  },
  isPhotosDriveBackupEnabled: {
    env: 'PHOTOS_DRIVE_BACKUP_ENABLED',
    bornAt: '2026-06-26',
    area: 'photos',
    disposition: {
      kind: 'permanent',
      why: 'Platform-wide halt for the Drive mirror; per-org gate is the vault connection.',
    },
  },

  // — Everything else. `undecided` is an honest state, not a placeholder: —
  // — inventing a plannedRemoval date nobody committed to would be the same —
  // — prose-that-cannot-fail this whole effort is removing.                 —
  isMobileReceivingPipelineV2: {
    env: 'MOBILE_RECEIVING_PIPELINE_V2',
    bornAt: '2026-05-20',
    area: 'receiving/mobile',
    disposition: { kind: 'undecided' },
  },
  isReceivingPhysicalStateFirst: {
    env: 'RECEIVING_PHYSICAL_STATE_FIRST',
    bornAt: '2026-06-09',
    area: 'receiving/triage',
    disposition: { kind: 'undecided' },
  },
  isReceivingUnifiedInbound: {
    env: 'RECEIVING_UNIFIED_INBOUND',
    bornAt: '2026-06-09',
    area: 'receiving/inbound',
    disposition: { kind: 'undecided' },
  },
  isUnboxRailColumnRead: {
    env: 'RECEIVING_UNBOX_RAIL_COLUMN_READ',
    bornAt: '2026-07-14',
    area: 'receiving/unbox',
    disposition: { kind: 'undecided' },
  },
  isReceivingReturnAutolink: {
    env: 'RECEIVING_RETURN_AUTOLINK',
    bornAt: '2026-06-30',
    area: 'receiving/returns',
    disposition: { kind: 'undecided' },
  },
  isReceivingClaimsEscalation: {
    env: 'RECEIVING_CLAIMS_ESCALATION',
    bornAt: '2026-07-29',
    area: 'receiving/claims',
    disposition: { kind: 'undecided' },
  },
  isShipmentLinksDualWrite: {
    env: 'RECEIVING_SHIPMENT_LINKS_DUAL_WRITE',
    bornAt: '2026-06-25',
    area: 'receiving/linkage',
    disposition: { kind: 'undecided' },
  },
  isUnifiedEngineApplyTransition: {
    env: 'UNIFIED_ENGINE_APPLY_TRANSITION',
    bornAt: '2026-06-21',
    area: 'unified-engine',
    disposition: { kind: 'undecided' },
  },
  isUnifiedEngineVerdictConfig: {
    env: 'UNIFIED_ENGINE_VERDICT_CONFIG',
    bornAt: '2026-06-29',
    area: 'unified-engine',
    disposition: { kind: 'undecided' },
  },
  isUnifiedEngineFulfillmentTaps: {
    env: 'UNIFIED_ENGINE_FULFILLMENT_TAPS',
    bornAt: '2026-06-22',
    area: 'unified-engine',
    disposition: { kind: 'undecided' },
  },
  isWorkflowTapOutboxEnabled: {
    env: 'WORKFLOW_TAP_OUTBOX',
    bornAt: '2026-07-10',
    area: 'unified-engine',
    disposition: { kind: 'undecided' },
  },
  isPackerLogEnrichmentRead: {
    env: 'PACKER_LOG_ENRICHMENT_READ',
    bornAt: '2026-06-30',
    area: 'packing',
    disposition: { kind: 'undecided' },
  },
  isDecisionEngineZen: {
    env: 'DECISION_ENGINE_ZEN',
    bornAt: '2026-06-29',
    area: 'placement/decision',
    disposition: { kind: 'undecided' },
  },
  isPlacementParityObserve: {
    env: 'PLACEMENT_PARITY_OBSERVE',
    bornAt: '2026-06-29',
    area: 'placement',
    disposition: { kind: 'undecided' },
  },
  isPlacementStranglePartsSort: {
    env: 'PLACEMENT_STRANGLE_PARTS_SORT',
    bornAt: '2026-06-29',
    area: 'placement',
    disposition: { kind: 'undecided' },
  },
  isPlacementStrangleReceivingPutaway: {
    env: 'PLACEMENT_STRANGLE_RECEIVING_PUTAWAY',
    bornAt: '2026-06-29',
    area: 'placement',
    disposition: { kind: 'undecided' },
  },
  isPlacementStrangleRmaRestock: {
    env: 'PLACEMENT_STRANGLE_RMA_RESTOCK',
    bornAt: '2026-06-29',
    area: 'placement',
    disposition: { kind: 'undecided' },
  },
  isFulfillmentSubstitution: {
    env: 'FULFILLMENT_SUBSTITUTION',
    bornAt: '2026-06-29',
    area: 'fulfillment',
    disposition: { kind: 'undecided' },
  },
  isIncomingUniversal: {
    env: 'INCOMING_UNIVERSAL',
    bornAt: '2026-07-01',
    area: 'receiving/incoming',
    disposition: { kind: 'undecided' },
  },
  isBuyerNoteSignals: {
    env: 'BUYER_NOTE_SIGNALS',
    bornAt: '2026-07-04',
    area: 'orders/signals',
    disposition: { kind: 'undecided' },
  },
  isSurfaceComposedRender: {
    env: 'SURFACE_COMPOSED_RENDER',
    bornAt: '2026-07-05',
    area: 'studio/surfaces',
    disposition: { kind: 'undecided' },
  },
  isOpsPlansUnifiedInbox: {
    env: 'OPS_PLANS_UNIFIED_INBOX',
    bornAt: '2026-07-10',
    area: 'ops-plans',
    disposition: { kind: 'undecided' },
  },
  isTestingAutoLinkTicket: {
    env: 'CF_TESTING_AUTO_LINK_TICKET',
    bornAt: '2026-07-13',
    area: 'testing',
    disposition: { kind: 'undecided' },
  },
  isOpsTvBoard: {
    env: 'OPS_TV_BOARD',
    bornAt: '2026-07-13',
    area: 'operations',
    disposition: { kind: 'undecided' },
  },
  isHomeInbox: {
    env: 'HOME_INBOX',
    bornAt: '2026-07-28',
    area: 'home',
    // Decided 2026-08-08 (WS-TASKS): the Home Inbox is the triage surface for
    // a thrown task, so it stops being hypothetical. Seeded ON for the dogfood
    // org by 2026-08-08c; every other tenant stays OFF until it has proven out.
    // Remove the flag (and its 404 branches) once it has.
    disposition: { kind: 'rollout', plannedRemoval: '2026-10-26' },
  },
  isViewMonitors: {
    env: 'VIEW_MONITORS',
    bornAt: '2026-08-10',
    area: 'monitors',
    // Rollout from birth: dogfood-first (seeded ON for USAV only by
    // 2026-08-10b_seed_view_monitors_usav.sql), widened past dogfood once the
    // evaluation CU-hour budget is tracked (plan → Cost budget). Remove the flag
    // and the arm/route 404 branches once it has proven out.
    disposition: { kind: 'rollout', plannedRemoval: '2026-11-10' },
  },
};
