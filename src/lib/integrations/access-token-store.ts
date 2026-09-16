/**
 * Durable, cross-instance OAuth access-token cache.
 *
 * WHY (2026-09-14 Zoho blackout): every provider client cached its minted
 * access token in a per-process `Map`. On Vercel that is per LAMBDA INSTANCE —
 * plus every local dev server pointed at the same vault row — so the token
 * endpoint got hit once per cold instance, per health poll, per cron tick.
 * Zoho allows 10 mints per refresh token per 10 minutes; we crossed it, the
 * mint failed, and the failure latched the connection off for 25 hours.
 *
 * Fix: one token per (org, provider, scope) lives in the DB with its expiry,
 * so every instance shares the same mint for the token's whole lifetime.
 *
 * COORDINATION — two layers, both pool-safe:
 *   1. in-process: concurrent callers in one instance await ONE promise;
 *   2. cross-instance: a short `UPDATE … RETURNING` claims the right to mint
 *      (`access_token_mint_claimed_at`); losers poll the token row briefly and
 *      adopt the winner's token.
 *
 * It must NOT hold a dedicated client while minting. The first cut used a
 * blocking `pg_advisory_lock` on a checked-out client; with PG_POOL_MAX=5 a
 * 12-caller stampede exhausted the pool ("timeout exceeded when trying to
 * connect") and every caller fell through to its own mint — reproducing the
 * exact failure this module exists to prevent. Measured: 12 callers → 12
 * mints. Keep every DB touch here short and released.
 *
 * The token is stored with the same envelope helpers as the credential payload
 * (AES-256-GCM when INTEGRATION_KMS_KEY is set, dev JSON otherwise).
 */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { parseIntegrationPayload, serializeIntegrationPayload } from './crypto';
import type { IntegrationProvider } from './credentials';

/** Refresh this far before real expiry so an in-flight request never races it. */
export const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;

/** A usable access token plus the epoch-ms instant it stops being usable. */
export interface SharedAccessToken {
  token: string;
  expiresAt: number;
}

interface StoredToken {
  /** access token */
  t: string;
}

interface TokenRow {
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
}

/**
 * The shared token when it still has more than `skewMs` of life. Null when
 * absent, expiring, or undecryptable (a key rotation must not wedge minting).
 */
export async function readSharedAccessToken(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null = null,
  skewMs: number = ACCESS_TOKEN_SKEW_MS,
): Promise<SharedAccessToken | null> {
  let row: TokenRow | undefined;
  try {
    const res = await pool.query<TokenRow>(
      `SELECT access_token_encrypted, access_token_expires_at
         FROM organization_integrations
        WHERE organization_id = $1 AND provider = $2
          AND COALESCE(scope, '') = COALESCE($3, '')
        LIMIT 1`,
      [orgId, provider, scope],
    );
    row = res.rows[0];
  } catch {
    // Pre-migration column, or DB blip: fall back to minting.
    return null;
  }
  if (!row?.access_token_encrypted || !row.access_token_expires_at) return null;

  const expiresAt = Date.parse(row.access_token_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + skewMs) return null;

  try {
    const stored = parseIntegrationPayload<StoredToken>(row.access_token_encrypted);
    const token = String(stored?.t ?? '').trim();
    return token ? { token, expiresAt } : null;
  } catch {
    return null;
  }
}

