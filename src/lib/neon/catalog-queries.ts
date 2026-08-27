/**
 * Query layer for the org-scoped platform / type catalog
 * (migration 2026-06-13g_platform_account_type_catalog.sql).
 *
 * These power the CRUD editor that lets each org add / rename / hide / reorder
 * its own platforms + receiving flow types instead of the old hardcoded
 * SOURCE_PLATFORMS / RECEIVING_TYPE_OPTS constants. Every query is org-scoped —
 * the caller passes `ctx.organizationId` from withAuth, never the request.
 *
 * Soft delete = `is_active = false` (the row is kept so a slug can be revived
 * and audit history stays intact); the list endpoints return active rows only
 * by default.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { SUBSTITUTION_REASONS } from '@/lib/fulfillment/substitution-reasons';
import { SHORT_PICK_REASONS } from '@/lib/picking/short-pick-reasons';
import { REPAIR_FAILURE_REASONS } from '@/lib/repair/repair-failure-reasons';
import { RECEIVING_EXCEPTION_CODES, RECEIVING_EXCEPTION_META } from '@/lib/receiving/exception-codes';
import { SKU_STOCK_REASONS } from '@/lib/sku/sku-stock-reasons';
import { SERIAL_ABSENT_REASONS } from '@/lib/receiving/serial-absent-reasons';
import { STATION_COMMAND_FLOW_CONTEXT } from '@/lib/stations/station-command-codes';
import { listSeedableCommandCodes } from '@/lib/stations/command-book';
import { SYSTEM_PURPOSES } from '@/lib/sessions/purpose-catalog';

export interface PlatformRow {
  id: number;
  organization_id: string;
  slug: string;
  label: string;
  tone: string | null;
  /** Optional `#RRGGBB` accent; ink/softFill derived via color-contrast SoT. */
  color_hex: string | null;
  provider: string | null;
  sort_order: number;
  is_active: boolean;
  /** Seeded built-in (hide-only, immutable slug) vs the org's own custom row. */
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface TypeRow {
  id: number;
  organization_id: string;
  slug: string;
  label: string;
  kind: string;
  /** Optional `#RRGGBB` accent; ink/softFill derived via color-contrast SoT. */
  color_hex: string | null;
  platform_account_id: number | null;
  workflow_node_id: string | null;
  is_return: boolean;
  sort_order: number;
  is_active: boolean;
  /** Seeded built-in (hide-only, immutable slug) vs the org's own custom row. */
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAccountRow {
  id: number;
  organization_id: string;
  platform_id: number;
  slug: string;
  label: string;
  /** → organization_integrations.scope (the specific connection). */
  integration_scope: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Built-in seed data — the source of truth for `seedOrgCatalog`. Mirrors the
// VALUES in migration 2026-06-13g (keep in sync if you add a default).
const SEED_PLATFORMS: Array<[slug: string, label: string, tone: string, sort: number]> = [
  ['ebay', 'eBay', 'text-yellow-500', 10],
  ['amazon', 'Amazon', 'text-orange-600', 20],
  ['fba', 'FBA', 'text-orange-600', 30],
  ['aliexpress', 'AliExpress', 'text-red-500', 40],
  ['walmart', 'Walmart', 'text-amber-700', 50],
  ['goodwill', 'Goodwill', 'text-sky-600', 60],
  ['ecwid', 'ECWID-RS', 'text-blue-600', 70],
  ['other', 'Other', 'text-text-soft', 99],
];
const SEED_TYPES: Array<[slug: string, label: string, kind: string, isReturn: boolean, sort: number]> = [
  ['po', 'PO', 'both', false, 10],
  ['return', 'Return', 'receiving', true, 20],
  ['repair', 'Repair', 'receiving', false, 25],
  ['trade_in', 'Trade In', 'receiving', false, 30],
  ['pickup', 'Pick Up', 'receiving', false, 40],
];

/**
 * Idempotently seed an org's built-in platforms + types. Called on org
 * creation (provisioning hook) so new tenants start with the defaults; safe to
 * re-run — existing rows (by slug) are left untouched.
 */
export async function seedOrgCatalog(organizationId: OrgId): Promise<void> {
  await withTenantTransaction(organizationId, async (client) => {
    for (const [slug, label, tone, sort] of SEED_PLATFORMS) {
      await client.query(
        `INSERT INTO platforms (organization_id, slug, label, tone, sort_order, is_system)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (organization_id, slug) DO NOTHING`,
        [organizationId, slug, label, tone, sort],
      );
    }
    for (const [slug, label, kind, isReturn, sort] of SEED_TYPES) {
      await client.query(
        `INSERT INTO types (organization_id, slug, label, kind, is_return, sort_order, is_system)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (organization_id, slug) DO NOTHING`,
        [organizationId, slug, label, kind, isReturn, sort],
      );
    }
    // Class-D substitution reason vocabulary (flow_context='substitution'),
    // derived from the built-in registry SoT (substitution-reasons.ts) so the
    // codes/labels never drift. `category` is NULL — the inventory ledger axis
    // doesn't apply. Mirrors migration 2026-06-28_reason_codes_flow_context.sql.
    let subSort = 0;
    for (const r of SUBSTITUTION_REASONS) {
      subSort += 10;
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', 'substitution', $4)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, r.code, r.label, subSort],
      );
    }
    let spSort = 0;
    for (const r of SHORT_PICK_REASONS) {
      spSort += 10;
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', 'short_pick', $4)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, r.code, r.label, spSort],
      );
    }
    let rfSort = 0;
    for (const r of REPAIR_FAILURE_REASONS) {
      rfSort += 10;
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', 'repair_failure', $4)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, r.code, r.label, rfSort],
      );
    }
    // Receiving-exception vocabulary is BEHAVIOR-BEARING (codes stay system, owned
    // by exception-codes.ts); seeded here only so tenants can see/relabel them.
    let reSort = 0;
    for (const code of RECEIVING_EXCEPTION_CODES) {
      reSort += 10;
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', 'receiving_exception', $4)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, code, RECEIVING_EXCEPTION_META[code].label, reSort],
      );
    }
    // SKU-stock quick-adjust reasons (codes stay system — the replenish trigger
    // keys on 'SOLD'; seeded for tenant relabeling).
    let ssSort = 0;
    for (const r of SKU_STOCK_REASONS) {
      ssSort += 10;
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', 'inventory_adjust', $4)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, r.code, r.label, ssSort],
      );
    }
    // Serial-absent waiver reasons (flow_context='serial_absent_reason') — why a
    // received unit was committed with no serial. Built-in registry SoT is
    // serial-absent-reasons.ts; tenant-relabelable. Mirrors migration
    // 2026-06-29e_reason_codes_serial_absent.sql.
    let saSort = 0;
    for (const r of SERIAL_ABSENT_REASONS) {
      saSort += 10;
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', 'serial_absent_reason', $4)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, r.code, r.label, saSort],
      );
    }
    // Station command barcodes (flow_context='station_command') — every physical
    // CMD-* sticker: jumps between surfaces, verdict/compound actions, and the
    // session modes this block originally covered. Seeded for Admin view +
    // 2×1 print; behaviour stays code-owned in the registries.
    //
    // The list is DERIVED (`listSeedableCommandCodes` unions all three
    // registries) rather than iterating one of them. This block read only
    // STATION_COMMAND_CODES until 2026-08-20, which was correct while that was
    // the whole vocabulary — but it meant every code added to the nav or action
    // registry was invisible in Admin for every org, with nothing to notice.
    // Backfill for orgs that already existed:
    // migration 2026-08-20d_reason_codes_command_vocabulary.sql.
    for (const r of listSeedableCommandCodes()) {
      await client.query(
        `INSERT INTO reason_codes (organization_id, code, label, category, direction, flow_context, sort_order)
         VALUES ($1, $2, $3, NULL, 'either', $4, $5)
         ON CONFLICT (organization_id, flow_context, code) DO NOTHING`,
        [organizationId, r.code, r.label, STATION_COMMAND_FLOW_CONTEXT, r.sortOrder],
      );
    }
    for (const seed of SYSTEM_PURPOSES) {
      await client.query(
        `INSERT INTO work_session_purposes
           (organization_id, key, label, default_kind, default_surface_key, is_system, sort_order)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (organization_id, key) DO NOTHING`,
        [
          organizationId,
          seed.key,
          seed.label,
          seed.defaultKind,
          seed.defaultSurfaceKey,
          seed.sortOrder,
        ],
      );
    }
    await syncEbayAccountsToPlatformAccounts(organizationId, client);
    await client.query(
      `INSERT INTO platform_accounts (organization_id, platform_id, slug, label, is_active)
       SELECT p.organization_id, p.id, p.slug || '-main', p.label, true
         FROM platforms p
        WHERE p.organization_id = $1 AND p.slug <> 'ebay'
       ON CONFLICT (organization_id, platform_id, slug) DO NOTHING`,
      [organizationId],
    );
  });
}

