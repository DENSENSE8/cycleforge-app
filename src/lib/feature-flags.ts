/** Feature flags — sync env-only + async per-tenant infrastructure. */

import pool from '@/lib/db';
import type { OrgId } from './tenancy/constants';

function readBoolEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
}

// ─── Per-tenant override cache ─────────────────────────────────────────────
interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

const flagCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(orgId: OrgId, flag: string): string {
  return `${orgId}:${flag}`;
}

async function readOrgFlag(orgId: OrgId, flag: string): Promise<boolean | null> {
  const key = cacheKey(orgId, flag);
  const cached = flagCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;

  try {
    const r = await pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM organization_feature_flags
        WHERE organization_id = $1 AND flag = $2 LIMIT 1`,
      [orgId, flag],
    );
    const row = r.rows[0];
    if (!row) return null;
    flagCache.set(key, { enabled: row.enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return row.enabled;
  } catch (err) {
    // Don't fail-closed on a flag read — fall back to env so the request
    // path stays alive. Log so the failure isn't silent.
    console.warn(`[feature-flags] failed reading ${flag} for ${orgId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function resolveForOrg(orgId: OrgId, flag: string, envVar: string): Promise<boolean> {
  const override = await readOrgFlag(orgId, flag);
  if (override !== null) return override;
  return readBoolEnv(envVar);
}

/** Public reader for a per-org override flag with no env fallback. */
export async function readOrgFeatureFlag(orgId: OrgId, flag: string): Promise<boolean | null> {
  return readOrgFlag(orgId, flag);
}

function invalidateFeatureFlagCache(orgId?: OrgId, flag?: string): void {
  if (!orgId) {
    flagCache.clear();
    return;
  }
  if (!flag) {
    for (const key of flagCache.keys()) {
      if (key.startsWith(`${orgId}:`)) flagCache.delete(key);
    }
    return;
  }
  flagCache.delete(cacheKey(orgId, flag));
}

/** Per-org flag name for Universal Incoming (eBay buyer purchases on /incoming). */
export const INCOMING_UNIVERSAL_FLAG = 'incoming_universal';

/**
 * Idempotently enable a per-org feature flag and drop the 30s read cache.
 * Used when connecting an eBay purchasing account so Incoming lights up
 * without a separate flag hunt.
 */
export async function enableOrgFeatureFlag(orgId: OrgId, flag: string): Promise<void> {
  await pool.query(
    `INSERT INTO organization_feature_flags (organization_id, flag, enabled)
     VALUES ($1, $2, true)
     ON CONFLICT (organization_id, flag) DO UPDATE
       SET enabled = true, updated_at = NOW()`,
    [orgId, flag],
  );
  invalidateFeatureFlagCache(orgId, flag);
}

// ─── Sync env-only variants ────────────────────────────────────────────────

/** Mobile receiving pipeline rewrite (/m/receiving). */
function isMobileReceivingPipelineV2(): boolean {
  return readBoolEnv('MOBILE_RECEIVING_PIPELINE_V2');
}

/** Warranty Claim Logger + Repair Outcome Tracker — 4th mode on the Orders / Shipping page. */
export function isWarrantyLogger(): boolean {
  return readBoolEnv('WARRANTY_LOGGER', true);
}

/** Google Drive photo backup. */
export function isPhotosDriveBackupEnabled(): boolean {
  return readBoolEnv('PHOTOS_DRIVE_BACKUP_ENABLED', true);
}

/** Physical-state-first receiving queues (receiving-triage streamline Phase 2). */
export function isReceivingPhysicalStateFirst(): boolean {
  return readBoolEnv('RECEIVING_PHYSICAL_STATE_FIRST', true);
}

/** Read the Unbox "Unboxed" rail's `view=unbox_opened` membership from the committed `receiving_unbox.opened_at` street column ONLY,… */
export function isUnboxRailColumnRead(): boolean {
  return readBoolEnv('RECEIVING_UNBOX_RAIL_COLUMN_READ');
}

/** Drift probe for retiring the lines table's `full` fetch tier. */
export function isSerialProjectionDriftProbe(): boolean {
  return readBoolEnv('RECEIVING_SERIAL_PROJECTION_DRIFT_PROBE');
}

/** Unified inbound model (receiving-triage streamline Phase 3). */
export function isReceivingUnifiedInbound(): boolean {
  return readBoolEnv('RECEIVING_UNIFIED_INBOUND', true);
}

/** Auto-link a returned serial to its originating order on the normal unbox serial scan (the shipped↔returned loop). */
export function isReceivingReturnAutolink(): boolean {
  return readBoolEnv('RECEIVING_RETURN_AUTOLINK', true);
}

/** Auto-file a helpdesk ticket when an eBay purchase's item-not-received claim window is about to close while the carton sits… */
export function isReceivingClaimsEscalation(): boolean {
  return readBoolEnv('RECEIVING_CLAIMS_ESCALATION');
}

/** Unified-engine chokepoint cutover (UNIFIED-ENGINE-MASTER-PLAN §1.1). */
export function isUnifiedEngineApplyTransition(): boolean {
  return readBoolEnv('UNIFIED_ENGINE_APPLY_TRANSITION');
}

/** Per-org verdict→status override (Wave 2 / Class A — the §3.A verdict map config deferred out of the Class-D reason-codes work). */
export function isUnifiedEngineVerdictConfig(): boolean {
  return readBoolEnv('UNIFIED_ENGINE_VERDICT_CONFIG');
}

/** Workflow-tap intended-write outbox (roi-execution/03 #10). */
export function isWorkflowTapOutboxEnabled(): boolean {
  return readBoolEnv('WORKFLOW_TAP_OUTBOX');
}

/** Shipped-table read model. */
export function isPackerLogEnrichmentRead(): boolean {
  return readBoolEnv('PACKER_LOG_ENRICHMENT_READ', true);
}

/** Unified-engine fulfillment-tail taps (UNIFIED-ENGINE-MASTER-PLAN §1.4). */
export function isUnifiedEngineFulfillmentTaps(): boolean {
  return readBoolEnv('UNIFIED_ENGINE_FULFILLMENT_TAPS');
}

/** Decision-node ZEN evaluator cutover (UNIFIED-ENGINE-MASTER-PLAN §1.6, Stage 2). */
export function isDecisionEngineZen(): boolean {
  return readBoolEnv('DECISION_ENGINE_ZEN');
}

/** Placement-strangle OBSERVE-ONLY parity logging (UNIFIED-ENGINE-MASTER-PLAN §1.6 Track 1, Stage 1.x). */
export function isPlacementParityObserve(): boolean {
  return readBoolEnv('PLACEMENT_PARITY_OBSERVE');
}

/** Placement-strangle CUTOVER for parts-sort (UNIFIED-ENGINE-MASTER-PLAN §1.6 Track 1, Stage 1.x — the first live site). */
export function isPlacementStranglePartsSort(): boolean {
  return readBoolEnv('PLACEMENT_STRANGLE_PARTS_SORT');
}

/** Placement-strangle CUTOVER for receiving default-putaway (UNIFIED-ENGINE-MASTER-PLAN §1.6 Track 1, Stage 1.x — second live site). */
export function isPlacementStrangleReceivingPutaway(): boolean {
  return readBoolEnv('PLACEMENT_STRANGLE_RECEIVING_PUTAWAY');
}

/** Config-driven RMA restock placement (UNIFIED-ENGINE-MASTER-PLAN §1.6 Track 1, Stage 1.x — third site). */
export function isPlacementStrangleRmaRestock(): boolean {
  return readBoolEnv('PLACEMENT_STRANGLE_RMA_RESTOCK');
}

/** Fulfillment substitution / order-line amendment capability (the ordered-vs-fulfilled deviation flow: */
export function isFulfillmentSubstitution(): boolean {
  return readBoolEnv('FULFILLMENT_SUBSTITUTION');
}

/** Dual-write owner↔tracking linkage into the unified `shipment_links` table. */
function isShipmentLinksDualWrite(): boolean {
  return readBoolEnv('RECEIVING_SHIPMENT_LINKS_DUAL_WRITE', true);
}

/** Universal Incoming (docs/incoming-universal-purchase-orders-plan.md §6, §8.3). */
export async function isIncomingUniversal(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, INCOMING_UNIVERSAL_FLAG, 'INCOMING_UNIVERSAL');
}

/**
 * Per-tenant gate for the buyer-note → entity_signals mirror derivation
 * (plan §2.3 external emitter, eBay first). DB row overrides env
 * BUYER_NOTE_SIGNALS; default off.
 */
export async function isBuyerNoteSignals(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, 'buyer_note_signals', 'BUYER_NOTE_SIGNALS');
}

/** Studio-driven operator-surface composed rendering (operator-surfaces refactor Phase 3b). */
export async function isSurfaceComposedRender(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, 'surface_composed_render', 'SURFACE_COMPOSED_RENDER');
}