/** Persist a freshly minted token so every other instance reuses it. */
export async function writeSharedAccessToken(
  orgId: OrgId,
  provider: IntegrationProvider,
  token: string,
  expiresAt: number,
  scope: string | null = null,
): Promise<void> {
  try {
    await pool.query(
      `UPDATE organization_integrations
          SET access_token_encrypted = $4,
              access_token_expires_at = $5,
              updated_at = now()
        WHERE organization_id = $1 AND provider = $2
          AND COALESCE(scope, '') = COALESCE($3, '')`,
      [orgId, provider, scope, serializeIntegrationPayload({ t: token } satisfies StoredToken), new Date(expiresAt)],
    );
  } catch (err) {
    // Never fail the caller's request because the cache write failed — worst
    // case we mint again next time.
    console.warn(
      `[access-token-store] could not persist ${provider} token for org=${orgId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Drop the shared token (e.g. upstream answered 401 with it). */
export async function clearSharedAccessToken(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null = null,
): Promise<void> {
  try {
    await pool.query(
      `UPDATE organization_integrations
          SET access_token_encrypted = NULL, access_token_expires_at = NULL
        WHERE organization_id = $1 AND provider = $2
          AND COALESCE(scope, '') = COALESCE($3, '')`,
      [orgId, provider, scope],
    );
  } catch {
    /* best-effort */
  }
}

/** Result of {@link getSharedAccessToken}: the token, its expiry, and whether
 *  THIS call was the one that paid for an upstream mint. */
export interface SharedAccessTokenResult extends SharedAccessToken {
  minted: boolean;
}

/** What a provider's mint callback must hand back. */
export interface MintedAccessToken {
  token: string;
  expiresInSec: number;
}

/** How long a mint claim is honoured before another instance may take over. */
const MINT_CLAIM_TTL_SEC = 30;
/** How long a loser waits for the winner's token before minting itself. */
const WAIT_FOR_WINNER_MS = 8_000;
const WAIT_POLL_MS = 250;

/**
 * In-process dedupe. Concurrent callers in ONE instance share a single mint
 * attempt — no DB round trip, no pool pressure, and it collapses the common
 * stampede (a cold lambda serving several Zoho-backed requests at once).
 */
const inFlight = new Map<string, Promise<SharedAccessTokenResult>>();

/**
 * Claim the right to mint. Returns true for the one caller (fleet-wide) that
 * should hit the provider; false means someone else is already minting.
 * A stale claim (crashed minter) is re-claimable after MINT_CLAIM_TTL_SEC.
 *
 * Exported as the coordination seam: the claim/adopt behaviour is what stops a
 * fleet-wide stampede, so it has to be exercisable on its own.
 */
export async function claimMint(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null,
): Promise<boolean> {
  try {
    const res = await pool.query(
      `UPDATE organization_integrations
          SET access_token_mint_claimed_at = now()
        WHERE organization_id = $1 AND provider = $2
          AND COALESCE(scope, '') = COALESCE($3, '')
          AND (
            access_token_mint_claimed_at IS NULL
            OR access_token_mint_claimed_at < now() - ($4 || ' seconds')::interval
          )
        RETURNING 1`,
      [orgId, provider, scope, String(MINT_CLAIM_TTL_SEC)],
    );
    return (res.rowCount ?? 0) > 0;
  } catch {
    // Pre-migration column / DB blip: fall back to minting rather than block.
    return true;
  }
}

export async function releaseMintClaim(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null,
): Promise<void> {
  try {
    await pool.query(
      `UPDATE organization_integrations
          SET access_token_mint_claimed_at = NULL
        WHERE organization_id = $1 AND provider = $2
          AND COALESCE(scope, '') = COALESCE($3, '')`,
      [orgId, provider, scope],
    );
  } catch {
    /* claim expires on its own after MINT_CLAIM_TTL_SEC */
  }
}

/**
 * Return the shared token, minting at most once across the whole fleet.
 *
 * 1. read the shared token → return it;
 * 2. join this instance's in-flight attempt, if any;
 * 3. claim the fleet-wide mint: winner mints + persists;
 * 4. losers poll for the winner's token, and mint only if it never lands
 *    (bounded by WAIT_FOR_WINNER_MS — a stuck peer must not fail the request).
 */
export async function getSharedAccessToken(
  orgId: OrgId,
  provider: IntegrationProvider,
  mint: () => Promise<MintedAccessToken>,
  opts: { scope?: string | null; skewMs?: number } = {},
): Promise<SharedAccessTokenResult> {
  const scope = opts.scope ?? null;
  const skewMs = opts.skewMs ?? ACCESS_TOKEN_SKEW_MS;

  const fresh = await readSharedAccessToken(orgId, provider, scope, skewMs);
  if (fresh) return { ...fresh, minted: false };

  const key = `${provider}:${orgId}:${scope ?? ''}`;
  const joined = inFlight.get(key);
  if (joined) {
    const shared = await joined;
    return { ...shared, minted: false };
  }

  const attempt = (async (): Promise<SharedAccessTokenResult> => {
    const won = await claimMint(orgId, provider, scope);

    if (!won) {
      // Another instance is minting. Adopt its token instead of adding load to
      // the provider's token endpoint.
      const deadline = Date.now() + WAIT_FOR_WINNER_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
        const peer = await readSharedAccessToken(orgId, provider, scope, skewMs);
        if (peer) return { ...peer, minted: false };
      }
      // Winner never published (crash / slow provider): mint ourselves rather
      // than fail the operator's request.
      console.warn(
        `[access-token-store] ${provider} org=${orgId}: peer mint did not publish in ${WAIT_FOR_WINNER_MS}ms; minting`,
      );
    }

    try {
      const minted = await mint();
      const token = String(minted.token || '').trim();
      if (!token) throw new Error(`${provider} token mint returned an empty access token`);
      const lifetimeSec =
        Number.isFinite(minted.expiresInSec) && minted.expiresInSec > 0 ? minted.expiresInSec : 3600;
      const expiresAt = Date.now() + lifetimeSec * 1000;
      await writeSharedAccessToken(orgId, provider, token, expiresAt, scope);
      return { token, expiresAt, minted: true };
    } finally {
      if (won) await releaseMintClaim(orgId, provider, scope);
    }
  })();

  inFlight.set(key, attempt);
  try {
    return await attempt;
  } finally {
    inFlight.delete(key);
  }
}
