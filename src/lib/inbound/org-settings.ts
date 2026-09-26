/** Per-org Universal Incoming settings resolver (plan §9.6). */

import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { parseOrgSettings, getInboundSettings, type InboundOrgSettings, type InboundOrgSettingsRaw } from '@/lib/tenancy/settings';
import { updateOrgSettings } from '@/lib/tenancy/organizations';
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

export interface EnsureEbayInboundDeps extends InboundSettingsDeps {
  /** Persist a shallow top-level settings patch (`inbound` replaces that key). */
  updateSettings: (orgId: OrgId, patch: { inbound: InboundOrgSettingsRaw }) => Promise<void>;
}

const defaultEnsureDeps: EnsureEbayInboundDeps = {
  ...defaultDeps,
  updateSettings: (orgId, patch) => updateOrgSettings(orgId, patch),
};

function listHasEbay(sources: readonly string[]): boolean {
  return sources.map((x) => x.toLowerCase()).includes('ebay');
}

/** Persist `ebay` into `organizations.settings.inbound.enabledSources`. */
export async function ensureEbayInboundSourceEnabled(
  orgId: OrgId,
  deps: EnsureEbayInboundDeps = defaultEnsureDeps,
): Promise<{ changed: boolean; enabledSources: string[] }> {
  const { rows } = await deps.query<{ settings: unknown }>(
    `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
    [orgId],
  );
  if (!rows[0]) {
    return { changed: false, enabledSources: [] };
  }

  const raw = getInboundSettings(parseOrgSettings(rows[0].settings ?? {}));
  const existing = raw.enabledSources;

  if (existing !== undefined && listHasEbay(existing)) {
    return { changed: false, enabledSources: [...existing] };
  }

  let next: string[];
  if (existing !== undefined) {
    next = [...existing, 'ebay'];
  } else {
    try {
      next = await deriveEnabledSourcesFromConnections(orgId, deps);
    } catch {
      next = ['manual'];
    }
    if (!listHasEbay(next)) {
      const manualIdx = next.findIndex((s) => s.toLowerCase() === 'manual');
      if (manualIdx >= 0) {
        next = [...next.slice(0, manualIdx), 'ebay', ...next.slice(manualIdx)];
      } else {
        next = [...next, 'ebay'];
      }
    }
  }

  await deps.updateSettings(orgId, {
    inbound: {
      displaySourceAfterMerge: raw.displaySourceAfterMerge,
      zohoOrderNumberFields: raw.zohoOrderNumberFields,
      autoMergeSignals: raw.autoMergeSignals,
      fuzzyMergeRequiresReview: raw.fuzzyMergeRequiresReview,
      enabledSources: next,
    },
  });
  return { changed: true, enabledSources: next };
}