/** Unified ops-plan inbox (plan tasks + all work-order queues) — per-org staged rollout (audit F34: */
export async function isOpsPlansUnifiedInbox(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, 'ops_plans_unified_inbox', 'OPS_PLANS_UNIFIED_INBOX');
}

/**
 * Auto-link a failed unit's serial to the carton's primary support ticket.
 * Optional auto-link in recordTestVerdict behind env flag CF_TESTING_AUTO_LINK_TICKET.
 */
export function isTestingAutoLinkTicket(): boolean {
  return readBoolEnv('CF_TESTING_AUTO_LINK_TICKET', false);
}

/** Operations TV / wall-display board (HOME-OPS plan §7, §27, §28). */
export async function isOpsTvBoard(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, 'ops_tv_board', 'OPS_TV_BOARD');
}


/** Home Inbox — per-staff subscriptions + notification feed (Phase 1 of docs/todo/home-triage-subscriptions-*.md). */
export async function isHomeInbox(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, 'home_inbox', 'HOME_INBOX');
}

/** Watch-a-view — queue-threshold alerts + scheduled digests (docs/todo/view-threshold-alerts-and-digests-IMPLEMENTATION-PLAN.md). */
async function isViewMonitors(orgId: OrgId): Promise<boolean> {
  return resolveForOrg(orgId, 'view_monitors', 'VIEW_MONITORS');
}

// ─── Flag lifecycle registry ──────────────────────────────────────────────────
/** Lives in `./feature-flags-lifecycle` — a dependency-free sibling, because this module imports `@/lib/db` (which carries `server-only`)… */
