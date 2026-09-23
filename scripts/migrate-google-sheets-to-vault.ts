/**
 * Migrate the USAV Google Sheets service account into the integration vault.
 *
 *   pnpm google-sheets:connect                 # validate only
 *   pnpm google-sheets:connect -- --apply      # write the encrypted vault row
 *
 * The command is intentionally the only remaining env-backed step. The live
 * Google API check refuses to write a vault row that cannot read the configured
 * spreadsheet; runtime jobs read the encrypted row after this migration.
 */
import { sheets as googleSheets } from '@googleapis/sheets';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import pool from '../src/lib/db';
import { getGoogleAuth } from '../src/lib/google-auth';
import { DOGFOOD_ORG_ID } from '../src/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  upsertIntegrationCredentials,
  type GoogleSheetsCredentials,
} from '../src/lib/integrations/credentials';
import { isIntegrationKmsConfigured } from '../src/lib/integrations/crypto';

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!isIntegrationKmsConfigured()) {
    throw new Error('INTEGRATION_KMS_KEY is not set/valid — cannot encrypt the vault payload.');
  }

  const clientEmail = (process.env.GOOGLE_CLIENT_EMAIL ?? '').trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY ?? '';
  const spreadsheetId = (process.env.SPREADSHEET_ID ?? '').trim();
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, and SPREADSHEET_ID are required.');
  }

  const sheets = googleSheets({ version: 'v4', auth: getGoogleAuth({ clientEmail, privateKey }) });
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'spreadsheetId,properties(title)',
  });
  const title = metadata.data.properties?.title || '(untitled)';

  const existing = await pool.query<{ status: string }>(
    `SELECT status
       FROM organization_integrations
      WHERE organization_id = $1
        AND provider = 'google_sheets'
        AND COALESCE(scope, '') = ''
      LIMIT 1`,
    [DOGFOOD_ORG_ID],
  );

  console.log(`Google Sheets vault migration${APPLY ? '' : ' [DRY RUN]'}`);
  console.log(`  spreadsheet: ${spreadsheetId} (${title})`);
  console.log(`  service account: ${clientEmail}`);
  console.log(`  existing vault row: ${existing.rows[0]?.status ?? 'NONE'}`);
  console.log('  Google API access: OK');

  const payload: GoogleSheetsCredentials = {
    clientEmail,
    privateKey,
    defaultSpreadsheetId: spreadsheetId,
  };

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write the encrypted vault row.');
    await pool.end();
    return;
  }

  await upsertIntegrationCredentials({
    orgId: DOGFOOD_ORG_ID,
    provider: 'google_sheets',
    payload,
    displayLabel: `Google Sheets · ${title}`,
    createdBy: null,
  });

  const readback = await getIntegrationCredentials<GoogleSheetsCredentials>(
    DOGFOOD_ORG_ID,
    'google_sheets',
  );
  if (
    readback?.clientEmail !== clientEmail ||
    readback?.privateKey !== privateKey ||
    readback.defaultSpreadsheetId !== spreadsheetId
  ) {
    throw new Error('Vault readback mismatch — refusing to report migration complete.');
  }

  console.log('\nWrote and verified encrypted Google Sheets credentials in the vault.');
  console.log('After one successful cron run, remove GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, and SPREADSHEET_ID from the deployment.');
  await pool.end();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
