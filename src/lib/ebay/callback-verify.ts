/** eBay OAuth callback verification — the gate half of /api/ebay/callback. */

import pool from '@/lib/db';
import { decryptIntegrationPayload } from '@/lib/integrations/crypto';

/**
 * State freshness window — aligned with the connect cookie's maxAge. 30 min:
 * eBay imposes no clock on its consent screen (state is an opaque echo), so
 * this window only bounds how long the operator may sit on eBay's sign-in
 * (a full login + 2FA — we send prompt=login) before the redirect back.
 * eBay's own expiry, the single-use authorization code (~5 min), starts at
 * consent and is exchanged server-side within seconds.
 */
export const EBAY_STATE_TTL_MS = 30 * 60 * 1000;

/** Shape minted by /api/ebay/connect (encryptIntegrationPayload). */
interface EbayOauthState {
  organizationId: string;
  accountName: string;
  environment?: string;
  /** 'seller' | 'buyer' — the purchasing-account discriminator (default seller). */
  role?: string;
  /** Catalog platform pairing chosen in the connect popover (optional). */
  platformId?: number | null;
  createdBy?: number | null;
  nonce?: string;
  issuedAt?: number;
}

/** A state that passed every gate — binding fields proven non-null. */
interface VerifiedEbayOauthState {
  organizationId: string;
  accountName: string;
  environment?: string;
  role?: string;
  /** Catalog platform pairing chosen in the connect popover (null = default). */
  platformId?: number | null;
  createdBy: number;
  nonce: string;
  issuedAt: number;
}

/** Query-string values the callback redirects with — kept stable for ResultBanner. */
type EbayCallbackStateCode =
  | 'ebay_invalid_oauth_state'
  | 'ebay_incomplete_oauth_state'
  | 'ebay_oauth_state_expired';

type EbayCallbackStateVerdict =
  | { ok: true; state: VerifiedEbayOauthState }
  | { ok: false; code: EbayCallbackStateCode };

interface VerifyEbayCallbackStateInput {
  /** `state` query param from eBay's redirect (the encrypted payload). */
  stateParam: string;
  /** Nonce from the httpOnly EBAY_OAUTH_STATE_COOKIE set at connect. */
  cookieNonce: string | undefined;
  /** Injectable clock (tests). Defaults to Date.now(). */
  now?: number;
}

export function verifyEbayCallbackState(input: VerifyEbayCallbackStateInput): EbayCallbackStateVerdict {
  let parsed: EbayOauthState;
  try {
    parsed = decryptIntegrationPayload<EbayOauthState>(input.stateParam);
  } catch {
    return { ok: false, code: 'ebay_invalid_oauth_state' };
  }

  const { organizationId, accountName, createdBy, nonce, issuedAt } = parsed;
  if (
    typeof organizationId !== 'string' || !organizationId ||
    typeof accountName !== 'string' || !accountName ||
    typeof nonce !== 'string' || !nonce ||
    typeof createdBy !== 'number' || !Number.isFinite(createdBy) ||
    typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)
  ) {
    return { ok: false, code: 'ebay_incomplete_oauth_state' };
  }

  // Freshness — reject stale/replayed authorize requests.
  if ((input.now ?? Date.now()) - issuedAt > EBAY_STATE_TTL_MS) {
    return { ok: false, code: 'ebay_oauth_state_expired' };
  }

  // CSRF: the nonce in `state` must match the httpOnly cookie set at connect — proves the callback returned to the same browser that…
  if (!input.cookieNonce || input.cookieNonce !== nonce) {
    return { ok: false, code: 'ebay_invalid_oauth_state' };
  }

  return { ok: true, state: { ...parsed, organizationId, accountName, createdBy, nonce, issuedAt } };
}

interface ConnectActorDeps {
  query: (sql: string, params: readonly unknown[]) => Promise<{ rowCount: number | null }>;
}

const defaultDeps: ConnectActorDeps = {
  query: (sql, params) => pool.query(sql, params as unknown[]),
};

/**
 * Is the staff who started this connect still an active member of the target
 * workspace? Fail-closed: a throw propagates to the callback's outer handler
 * (ebay_callback_failed), never to a token write.
 */
export async function connectActorStillMember(
  organizationId: string,
  staffId: number,
  deps: ConnectActorDeps = defaultDeps,
): Promise<boolean> {
  const res = await deps.query(
    `SELECT 1
       FROM staff
      WHERE id = $1
        AND organization_id = $2
        AND COALESCE(status, 'active') = 'active'
        AND COALESCE(active, true) = true
      LIMIT 1`,
    [staffId, organizationId],
  );
  return (res.rowCount ?? 0) > 0;
}
