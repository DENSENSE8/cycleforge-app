/** Platform display SoT — the org catalog (`platforms` + `platform_accounts`) resolved into the three faces every surface paints: */

import type { PlatformAccountRow, PlatformRow } from '@/lib/neon/catalog-queries';
import type { StoreLinkRow } from '@/lib/catalog/integration-store-links';
import { inferMarketplaceFromOrderId, resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { sourcePlatformMeta, type SourcePlatformMeta } from '@/lib/source-platform';
import { getOrderPlatformLabel } from '@/utils/order-platform';

/** `platforms.short_label` / `platform_accounts.short_label` CHECK bound. */
export const PLATFORM_SHORT_LABEL_MAX = 8;

/**
 * Built-in dense faces — what the 2x1 label hard-coded before orgs could set
 * their own. Keyed by lower-case slug; `unfound` is the unmatched-carton
 * pseudo-platform, not a registry row.
 */
const BUILTIN_SHORT_LABELS: Readonly<Record<string, string>> = {
  amazon: 'AMZ',
  unfound: 'UNF',
};

/** Built-in compact for a platform slug / label, or null. */
export function builtinPlatformShortLabel(value: string | null | undefined): string | null {
  return BUILTIN_SHORT_LABELS[String(value ?? '').trim().toLowerCase()] ?? null;
}

/** Editor input → the stored value: trimmed, upper-case; blank clears (null). */
export function normalizeShortLabelInput(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return s || null;
}

/** A platform's own dense face: org `short_label` → built-in compact → null. */
function platformShortLabelOverride(
  row: Pick<PlatformRow, 'slug' | 'short_label'>,
): string | null {
  return row.short_label?.trim() || builtinPlatformShortLabel(row.slug);
}

/** Catalog-aware {@link SourcePlatformMeta} for one platform row: */
export function catalogPlatformMeta(
  row: Pick<PlatformRow, 'slug' | 'label' | 'tone' | 'color_hex'>,
): SourcePlatformMeta {
  const key = row.slug.trim().toLowerCase();
  const builtin = sourcePlatformMeta(key);
  const accentHex = row.color_hex?.trim() || null;
  return {
    value: key,
    // The hue is the pinned brand fact and stays the built-in's even when an
    // org overrides the paint: `accentHex` changes the ink, not which colour
    // this channel IS.
    hue: builtin.hue,
    label: row.label,
    mark: builtin.mark || row.label.slice(0, 2),
    text: accentHex ? '' : (row.tone ?? builtin.text),
    border: accentHex ? '' : builtin.border,
    dot: builtin.dot || 'bg-border-emphasis',
    accentHex,
    tileSrc: builtin.tileSrc,
  };
}

/** One order's channel, resolved against the org catalog. */
export interface PlatformDisplay {
  /** Full display name. */
  label: string;
  /** Dense face: connection short → platform short → built-in compact → {@link label}. */
  shortLabel: string;
  /** The storefront (`platform_accounts.label`) when it differs from the label; else null. */
  connectionName: string | null;
  /** Dot / tone / chip meta — order-number shape wins over `account_source`. */
  meta: SourcePlatformMeta;
}

/** Full storefront identity for detail surfaces: marketplace plus the linked account. */
export function platformDisplayName(
  channel: Pick<PlatformDisplay, 'label' | 'connectionName'>,
): string {
  return channel.connectionName ? `${channel.label} · ${channel.connectionName}` : channel.label;
}

/** `resolve(orderId, accountSource)` → {@link PlatformDisplay}. */
export type OrderChannelResolver = (
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
) => PlatformDisplay;

const lower = (s: string) => s.trim().toLowerCase();

/** `account_source` → the catalog account + platform it names, or nulls. */
export function buildAccountSourceLookup(
  platforms: readonly PlatformRow[],
  accounts: readonly PlatformAccountRow[],
): (accountSource: string | null | undefined) => { account: PlatformAccountRow | null; platform: PlatformRow | null } {
  const platformById = new Map(platforms.map((p) => [p.id, p]));
  const platformBySlug = new Map(platforms.map((p) => [lower(p.slug), p]));
  const platformByLabel = new Map(platforms.map((p) => [lower(p.label), p]));
  const accountBySlug = new Map(accounts.map((a) => [lower(a.slug), a]));
  const accountByLabel = new Map(accounts.map((a) => [lower(a.label), a]));

  return (accountSource) => {
    const key = lower(String(accountSource ?? ''));
    if (!key) return { account: null, platform: null };
    let account = accountBySlug.get(key) ?? null;
    let platform = account ? (platformById.get(account.platform_id) ?? null) : (platformBySlug.get(key) ?? null);
    if (!account && !platform) {
      account = accountByLabel.get(key) ?? null;
      platform = account ? (platformById.get(account.platform_id) ?? null) : (platformByLabel.get(key) ?? null);
    }
    return { account, platform };
  };
}

/** Build the order-channel resolver for one catalog snapshot: */
export function buildOrderChannelResolver(
  platforms: readonly PlatformRow[],
  accounts: readonly PlatformAccountRow[],
): OrderChannelResolver {
  const platformBySlug = new Map(platforms.map((p) => [lower(p.slug), p]));
  const lookup = buildAccountSourceLookup(platforms, accounts);

  return (orderId, accountSource) => {
    const key = lower(String(accountSource ?? ''));
    const fromId = getOrderPlatformLabel(orderId, accountSource);
    const inferred = inferMarketplaceFromOrderId(orderId);

    let { account, platform } = lookup(accountSource);
    if (inferred && (!platform || lower(platform.slug) !== inferred)) {
      account = null;
      platform = platformBySlug.get(inferred) ?? null;
    }

    // The marketplace name the number itself proves stays fixed; everything
    // else reads the org's catalog label.
    const label = fromId === 'eBay' || fromId === 'Amazon' ? fromId : (platform?.label ?? fromId);
    const shortLabel =
      account?.short_label?.trim() ||
      (platform ? platformShortLabelOverride(platform) : null) ||
      builtinPlatformShortLabel(inferred ?? key) ||
      label;
    const connection = account?.label.trim() || null;
    const connectionName =
      connection &&
      lower(connection) !== lower(label) &&
      (!platform || lower(connection) !== lower(platform.label))
        ? connection
        : null;
    const meta = resolveMarketplacePlatformMeta(
      orderId,
      platform ? catalogPlatformMeta(platform) : accountSource,
    );
    return { label, shortLabel, connectionName, meta };
  };
}

/** `lookup(platformText)` → the org's dense face for a platform named by slug OR display label (the carton label draft holds the label),… */
export function buildPlatformShortLabelLookup(
  platforms: readonly Pick<PlatformRow, 'slug' | 'label' | 'short_label'>[],
): (value: string | null | undefined) => string | null {
  const byKey = new Map<string, string>();
  for (const p of platforms) {
    const short = p.short_label?.trim();
    if (!short) continue;
    byKey.set(lower(p.slug), short);
    if (!byKey.has(lower(p.label))) byKey.set(lower(p.label), short);
  }
  return (value) => {
    const key = lower(String(value ?? ''));
    return key ? (byKey.get(key) ?? null) : null;
  };
}

/**
 * The account that IS its platform — the seeded `<platform>-main` default (or
 * one slugged like the platform). Listing it beside the platform printed the
 * same channel twice ("ECW" and "ECW · ECWID").
 */
export function isPlatformDefaultAccount(
  platform: Pick<PlatformRow, 'slug'>,
  account: Pick<PlatformAccountRow, 'slug'>,
): boolean {
  const slug = lower(account.slug);
  return slug === lower(platform.slug) || slug === `${lower(platform.slug)}-main`;
}

interface OrderPlatformChoice {
  /** What `orders.account_source` gets: the platform slug or the account slug. */
  value: string;
  label: string;
}

/** The order platform picker's options, flat. A platform whose stores are
 *  linked to accounts offers only those accounts: the bare platform would be
 *  a placeholder (operator 2026-09-26 — "eBay" is not a channel, DRAGON is). */
export function orderPlatformChoices(
  platforms: readonly Pick<PlatformRow, 'id' | 'slug' | 'label' | 'is_active'>[],
  accounts: readonly Pick<PlatformAccountRow, 'id' | 'platform_id' | 'slug' | 'label' | 'is_active'>[],
  links: readonly Pick<StoreLinkRow, 'platform_account_id'>[],
): OrderPlatformChoice[] {
  const linkedAccountIds = new Set(
    links.flatMap((l) => (l.platform_account_id == null ? [] : [String(l.platform_account_id)])),
  );
  const seen = new Set<string>();
  const out: OrderPlatformChoice[] = [];
  const push = (choice: OrderPlatformChoice) => {
    const key = lower(choice.value);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(choice);
  };
  for (const p of platforms) {
    if (!p.is_active) continue;
    const linkedAccounts = accounts.filter(
      (a) =>
        String(a.platform_id) === String(p.id) &&
        a.is_active &&
        linkedAccountIds.has(String(a.id)) &&
        !isPlatformDefaultAccount(p, a),
    );
    if (linkedAccounts.length === 0) push({ value: p.slug, label: p.label });
    for (const a of linkedAccounts) push({ value: a.slug, label: `${p.label} · ${a.label}` });
  }
  return out;
}
