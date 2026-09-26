/** eBay account + credential accessors. */
import { normalizeEnvValue } from '@/lib/env-utils';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  deleteIntegrationCredentials,
  getIntegrationCredentials,
  markIntegrationError,
  upsertIntegrationCredentials,
  type EbayCredentials,
  type EbayUserCredentials,
} from '@/lib/integrations/credentials';
import {
  ebayScopeForAccount,
  ebayScopeStringForRole,
  normalizeEbayEnvironment,
  normalizeEbayRole,
  type EbayAccountRole,
  type EbayEnvironment,
} from './oauth-config';

// Re-exported from account-predicates for callers; local import used below.
export {
  EBAY_PLATFORM_PREDICATE,
  EBAY_SELLER_ROLE_PREDICATE,
} from './account-predicates';
import { EBAY_PLATFORM_PREDICATE } from './account-predicates';

export { parseEbayAccountScope } from './oauth-config';

export interface EbayAppCreds {
  appId: string;
  certId: string;
  ruName: string;
  environment: EbayEnvironment;
}

/**
 * Resolve the eBay OAuth app credentials to use for an org. Returns null only
 * when neither a per-org app row (scope=null) nor the shared env app is configured.
 */
export async function getEbayAppCreds(orgId: OrgId): Promise<EbayAppCreds | null> {
  // Unscoped vault row = BYO / mirrored app credentials (not per-user tokens).
  const orgCreds = await getIntegrationCredentials<EbayCredentials>(orgId, 'ebay');
  if (orgCreds?.appId && orgCreds.certId && orgCreds.ruName) {
    return {
      appId: orgCreds.appId,
      certId: orgCreds.certId,
      ruName: orgCreds.ruName,
      environment: normalizeEbayEnvironment(orgCreds.environment),
    };
  }

  const appId = normalizeEnvValue(process.env.EBAY_APP_ID);
  const certId = normalizeEnvValue(process.env.EBAY_CERT_ID);
  const ruName = normalizeEnvValue(process.env.EBAY_RU_NAME);
  if (appId && certId && ruName) {
    return { appId, certId, ruName, environment: normalizeEbayEnvironment(process.env.EBAY_ENVIRONMENT) };
  }

  return null;
}

/** Load per-account user tokens from the vault (null when missing / not a user payload). */
async function getEbayUserCreds(
  orgId: OrgId,
  role: EbayAccountRole,
  accountSlug: string,
): Promise<EbayUserCredentials | null> {
  const scope = ebayScopeForAccount(role, accountSlug);
  const creds = await getIntegrationCredentials<EbayUserCredentials>(orgId, 'ebay', { scope });
  if (!creds?.refreshToken) return null;
  return creds;
}

interface UpsertEbayUserCredsInput {
  orgId: OrgId;
  accountName: string;
  role: EbayAccountRole;
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
  environment: EbayEnvironment;
  accountRef?: string | null;
  displayLabel?: string | null;
  createdBy?: number | null;
}

/** Write / refresh per-account user tokens in the vault (SoT). */
export async function upsertEbayUserCreds(input: UpsertEbayUserCredsInput): Promise<string> {
  const scope = ebayScopeForAccount(input.role, input.accountName);
  const payload: EbayUserCredentials = {
    refreshToken: input.refreshToken,
    accessToken: input.accessToken,
    expiresAt: input.expiresAt.getTime(),
    refreshTokenExpiresAt: input.refreshTokenExpiresAt.getTime(),
    scopes: ebayScopeStringForRole(input.role).split(/\s+/).filter(Boolean),
    accountRef: input.accountRef ?? undefined,
    environment: input.environment,
    accountRole: input.role,
  };
  await upsertIntegrationCredentials({
    orgId: input.orgId,
    provider: 'ebay',
    scope,
    payload,
    displayLabel: input.displayLabel ?? `${input.role} · ${input.accountName}`,
    createdBy: input.createdBy ?? null,
    expiresAt: input.expiresAt,
  });
  return scope;
}

