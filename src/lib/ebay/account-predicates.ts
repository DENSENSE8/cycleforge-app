/**
 * SQL predicates for ebay_accounts role / platform filtering.
 * Kept free of DB imports so unit tests can assert them without the
 * server-only Neon pool.
 */

/** eBay rows only — ebay_accounts is dual-used for Zoho (platform='ZOHO'). NULL = legacy eBay. */
export const EBAY_PLATFORM_PREDICATE = `(platform = 'EBAY' OR platform IS NULL)`;

/**
 * Seller (outbound Fulfillment) accounts only. Buyer / purchasing rows use
 * Trading GetOrders → Incoming and must never hit sell.fulfillment sync.
 * NULL account_role = legacy seller.
 */
export const EBAY_SELLER_ROLE_PREDICATE = `(account_role IS NULL OR account_role = 'seller')`;
