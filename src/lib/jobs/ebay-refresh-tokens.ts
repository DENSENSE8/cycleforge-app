import pool from '@/lib/db';
import { refreshEbayAccessToken } from '@/lib/ebay/token-refresh';
import {
  getEbayAppCreds,
  markEbayAccountNeedsReconsent,
  parseEbayAccountScope,
  patchEbayUserAccessToken,
  resolveEbayUserTokens,
  touchEbayAccountTokenExpiry,
} from '@/lib/ebay/credentials';
import { ebayScopeStringForRole, normalizeEbayRole } from '@/lib/ebay/oauth-config';
import { logger } from '@/lib/observability/logger';
import type { OrgId } from '@/lib/tenancy/constants';

export interface EbayRefreshTokensJobResult {
  success: boolean;
  refreshed: number;
  total?: number;
  needsReconsent?: number;
  errors?: string[];
  message: string;
  durationMs: number;
}

/** A 4xx from eBay's token endpoint means the refresh token is dead — re-consent needed. */
function isDeadRefreshToken(message: string): boolean {
  return /invalid_grant|HTTP 400|HTTP 401/i.test(message);
}

/**
 * Refresh eBay user tokens whose vault `expires_at` (or metadata watermark)
 * falls within 30 minutes. Prefers vault-scoped organization_integrations rows;
 * falls back to ebay_accounts metadata join when expires_at is only on metadata.
 */
export async function runEbayRefreshTokensJob(): Promise<EbayRefreshTokensJobResult> {
  const startedAt = Date.now();

  // Vault-first: scoped ebay user rows near expiry.
  const { rows: vaultRows } = await pool.query<{
    organization_id: string;
    scope: string | null;
    expires_at: string | null;
  }>(
    `SELECT organization_id, scope, expires_at
       FROM organization_integrations
      WHERE provider = 'ebay'
        AND status = 'active'
        AND enabled IS NOT FALSE
        AND scope IS NOT NULL
        AND (scope LIKE 'seller:%' OR scope LIKE 'buyer:%')
        AND expires_at IS NOT NULL
        AND expires_at <= NOW() + INTERVAL '30 minutes'
      ORDER BY expires_at ASC`,
  );

  // Also pick metadata rows whose watermark is near expiry but vault expires_at
  // may be null (pre-backfill). Deduped by scope key below.
  const { rows: metaRows } = await pool.query<{
    account_name: string;
    organization_id: string;
    account_role: string | null;
  }>(
    `SELECT account_name, organization_id, account_role
       FROM ebay_accounts
      WHERE (platform = 'EBAY' OR platform IS NULL)
        AND is_active = true
        AND token_expires_at IS NOT NULL
        AND token_expires_at <= NOW() + INTERVAL '30 minutes'
      ORDER BY token_expires_at ASC`,
  );

  type Target = { orgId: OrgId; accountName: string; role: 'seller' | 'buyer' };
  const targets = new Map<string, Target>();

  for (const row of vaultRows) {
    const parsed = parseEbayAccountScope(row.scope);
    if (!parsed) continue;
    const key = `${row.organization_id}:${row.scope}`;
    targets.set(key, {
      orgId: row.organization_id as OrgId,
      accountName: parsed.accountSlug,
      role: parsed.role,
    });
  }
  for (const row of metaRows) {
    const role = normalizeEbayRole(row.account_role);
    const key = `${row.organization_id}:${role}:${row.account_name}`;
    if ([...targets.values()].some(
      (t) => t.orgId === row.organization_id && t.accountName === row.account_name && t.role === role,
    )) {
      continue;
    }
    targets.set(key, {
      orgId: row.organization_id as OrgId,
      accountName: row.account_name,
      role,
    });
  }

  if (targets.size === 0) {
    return {
      success: true,
      refreshed: 0,
      message: 'No eBay tokens need refresh.',
      durationMs: Date.now() - startedAt,
    };
  }

  let refreshed = 0;
  let needsReconsent = 0;
  const errors: string[] = [];

  for (const target of targets.values()) {
    const { orgId, accountName, role } = target;
    try {
      const tokens = await resolveEbayUserTokens(orgId, accountName, role);
      if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt.getTime() <= Date.now()) {
        await markEbayAccountNeedsReconsent(orgId, accountName, 'refresh token expired');
        needsReconsent++;
        errors.push(`${accountName}: refresh token expired — re-authorization required`);
        continue;
      }

      const creds = await getEbayAppCreds(orgId);
      if (!creds) {
        errors.push(`${accountName}: no eBay app credentials configured for org ${orgId}`);
        continue;
      }

      const { accessToken, expiresIn } = await refreshEbayAccessToken(
        creds.appId,
        creds.certId,
        tokens.refreshToken,
        creds.environment,
        ebayScopeStringForRole(role),
      );
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
      await patchEbayUserAccessToken({
        orgId,
        role,
        accountName,
        accessToken,
        expiresAt: newExpiresAt,
      });
      await touchEbayAccountTokenExpiry(orgId, accountName, newExpiresAt);
      refreshed++;
      logger.info(`[ebay-refresh-tokens] refreshed account=${accountName} under organization=${orgId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      if (isDeadRefreshToken(message)) {
        try {
          await markEbayAccountNeedsReconsent(orgId, accountName, message);
          needsReconsent++;
        } catch {
          /* non-fatal */
        }
      }
      errors.push(`${accountName}: ${message}`);
      console.error(`[ebay-refresh-tokens] failed account=${accountName}: ${message}`);
    }
  }

  const total = targets.size;
  return {
    success: true,
    refreshed,
    total,
    needsReconsent: needsReconsent || undefined,
    errors: errors.length > 0 ? errors : undefined,
    message: `Refreshed ${refreshed}/${total} eBay tokens.${needsReconsent ? ` ${needsReconsent} need re-authorization.` : ''}`,
    durationMs: Date.now() - startedAt,
  };
}