/** Update vault access token + expires_at after a successful refresh. */
export async function patchEbayUserAccessToken(opts: {
  orgId: OrgId;
  role: EbayAccountRole;
  accountName: string;
  accessToken: string;
  expiresAt: Date;
}): Promise<void> {
  const existing = await getEbayUserCreds(opts.orgId, opts.role, opts.accountName);
  if (!existing?.refreshToken) {
    throw new Error(
      `eBay vault credentials missing for ${ebayScopeForAccount(opts.role, opts.accountName)} — reconnect required`,
    );
  }
  await upsertEbayUserCreds({
    orgId: opts.orgId,
    accountName: opts.accountName,
    role: opts.role,
    refreshToken: existing.refreshToken,
    accessToken: opts.accessToken,
    expiresAt: opts.expiresAt,
    refreshTokenExpiresAt: existing.refreshTokenExpiresAt
      ? new Date(existing.refreshTokenExpiresAt)
      : new Date(Date.now() + 18 * 30 * 24 * 3600 * 1000),
    environment: normalizeEbayEnvironment(existing.environment),
    accountRef: existing.accountRef ?? null,
  });
}

interface EbayAccount {
  id: number;
  accountName: string;
  ebayUserId: string | null;
  accountRole: 'seller' | 'buyer';
  /** Decrypted access token from vault (null if vault row missing). */
  accessToken: string | null;
  /** Decrypted refresh token from vault. */
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  isActive: boolean;
}

interface EbayAccountMetaRow {
  id: number;
  account_name: string;
  ebay_user_id: string | null;
  account_role: string | null;
  token_expires_at: string | Date | null;
  refresh_token_expires_at: string | Date | null;
  is_active: boolean;
}

const META_COLUMNS = `id, account_name, ebay_user_id, account_role,
  token_expires_at, refresh_token_expires_at, is_active`;

async function hydrateAccount(orgId: OrgId, row: EbayAccountMetaRow): Promise<EbayAccount> {
  const role = normalizeEbayRole(row.account_role);
  const vault = await getEbayUserCreds(orgId, role, row.account_name);
  const tokenExpiresAt = vault?.expiresAt
    ? new Date(vault.expiresAt)
    : row.token_expires_at
      ? new Date(row.token_expires_at)
      : null;
  const refreshTokenExpiresAt = vault?.refreshTokenExpiresAt
    ? new Date(vault.refreshTokenExpiresAt)
    : row.refresh_token_expires_at
      ? new Date(row.refresh_token_expires_at)
      : null;
  return {
    id: row.id,
    accountName: row.account_name,
    ebayUserId: row.ebay_user_id,
    accountRole: role,
    accessToken: vault?.accessToken ?? null,
    refreshToken: vault?.refreshToken ?? null,
    tokenExpiresAt,
    refreshTokenExpiresAt,
    isActive: row.is_active,
  };
}

/** Load a single eBay account (tokens from vault) for an org, or null. */
async function getEbayAccount(orgId: OrgId, accountName: string): Promise<EbayAccount | null> {
  const r = await tenantQuery(
    orgId,
    `SELECT ${META_COLUMNS}
       FROM ebay_accounts
      WHERE organization_id = $1 AND account_name = $2 AND ${EBAY_PLATFORM_PREDICATE}
      LIMIT 1`,
    [orgId, accountName],
  );
  const row = r.rows[0] as EbayAccountMetaRow | undefined;
  return row ? hydrateAccount(orgId, row) : null;
}

/** Load all active eBay accounts (tokens from vault) for an org. */
export async function listActiveEbayAccounts(orgId: OrgId): Promise<EbayAccount[]> {
  const r = await tenantQuery(
    orgId,
    `SELECT ${META_COLUMNS}
       FROM ebay_accounts
      WHERE organization_id = $1 AND is_active = true AND ${EBAY_PLATFORM_PREDICATE}
      ORDER BY account_name`,
    [orgId],
  );
  const rows = r.rows as EbayAccountMetaRow[];
  return Promise.all(rows.map((row) => hydrateAccount(orgId, row)));
}

/**
 * Resolve user tokens for runtime clients. Vault-only — missing vault row means
 * reconnect required (legacy ebay_accounts token columns have been dropped).
 */
