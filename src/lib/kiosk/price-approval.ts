/**
 * Price approvals — the proof a counter tablet carries for a price the catalog
 * did not set.
 *
 * The tablet has no server session mid-cart (the cart is an in-memory store),
 * so a PIN step-up cannot be remembered server-side between "Save adjustment"
 * and the visit's submit minutes later. Instead the step-up route
 * (`POST /api/kiosk/price-approval`) verifies the PIN against
 * `walk_in.adjust_price` and returns an HMAC-signed approval naming exactly
 * what was authorized: who, which verb, from what price to what price, and
 * why. The line carries it; `/api/kiosk/intake` verifies it and rebuilds the
 * adjustment from the CLAIMS, never from the tablet's copy of them.
 *
 * Bound to the organization, not the device: a tablet that self-heals its
 * `cf_kiosk` cookie mid-visit is re-bound as a new device row, and its cart's
 * approvals must survive that.
 *
 * Callers: `app/api/kiosk/price-approval`, `app/api/kiosk/intake`.
 * Schemas: `counter_transaction_lines.price_adjust_*`, `audit_logs`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  PRICE_ADJUST_KINDS,
  serviceLineCents,
  type CounterPriceAdjustment,
  type CounterRetailLine,
  type CounterServiceLine,
} from '@/lib/counter/counter-transaction-types';

/** Longer than any counter visit, short enough that a leaked token is stale by closing. */
export const PRICE_APPROVAL_TTL_SECONDS = 4 * 60 * 60;

const MAX_CENTS = 100_000_000;

export const PriceApprovalClaimsSchema = z
  .object({
    v: z.literal(1),
    organizationId: z.string().min(1),
    staffId: z.number().int().positive(),
    kind: z.enum(PRICE_ADJUST_KINDS),
    /** The catalog price the change starts from; null for a custom amount. */
    fromCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS).nullable(),
    /** The unit price authorized. 0 for a comp. */
    toCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS),
    reason: z.string().trim().min(1).max(200),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type PriceApprovalClaims = z.infer<typeof PriceApprovalClaimsSchema>;

export type PriceApprovalRequest = Pick<
  PriceApprovalClaims,
  'organizationId' | 'staffId' | 'kind' | 'fromCents' | 'toCents' | 'reason'
>;

function configuredSecret(): string {
  // Same fallback convention as `realtime/wms-ticket.ts`: a dedicated key wins
  // once provisioned; CRON_SECRET is the server-only secret every install has.
  const secret = (process.env.KIOSK_APPROVAL_SECRET || process.env.CRON_SECRET)?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('KIOSK_APPROVAL_SECRET must contain at least 32 characters.');
  }
  return secret;
}

function mac(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signPriceApproval(
  request: PriceApprovalRequest,
  options: { secret?: string; now?: number; ttlSeconds?: number } = {},
): { token: string; claims: PriceApprovalClaims } {
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const claims = PriceApprovalClaimsSchema.parse({
    v: 1,
    ...request,
    issuedAt: now,
    expiresAt: now + (options.ttlSeconds ?? PRICE_APPROVAL_TTL_SECONDS),
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = mac(payload, options.secret ?? configuredSecret()).toString('base64url');
  return { token: `${payload}.${signature}`, claims };
}

/** The claims, or null for anything forged, expired, malformed or from another org. */
export function verifyPriceApproval(
  token: string,
  organizationId: string,
  options: { secret?: string; now?: number } = {},
): PriceApprovalClaims | null {
  const [payload, supplied, extra] = String(token ?? '').split('.');
  if (!payload || !supplied || extra !== undefined) return null;
  const expected = mac(payload, options.secret ?? configuredSecret());
  const given = Buffer.from(supplied, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let parsed: PriceApprovalClaims;
  try {
    parsed = PriceApprovalClaimsSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
  } catch {
    return null;
  }
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  if (parsed.expiresAt < now || parsed.issuedAt > now + 5) return null;
  if (parsed.organizationId !== organizationId) return null;
  return parsed;
}

// ── Submit-time verification ───────────────────────────────────────────────

/** Why a submitted line's price is refused. The route maps every one to 403. */
export class PriceApprovalError extends Error {
  constructor(
    message: string,
    public readonly lineTitle: string,
  ) {
    super(message);
    this.name = 'PriceApprovalError';
  }
}

function adjustmentFromClaims(claims: PriceApprovalClaims): CounterPriceAdjustment {
  return {
    kind: claims.kind,
    originalUnitAmountCents: claims.fromCents,
    reason: claims.reason,
    staffId: claims.staffId,
  };
}

export interface VerifyLinePricesDeps {
  verify: (token: string) => PriceApprovalClaims | null;
  /**
   * The org's catalog unit price for each listing id asked about. An id with no
   * row is simply absent — a delisted item is not an adjustment.
   */
  catalogPrices: (variationIds: string[]) => Promise<Map<string, number>>;
}

/**
 * Every submitted line's price, proven.
 *
 *   - A line that presents an approval must match it exactly (the verb's
 *     price is the line's price) and its adjustment is REBUILT from the claims.
 *   - A catalog sale line without one must be at the catalog price: the
 *     tablet's editor no longer changes a price without a PIN, and a request
 *     that does so anyway is refused rather than trusted.
 *   - A positive ad-hoc sale line (no catalog id) is a Keypad custom amount.
 *     It has no catalog price to deviate from, so it needs no approval
 *     (operator 2026-09-24: `+` on the Keypad adds the line at once, Square's
 *     "Keypad" flow; a PIN per line broke that). Trade-in credits (negative)
 *     are the buyback offer and are out of scope here.
 *   - A repair quote without an approval is the quote the repair flow typed;
 *     with one, it is an authorized re-quote.
 */
export async function verifyLinePrices(
  input: { retailLines: CounterRetailLine[]; services: CounterServiceLine[] },
  deps: VerifyLinePricesDeps,
): Promise<{ retailLines: CounterRetailLine[]; services: CounterServiceLine[] }> {
  const proven = (
    title: string,
    unitAmountCents: number,
    adjustment: CounterPriceAdjustment | null | undefined,
  ): CounterPriceAdjustment | null => {
    if (!adjustment) return null;
    const claims = adjustment.approval ? deps.verify(adjustment.approval) : null;
    if (!claims) {
      throw new PriceApprovalError('This price change needs a manager PIN again.', title);
    }
    if (claims.toCents !== unitAmountCents) {
      throw new PriceApprovalError('This price does not match what was authorized.', title);
    }
    return adjustmentFromClaims(claims);
  };

  const catalogIds = input.retailLines
    .filter((l) => l.variationId && !l.priceAdjustment)
    .map((l) => l.variationId as string);
  const catalog = catalogIds.length > 0 ? await deps.catalogPrices([...new Set(catalogIds)]) : new Map();

  const retailLines = input.retailLines.map((line) => {
    const priceAdjustment = proven(line.productTitle, line.unitAmountCents, line.priceAdjustment);
    if (!priceAdjustment && line.variationId) {
      const listed = catalog.get(line.variationId);
      if (listed !== undefined && listed !== line.unitAmountCents) {
        throw new PriceApprovalError('This price was changed without a manager PIN.', line.productTitle);
      }
    }
    return { ...line, priceAdjustment };
  });

  const services = input.services.map((service) => ({
    ...service,
    priceAdjustment: proven(service.productModel, serviceLineCents(service), service.priceAdjustment),
  }));

  return { retailLines, services };
}
