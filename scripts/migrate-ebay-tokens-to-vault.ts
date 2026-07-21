/**
 * Backfill eBay user tokens from ebay_accounts columns into the vault
 * (organization_integrations, provider='ebay', scope=seller:{slug}|buyer:{slug}).
 *
 *   npx tsx scripts/migrate-ebay-tokens-to-vault.ts            # DRY RUN
 *   npx tsx scripts/migrate-ebay-tokens-to-vault.ts --apply    # write vault rows
 *
 * Run BEFORE applying migration 2026-07-20_ebay_vault_tokens.sql (which drops
 * access_token / refresh_token). Idempotent. Requires INTEGRATION_KMS_KEY +
 * DATABASE_URL. Skips platform='ZOHO' rows.
 */
import { Pool } from 'pg';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const APPLY = process.argv.includes('--apply');

async function main() {
  const { upsertEbayUserCreds } = await import('../src/lib/ebay/credentials');
  const { ebayScopeForAccount, normalizeEbayEnvironment, normalizeEbayRole } = await import(
    '../src/lib/ebay/oauth-config'
  );
  const { decryptIntegrationPayload, isIntegrationKmsConfigured } = await import(
    '../src/lib/integrations/crypto'
  );
  const { getIntegrationCredentials } = await import('../src/lib/integrations/credentials');
  type EbayUserCredentials = import('../src/lib/integrations/credentials').EbayUserCredentials;

  function readStoredEbayToken(stored: string | null | undefined): string {
    const raw = String(stored ?? '').trim();
    if (!raw) throw new Error('eBay token is empty');
    if (raw.startsWith('v^')) return raw;
    return decryptIntegrationPayload<string>(raw);
  }

  if (!isIntegrationKmsConfigured()) {
    throw new Error('INTEGRATION_KMS_KEY is not set/invalid — cannot encrypt vault payloads.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  // Columns may already be dropped — detect.
  const cols = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ebay_accounts'
        AND column_name IN ('access_token', 'refresh_token')`,
  );
  if (cols.rows.length < 2) {
    console.log('ebay_accounts token columns already dropped — nothing to backfill.');
    await pool.end();
    return;
  }

  const { rows } = await pool.query<{
    organization_id: string;
    account_name: string;
    account_role: string | null;
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at: Date | null;
    refresh_token_expires_at: Date | null;
    ebay_user_id: string | null;
  }>(
    `SELECT organization_id, account_name, account_role, access_token, refresh_token,
            token_expires_at, refresh_token_expires_at, ebay_user_id
       FROM ebay_accounts
      WHERE (platform = 'EBAY' OR platform IS NULL)
        AND refresh_token IS NOT NULL
        AND BTRIM(refresh_token) <> ''
      ORDER BY organization_id, account_name`,
  );

  console.log(`Found ${rows.length} eBay account row(s) with refresh tokens.`);
  const environment = normalizeEbayEnvironment(process.env.EBAY_ENVIRONMENT);

  let wrote = 0;
  let skipped = 0;
  for (const row of rows) {
    const role = normalizeEbayRole(row.account_role);
    const scope = ebayScopeForAccount(role, row.account_name);
    let refreshToken: string;
    let accessToken: string;
    try {
      refreshToken = readStoredEbayToken(row.refresh_token);
      accessToken = row.access_token ? readStoredEbayToken(row.access_token) : '';
    } catch (err) {
      console.warn(`  skip ${row.organization_id}/${row.account_name}: decrypt failed — ${err}`);
      skipped++;
      continue;
    }

    const existing = await getIntegrationCredentials<EbayUserCredentials>(
      row.organization_id as import('../src/lib/tenancy/constants').OrgId,
      'ebay',
      { scope },
    );
    if (existing?.refreshToken) {
      console.log(`  exists ${scope} @ ${row.organization_id} (will overwrite on --apply)`);
    } else {
      console.log(`  migrate ${scope} @ ${row.organization_id}`);
    }

    if (!APPLY) continue;

    await upsertEbayUserCreds({
      orgId: row.organization_id as import('../src/lib/tenancy/constants').OrgId,
      accountName: row.account_name,
      role,
      refreshToken,
      accessToken: accessToken || refreshToken, // placeholder if access missing — refresh will mint
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : new Date(Date.now() + 3600_000),
      refreshTokenExpiresAt: row.refresh_token_expires_at
        ? new Date(row.refresh_token_expires_at)
        : new Date(Date.now() + 18 * 30 * 24 * 3600 * 1000),
      environment,
      accountRef: row.ebay_user_id,
      displayLabel: `${role} · ${row.account_name}`,
    });
    wrote++;
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write vault rows, then apply 2026-07-20_ebay_vault_tokens.sql.');
  } else {
    console.log(`\nWrote ${wrote} vault row(s); skipped ${skipped}.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