/**
 * Mirror eBay seller/buyer rows in `ebay_accounts` into `platform_accounts` so the
 * catalog + Incoming account chip stay in sync after OAuth connect (the one-shot
 * migration 2026-06-14f backfill does not re-run on its own). Skips ZOHO token
 * rows (platform='ZOHO'). `integration_scope` matches the vault scope
 * (`seller:{slug}` / `buyer:{slug}`).
 */
export async function syncEbayAccountsToPlatformAccounts(
  organizationId: OrgId,
  client?: { query: (text: string, params?: unknown[]) => Promise<unknown> },
): Promise<void> {
  const sql = `INSERT INTO platform_accounts (organization_id, platform_id, slug, label, integration_scope, is_active)
       SELECT ea.organization_id,
              p.id,
              ea.account_name,
              ea.account_name,
              CASE
                WHEN lower(COALESCE(ea.account_role, 'seller')) = 'buyer'
                  THEN 'buyer:' || ea.account_name
                ELSE 'seller:' || ea.account_name
              END,
              COALESCE(ea.is_active, true)
         FROM ebay_accounts ea
         JOIN platforms p ON p.organization_id = ea.organization_id AND p.slug = 'ebay'
        WHERE ea.organization_id = $1
          AND (ea.platform = 'EBAY' OR ea.platform IS NULL)
          AND ea.account_name IS NOT NULL AND BTRIM(ea.account_name) <> ''
       ON CONFLICT (organization_id, platform_id, slug) DO UPDATE SET
         integration_scope = EXCLUDED.integration_scope,
         is_active         = EXCLUDED.is_active,
         updated_at        = NOW()`;
  if (client) {
    await client.query(sql, [organizationId]);
    return;
  }
  await tenantQuery(organizationId, sql, [organizationId]);
}