export async function resolveEbayUserTokens(
  orgId: OrgId,
  accountName: string,
  roleHint?: EbayAccountRole | null,
): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
  accountRole: EbayAccountRole;
}> {
  let role = roleHint ? normalizeEbayRole(roleHint) : null;
  if (!role) {
    const meta = await tenantQuery<{ account_role: string | null }>(
      orgId,
      `SELECT account_role FROM ebay_accounts
        WHERE organization_id = $1 AND account_name = $2 AND ${EBAY_PLATFORM_PREDICATE}
        LIMIT 1`,
      [orgId, accountName],
    );
    if (!meta.rows[0]) {
      throw new Error(`eBay account ${accountName} not found in database`);
    }
    role = normalizeEbayRole(meta.rows[0].account_role);
  }

  const vault = await getEbayUserCreds(orgId, role, accountName);
  if (!vault?.refreshToken) {
    throw new Error(
      `eBay vault credentials missing for ${ebayScopeForAccount(role, accountName)} — reconnect required`,
    );
  }

  return {
    accessToken: vault.accessToken ?? '',
    refreshToken: vault.refreshToken,
    tokenExpiresAt: vault.expiresAt ? new Date(vault.expiresAt) : new Date(0),
    refreshTokenExpiresAt: vault.refreshTokenExpiresAt
      ? new Date(vault.refreshTokenExpiresAt)
      : null,
    accountRole: role,
  };
}

/**
 * True when the org has ≥1 connected, active eBay BUYER account. The SoT
 * predicate for "eBay purchasing is connected".
 */
export async function hasConnectedEbayBuyerAccount(orgId: OrgId): Promise<boolean> {
  const r = await tenantQuery(
    orgId,
    `SELECT COUNT(*)::int AS n FROM ebay_accounts
      WHERE organization_id = $1 AND account_role = 'buyer' AND is_active = true
        AND ${EBAY_PLATFORM_PREDICATE}`,
    [orgId],
  );
  return ((r.rows[0] as { n: number } | undefined)?.n ?? 0) > 0;
}

/**
 * Hard-delete an eBay account (disconnect) + its vault scope. Returns the
 * deleted account_name (for audit) or null if nothing matched.
 */
export async function deleteEbayAccount(orgId: OrgId, id: number): Promise<string | null> {
  const r = await tenantQuery(
    orgId,
    `DELETE FROM ebay_accounts
      WHERE id = $1 AND organization_id = $2
      RETURNING account_name, account_role`,
    [id, orgId],
  );
  const row = r.rows[0] as { account_name: string; account_role: string | null } | undefined;
  if (!row) return null;

  const role = normalizeEbayRole(row.account_role);
  try {
    await deleteIntegrationCredentials(orgId, 'ebay', ebayScopeForAccount(role, row.account_name));
  } catch {
    /* vault row may already be gone */
  }
  return row.account_name;
}

/**
 * Mark an account as needing re-consent: deactivate metadata and mark the
 * scoped vault row (and unscoped app row best-effort) in error.
 */
export async function markEbayAccountNeedsReconsent(
  orgId: OrgId,
  accountName: string,
  reason: string,
): Promise<void> {
  const meta = await tenantQuery<{ account_role: string | null }>(
    orgId,
    `UPDATE ebay_accounts
        SET is_active = false, updated_at = NOW()
      WHERE organization_id = $1 AND account_name = $2
      RETURNING account_role`,
    [orgId, accountName],
  );
  const role = normalizeEbayRole(meta.rows[0]?.account_role);
  const msg = `Re-authorization required (${accountName}): ${reason}`;
  try {
    await markIntegrationError(orgId, 'ebay', msg, ebayScopeForAccount(role, accountName));
  } catch {
    /* scoped row may be missing */
  }
  try {
    await markIntegrationError(orgId, 'ebay', msg);
  } catch {
    /* org may have no unscoped app row — non-fatal */
  }
}

/** Persist access-token expiry on the metadata row (Settings chips / refresh job watermark). */
export async function touchEbayAccountTokenExpiry(
  orgId: OrgId,
  accountName: string,
  tokenExpiresAt: Date,
): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE ebay_accounts
        SET token_expires_at = $1, updated_at = NOW()
      WHERE organization_id = $2 AND account_name = $3`,
    [tokenExpiresAt, orgId, accountName],
  );
}
