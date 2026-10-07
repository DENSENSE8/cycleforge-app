/**
 * `orders.account_source` — where an order came from, in ONE vocabulary.
 *
 * The stored value is the lower-case, trimmed key of either the platform
 * (catalog `platforms.slug`: `amazon`, `ebay`, `walmart`, `ecwid`, `fba`, …)
 * or the seller account under it (`platform_accounts.slug`, lower-cased:
 * `usav`, `mekong`, `dragon`). `buildAccountSourceLookup` resolves either to
 * the catalog platform + account case-insensitively, so display is unchanged.
 *
 * Every writer of `orders.account_source`, `shipstation_order_refs.account_source`
 * and `order_import_run_rows.account_source` stores {@link canonicalAccountSource}.
 * The DB enforces the shape (`orders_account_source_canonical_chk`).
 *
 * Blank is reserved for an order whose source text AND order number name no
 * channel. QA / test seed sources collapse to {@link QA_ACCOUNT_SOURCE} so a
 * surface can filter them out as one value.
 */

import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';

/** Every QA / demo / test seed source (`QA-DEMO`, `QA_SANDBOX`, `QA-TEST`, `QA`, `TEST`). */
export const QA_ACCOUNT_SOURCE = 'qa';

const QA_SPELLING_RE = /^(qa([-_ ].*)?|test)$/;

/** FBA shipment-style order numbers (`FBA19HWXH7X1`). */
const FBA_ORDER_ID_RE = /^FBA[0-9A-Z]{6,}$/i;

/** Walmart purchase-order numbers are 15 digits. */
const WALMART_ORDER_ID_RE = /^\d{15}$/;

/** The platform an order number alone proves, or null. */
export function accountSourceFromOrderId(orderId: string | null | undefined): string | null {
  const oid = String(orderId ?? '').trim();
  if (!oid) return null;
  return (
    inferMarketplaceFromOrderId(oid) ??
    (FBA_ORDER_ID_RE.test(oid) ? 'fba' : null) ??
    (WALMART_ORDER_ID_RE.test(oid) ? 'walmart' : null)
  );
}

/**
 * The stored `account_source` for a raw source text. A blank source falls back
 * to the platform the order number proves; anything else is lower-cased and
 * whitespace-collapsed (`eBay` / `ebay` → `ebay`, `USAV` → `usav`).
 */
export function canonicalAccountSource(
  raw: string | null | undefined,
  orderId?: string | null,
): string {
  const key = String(raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!key) return accountSourceFromOrderId(orderId) ?? '';
  if (QA_SPELLING_RE.test(key)) return QA_ACCOUNT_SOURCE;
  return key;
}

/**
 * SQL: the org catalog's label for the seller account an orders row's
 * canonical `account_source` names (`usav` → `USAV`), else NULL — the SQL face
 * of `buildAccountSourceLookup(...).account.label` for list queries.
 */
export function accountSourceAccountLabelSql(orderAlias: string): string {
  return `(SELECT pa.label FROM platform_accounts pa
            WHERE pa.organization_id = ${orderAlias}.organization_id
              AND lower(btrim(pa.slug)) = ${orderAlias}.account_source
            ORDER BY pa.is_active DESC, pa.id
            LIMIT 1)`;
}