/** lowercase-kebab/underscore slug from a free-text label. */
export function slugify(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

// ─── platforms ────────────────────────────────────────────────────────────────

export async function listPlatforms(
  organizationId: OrgId,
  opts: { includeInactive?: boolean } = {},
): Promise<PlatformRow[]> {
  const res = await tenantQuery<PlatformRow>(
    organizationId,
    `SELECT * FROM platforms
      WHERE organization_id = $1
        AND ($2::boolean OR is_active)
      ORDER BY sort_order ASC, label ASC`,
    [organizationId, opts.includeInactive ?? false],
  );
  return res.rows;
}

export async function getPlatformById(organizationId: OrgId, id: number): Promise<PlatformRow | null> {
  const res = await tenantQuery<PlatformRow>(
    organizationId,
    `SELECT * FROM platforms WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return res.rows[0] ?? null;
}

export async function createPlatform(
  organizationId: OrgId,
  data: {
    slug: string;
    label: string;
    tone?: string | null;
    colorHex?: string | null;
    provider?: string | null;
    sortOrder?: number;
  },
): Promise<PlatformRow> {
  const res = await tenantQuery<PlatformRow>(
    organizationId,
    `INSERT INTO platforms (organization_id, slug, label, tone, color_hex, provider, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      organizationId,
      data.slug,
      data.label,
      data.tone ?? null,
      data.colorHex ?? null,
      data.provider ?? null,
      data.sortOrder ?? 100,
    ],
  );
  return res.rows[0];
}

export async function updatePlatform(
  organizationId: OrgId,
  id: number,
  data: {
    label?: string;
    tone?: string | null;
    colorHex?: string | null;
    provider?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<PlatformRow | null> {
  // Dynamic SET so nullable fields (tone / color_hex) can be cleared with null;
  // COALESCE would leave the previous value and make "reset to builtin" impossible.
  const sets: string[] = [];
  const params: unknown[] = [organizationId, id];
  let i = 3;
  if (data.label !== undefined) {
    sets.push(`label = $${i++}`);
    params.push(data.label);
  }
  if (data.tone !== undefined) {
    sets.push(`tone = $${i++}`);
    params.push(data.tone);
  }
  if (data.colorHex !== undefined) {
    sets.push(`color_hex = $${i++}`);
    params.push(data.colorHex);
  }
  if (data.provider !== undefined) {
    sets.push(`provider = $${i++}`);
    params.push(data.provider);
  }
  if (data.sortOrder !== undefined) {
    sets.push(`sort_order = $${i++}`);
    params.push(data.sortOrder);
  }
  if (data.isActive !== undefined) {
    sets.push(`is_active = $${i++}`);
    params.push(data.isActive);
  }
  if (sets.length === 0) {
    return getPlatformById(organizationId, id);
  }
  const res = await tenantQuery<PlatformRow>(
    organizationId,
    `UPDATE platforms SET ${sets.join(', ')}
     WHERE organization_id = $1 AND id = $2
     RETURNING *`,
    params,
  );
  return res.rows[0] ?? null;
}

// ─── types ──────────────────────────────────────────────────────────────────

export interface PriorityTierRow {
  id: number;
  organization_id: string;
  /** 0..3 — PRIORITY_OVERRIDE_TIERS[].value. Identity AND display order. */
  tier: number;
  label: string;
  short: string;
  /** Optional `#RRGGBB` accent; ink/softFill derived via color-contrast SoT. */
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET the org's priority-ladder overrides. Usually EMPTY — a row exists only
 * for a rung someone renamed or repainted, and the client merges these over
 * `PRIORITY_OVERRIDE_TIERS` by tier. Ordered by tier so the caller never has to
 * re-sort into ladder order.
 */
export async function listPriorityTiers(organizationId: OrgId): Promise<PriorityTierRow[]> {
  const res = await tenantQuery<PriorityTierRow>(
    organizationId,
    `SELECT * FROM priority_tiers WHERE organization_id = $1 ORDER BY tier ASC`,
    [organizationId],
  );
  return res.rows;
}

export async function getPriorityTier(
  organizationId: OrgId,
  tier: number,
): Promise<PriorityTierRow | null> {
  const res = await tenantQuery<PriorityTierRow>(
    organizationId,
    `SELECT * FROM priority_tiers WHERE organization_id = $1 AND tier = $2`,
    [organizationId, tier],
  );
  return res.rows[0] ?? null;
}

/**
 * UPSERT one rung. An upsert rather than an update because the absence of a row
 * is the default state, so the first edit of a rung must create it — and the
 * client addresses a TIER, which it always knows, not a row id it would have to
 * discover. `defaults` carry the built-in label/short so a first-time write of
 * only `colorHex` still lands a complete row.
 *
 * `colorHex: null` clears the accent back to the built-in tone; `undefined`
 * leaves existing paint alone, hence the explicit sentinel rather than COALESCE
 * (same treatment as {@link updateType}'s bindings).
 */
export async function upsertPriorityTier(
  organizationId: OrgId,
  tier: number,
  data: { label?: string; short?: string; colorHex?: string | null },
  defaults: { label: string; short: string },
): Promise<PriorityTierRow | null> {
  const setColor = Object.prototype.hasOwnProperty.call(data, 'colorHex');
  const res = await tenantQuery<PriorityTierRow>(
    organizationId,
    `INSERT INTO priority_tiers (organization_id, tier, label, short, color_hex)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, tier) DO UPDATE SET
       label     = COALESCE($6, priority_tiers.label),
       short     = COALESCE($7, priority_tiers.short),
       color_hex = CASE WHEN $8::boolean THEN $5 ELSE priority_tiers.color_hex END,
       updated_at = now()
     RETURNING *`,
    [
      organizationId,
      tier,
      data.label ?? defaults.label,
      data.short ?? defaults.short,
      setColor ? (data.colorHex ?? null) : null,
      data.label ?? null,
      data.short ?? null,
      setColor,
    ],
  );
  return res.rows[0] ?? null;
}

/** Reset a rung to its built-in label / short / tone. */
export async function deletePriorityTier(organizationId: OrgId, tier: number): Promise<boolean> {
  const res = await tenantQuery(
    organizationId,
    `DELETE FROM priority_tiers WHERE organization_id = $1 AND tier = $2`,
    [organizationId, tier],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listTypes(
  organizationId: OrgId,
  opts: { includeInactive?: boolean } = {},
): Promise<TypeRow[]> {
  const res = await tenantQuery<TypeRow>(
    organizationId,
    `SELECT * FROM types
      WHERE organization_id = $1
        AND ($2::boolean OR is_active)
      ORDER BY sort_order ASC, label ASC`,
    [organizationId, opts.includeInactive ?? false],
  );
  return res.rows;
}

export async function getTypeById(organizationId: OrgId, id: number): Promise<TypeRow | null> {
  const res = await tenantQuery<TypeRow>(
    organizationId,
    `SELECT * FROM types WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return res.rows[0] ?? null;
}

export async function createType(
  organizationId: OrgId,
  data: {
    slug: string;
    label: string;
    kind?: string;
    colorHex?: string | null;
    isReturn?: boolean;
    sortOrder?: number;
    platformAccountId?: number | null;
    workflowNodeId?: string | null;
  },
): Promise<TypeRow> {
  const res = await tenantQuery<TypeRow>(
    organizationId,
    `INSERT INTO types
       (organization_id, slug, label, kind, color_hex, is_return, sort_order, platform_account_id, workflow_node_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      organizationId,
      data.slug,
      data.label,
      data.kind ?? 'receiving',
      data.colorHex ?? null,
      data.isReturn ?? false,
      data.sortOrder ?? 100,
      data.platformAccountId ?? null,
      data.workflowNodeId ?? null,
    ],
  );
  return res.rows[0];
}

export async function updateType(
  organizationId: OrgId,
  id: number,
  data: {
    label?: string;
    kind?: string;
    // `null` clears the accent back to the built-in registry tone — so this
    // takes the same sentinel treatment as the bindings below, never COALESCE.
    colorHex?: string | null;
    isReturn?: boolean;
    sortOrder?: number;
    isActive?: boolean;
    // `null` is a meaningful value (clear the binding) — distinct from
    // `undefined` (leave unchanged). The route passes a sentinel so COALESCE
    // can't collapse an intentional clear back to the existing value.
    platformAccountId?: number | null;
    workflowNodeId?: string | null;
  },
): Promise<TypeRow | null> {
  const setBinding = Object.prototype.hasOwnProperty.call(data, 'platformAccountId');
  const setWorkflow = Object.prototype.hasOwnProperty.call(data, 'workflowNodeId');
  const setColor = Object.prototype.hasOwnProperty.call(data, 'colorHex');
  const res = await tenantQuery<TypeRow>(
    organizationId,
    `UPDATE types SET
       label               = COALESCE($3, label),
       kind                = COALESCE($4, kind),
       is_return           = COALESCE($5, is_return),
       sort_order          = COALESCE($6, sort_order),
       is_active           = COALESCE($7, is_active),
       platform_account_id = CASE WHEN $8::boolean THEN $9::bigint ELSE platform_account_id END,
       workflow_node_id    = CASE WHEN $10::boolean THEN $11::text ELSE workflow_node_id END,
       color_hex           = CASE WHEN $12::boolean THEN $13::varchar ELSE color_hex END
     WHERE organization_id = $1 AND id = $2
     RETURNING *`,
    [
      organizationId,
      id,
      data.label ?? null,
      data.kind ?? null,
      data.isReturn ?? null,
      data.sortOrder ?? null,
      data.isActive ?? null,
      setBinding,
      data.platformAccountId ?? null,
      setWorkflow,
      data.workflowNodeId ?? null,
      setColor,
      data.colorHex ?? null,
    ],
  );
  return res.rows[0] ?? null;
}

// ─── platform_accounts ────────────────────────────────────────────────────────

export async function listPlatformAccounts(
  organizationId: OrgId,
  opts: { platformId?: number; includeInactive?: boolean } = {},
): Promise<PlatformAccountRow[]> {
  const res = await tenantQuery<PlatformAccountRow>(
    organizationId,
    `SELECT * FROM platform_accounts
      WHERE organization_id = $1
        AND ($2::boolean OR is_active)
        AND ($3::bigint IS NULL OR platform_id = $3)
      ORDER BY platform_id ASC, label ASC`,
    [organizationId, opts.includeInactive ?? false, opts.platformId ?? null],
  );
  return res.rows;
}

export async function getPlatformAccountById(
  organizationId: OrgId,
  id: number,
): Promise<PlatformAccountRow | null> {
  const res = await tenantQuery<PlatformAccountRow>(
    organizationId,
    `SELECT * FROM platform_accounts WHERE organization_id = $1 AND id = $2`,
    [organizationId, id],
  );
  return res.rows[0] ?? null;
}

export async function createPlatformAccount(
  organizationId: OrgId,
  data: { platformId: number; slug: string; label: string; integrationScope?: string | null },
): Promise<PlatformAccountRow> {
  const res = await tenantQuery<PlatformAccountRow>(
    organizationId,
    `INSERT INTO platform_accounts (organization_id, platform_id, slug, label, integration_scope)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [organizationId, data.platformId, data.slug, data.label, data.integrationScope ?? null],
  );
  return res.rows[0];
}

export async function updatePlatformAccount(
  organizationId: OrgId,
  id: number,
  data: { label?: string; integrationScope?: string | null; isActive?: boolean },
): Promise<PlatformAccountRow | null> {
  const setScope = Object.prototype.hasOwnProperty.call(data, 'integrationScope');
  const res = await tenantQuery<PlatformAccountRow>(
    organizationId,
    `UPDATE platform_accounts SET
       label             = COALESCE($3, label),
       integration_scope = CASE WHEN $4::boolean THEN $5::text ELSE integration_scope END,
       is_active         = COALESCE($6, is_active)
     WHERE organization_id = $1 AND id = $2
     RETURNING *`,
    [organizationId, id, data.label ?? null, setScope, data.integrationScope ?? null, data.isActive ?? null],
  );
  return res.rows[0] ?? null;
}
