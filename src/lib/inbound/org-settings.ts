/**
 * Per-org Universal Incoming settings resolver (plan §9.6).
 *
 * Reads `organizations.settings.inbound` (schema + defaults policed by
 * src/lib/tenancy/settings.ts — the SoT for that jsonb bag) and exposes the
 * tenant's inbound policy: post-merge display source, the Zoho PO fields that
 * carry an eBay order#, which signals may auto-merge, whether a fuzzy match needs
 * review, and which inbound sources are enabled. The Studio publish gate validates
 * bound sources ⊆ `enabledSources`; the merge/matcher read the rest.
 *
 * `enabledSources` resolution (the ONE resolution point — no other reader may
 * re-derive it):
 *   - org persisted an explicit list (even an empty one) → kept verbatim;
 *   - org never chose → CONNECTION-DRIVEN default: 'manual' always, 'zoho' when
 *     the org's inventory capability resolves to the zoho provider (vault row, or
 *     the dogfood env-fallback probe inside capability-connections), 'ebay' when
 *     a connected active buyer account exists. 'amazon' is deliberately absent —
 *     Amazon inbound has no connection precedent yet (see source-registry).
 *   - no org / unreadable settings / probe failure → the legacy compatibility
 *     default ['zoho','ebay'] (what the zod default used to hardcode), so a
 *     transient vault/DB hiccup can never brick Incoming.
 *
 * Deps-injected (default real impls) so tests run DB-free. Tolerant: a missing
 * org / unparseable settings falls back to defaults rather than throwing
 * (mirrors resolveWarrantyDays).
 */

import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { parseOrgSettings, getInboundSettings, type InboundOrgSettings } from '@/lib/tenancy/settings';
import { connectedProviderKey } from '@/lib/integrations/capability-connections';
import { hasConnectedEbayBuyerAccount } from '@/lib/ebay/credentials';
import { isRegisteredInboundSource, type InboundSourceType } from './source-registry';

export type { InboundOrgSettings };

/**
 * What the resolver falls back to when it cannot derive from connections
 * (no orgId, unreadable settings, probe failure). This is the pre-2026-07
 * hardcoded zod default, kept only as a compatibility floor.
 */
const LEGACY_ENABLED_SOURCES: readonly string[] = ['zoho', 'ebay'];

export interface InboundSettingsDeps {
  query: <T>(sql: string, params?: ReadonlyArray<unknown>) => Promise<{ rows: T[] }>;
  /** Provider key backing the org's inventory capability (vault, or the dogfood env probe). */
  inventoryProviderKey: (orgId: OrgId) => Promise<string | null>;
  /** Does the org have ≥1 connected, active eBay buyer account? */
  hasEbayBuyerAccount: (orgId: OrgId) => Promise<boolean>;
}

const defaultDeps: InboundSettingsDeps = {
  query: (sql, params) => pool.query(sql, params as unknown[]) as unknown as Promise<{ rows: never[] }>,
  inventoryProviderKey: (orgId) => connectedProviderKey(orgId, 'inventory'),
  hasEbayBuyerAccount: (orgId) => hasConnectedEbayBuyerAccount(orgId),
};

/**
 * Connection-driven default for orgs that never explicitly chose their inbound
 * sources. Order follows the registry display order (zoho, ebay, manual).
 */
async function deriveEnabledSourcesFromConnections(
  orgId: OrgId,
  deps: InboundSettingsDeps,
): Promise<string[]> {
  const [inventoryProvider, hasBuyer] = await Promise.all([
    deps.inventoryProviderKey(orgId),
    deps.hasEbayBuyerAccount(orgId),
  ]);
  const enabled: InboundSourceType[] = [];
  if (inventoryProvider === 'zoho') enabled.push('zoho');
  if (hasBuyer) enabled.push('ebay');
  // 'amazon': no inbound connection precedent yet — do not invent one here.
  enabled.push('manual'); // manual entry needs no integration; always available
  return enabled;
}

/** Resolve the org's inbound policy (schema defaults when unset/invalid). */
export async function resolveInboundSettings(
  orgId: OrgId | null | undefined,
  deps: InboundSettingsDeps = defaultDeps,
): Promise<InboundOrgSettings> {
  if (!orgId) {
    return { ...getInboundSettings(parseOrgSettings({})), enabledSources: [...LEGACY_ENABLED_SOURCES] };
  }
  try {
    const { rows } = await deps.query<{ settings: unknown }>(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    const raw = getInboundSettings(parseOrgSettings(rows[0]?.settings ?? {}));
    if (raw.enabledSources !== undefined) {
      // Explicit org choice (even []) is kept verbatim.
      return { ...raw, enabledSources: raw.enabledSources };
    }
    // Never chose → connection-driven default; a probe failure degrades only
    // this field to the legacy floor, keeping the rest of the persisted policy.
    let enabledSources: string[];
    try {
      enabledSources = await deriveEnabledSourcesFromConnections(orgId, deps);
    } catch {
      enabledSources = [...LEGACY_ENABLED_SOURCES];
    }
    return { ...raw, enabledSources };
  } catch {
    return { ...getInboundSettings(parseOrgSettings({})), enabledSources: [...LEGACY_ENABLED_SOURCES] };
  }
}

/**
 * True when `source` is BOTH a registered inbound source AND enabled for this
 * org. Unknown/registry-absent sources are never enabled (fail-closed).
 */
export function isInboundSourceEnabled(settings: InboundOrgSettings, source: string): boolean {
  const s = source.trim().toLowerCase();
  return isRegisteredInboundSource(s) && settings.enabledSources.map((x) => x.toLowerCase()).includes(s);
}
