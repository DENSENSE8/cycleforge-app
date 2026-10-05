/**
 * An order's platform, storefront account and Support channel.
 *
 * `orders.account_source` is a free-text storefront name ("DRAGON", "eBay",
 * "ecwid", "Amazon"): the org's platform catalog (`platforms` +
 * `platform_accounts`, via `buildAccountSourceLookup`) names the platform and
 * account it means, and the order-number shape (eBay 2-5-5 / Amazon 3-7-7)
 * wins over a stale slug — the same precedence every order chip uses.
 */
import {
  listPlatformAccounts,
  listPlatforms,
  type PlatformAccountRow,
  type PlatformRow,
} from '@/lib/neon/catalog-queries';
import { buildAccountSourceLookup } from '@/lib/platform-display';
import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';
import type { SupportChannel } from '@/lib/support/conversation/model';
import type { OrgId } from '@/lib/tenancy/constants';

export interface OrderPlatformIdentity {
  /** Catalog platform slug, lowercase (`ebay`, `amazon`, `ecwid`, `walmart`, …); null when nothing names one. */
  slug: string | null;
  /** The storefront account label (`DRAGON`, `Amazon US Store`); null when the source names only a platform. */
  accountLabel: string | null;
  platformAccountId: number | null;
}

export type OrderPlatformResolver = (
  orderNumber: string | null | undefined,
  accountSource: string | null | undefined,
) => OrderPlatformIdentity;

/** Resolver over one catalog snapshot. */
export function buildOrderPlatformResolver(
  platforms: readonly PlatformRow[],
  accounts: readonly PlatformAccountRow[],
): OrderPlatformResolver {
  const lookup = buildAccountSourceLookup(platforms, accounts);
  return (orderNumber, accountSource) => {
    const { account, platform } = lookup(accountSource);
    const catalogSlug = platform?.slug.trim().toLowerCase() || null;
    const inferred = inferMarketplaceFromOrderId(orderNumber);
    if (inferred && catalogSlug !== inferred) {
      // The number proves the marketplace; the stored account names another one.
      return { slug: inferred, accountLabel: null, platformAccountId: null };
    }
    const fallback = String(accountSource ?? '').trim().toLowerCase() || null;
    return {
      slug: catalogSlug ?? fallback,
      accountLabel: account?.label.trim() || null,
      platformAccountId: account ? Number(account.id) : null,
    };
  };
}

/** The org's live resolver (inactive rows included — old orders still name them). */
export async function loadOrderPlatformResolver(orgId: OrgId): Promise<OrderPlatformResolver> {
  const [platforms, accounts] = await Promise.all([
    listPlatforms(orgId, { includeInactive: true }),
    listPlatformAccounts(orgId, { includeInactive: true }),
  ]);
  return buildOrderPlatformResolver(platforms, accounts);
}

/** Marketplaces whose own buyer messaging reaches the customer without an email address. */
const MARKETPLACE_MESSAGING: Readonly<Record<string, true>> = { ebay: true, amazon: true };

/** Platforms that are a Support channel of their own. */
const PLATFORM_CHANNEL: Readonly<Record<string, SupportChannel>> = {
  ebay: 'ebay',
  amazon: 'amazon',
  ecwid: 'ecwid',
};

/**
 * The channel a Support item about this order talks on: the marketplace
 * itself when it is a Support channel, else email, else phone, else a
 * pasted/manual conversation.
 */
export function supportChannelForOrder(args: {
  platformSlug: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}): SupportChannel {
  const slug = String(args.platformSlug ?? '').trim().toLowerCase();
  const byPlatform = PLATFORM_CHANNEL[slug];
  if (byPlatform) return byPlatform;
  if (String(args.customerEmail ?? '').trim()) return 'email';
  if (String(args.customerPhone ?? '').trim()) return 'phone';
  return 'manual';
}

/** True when staff can reach the buyer: an email, a phone, or the marketplace's own messaging. */
export function orderHasCustomerContactPath(args: {
  platformSlug: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}): boolean {
  if (String(args.customerEmail ?? '').trim()) return true;
  if (String(args.customerPhone ?? '').trim()) return true;
  return MARKETPLACE_MESSAGING[String(args.platformSlug ?? '').trim().toLowerCase()] === true;
}
