/**
 * Re-encrypt every organization_integrations payload under the CURRENT
 * INTEGRATION_KMS_KEY.
 *
 * Run this after a key change, once both environments carry the same
 * INTEGRATION_KMS_KEY and the outgoing key is listed in
 * INTEGRATION_KMS_KEY_PREVIOUS. When it reports 0 rows still on a previous
 * key, INTEGRATION_KMS_KEY_PREVIOUS can be removed from both environments.
 *
 * Context: on 2026-08-21 local dev and Vercel production pointed at the same
 * Neon database with different keys. `organization_integrations` holds one row
 * per (org, provider), so each OAuth token refresh re-encrypted the row with
 * the refreshing environment's key and locked the other one out — Zoho reads
 * came back `denied — no active credential` while the UI still said Connected.
 *
 *   npx tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/reencrypt-integration-payloads.ts            # dry run
 *   … scripts/reencrypt-integration-payloads.ts --apply    # write
 *
 * Reads secrets, writes only `payload_encrypted`. Never logs a plaintext
 * payload — only provider / scope / status and a verdict.
 */

import pool from '@/lib/db';
import {
  encryptIntegrationPayload,
  isIntegrationKmsConfigured,
  parseIntegrationPayload,
} from '@/lib/integrations/crypto';

type Row = {
  organization_id: string;
  provider: string;
  scope: string | null;
  status: string;
  payload_encrypted: string;
};

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!isIntegrationKmsConfigured()) {
    throw new Error('INTEGRATION_KMS_KEY is not set (or is not a 32-byte base64 key).');
  }

  const { rows } = await pool.query<Row>(
    `SELECT organization_id, provider, scope, status, payload_encrypted
       FROM organization_integrations
      ORDER BY provider, scope NULLS FIRST`,
  );

  let rewritten = 0;
  let plaintext = 0;
  let unreadable = 0;

  for (const row of rows) {
    const label = `${row.provider}${row.scope ? `/${row.scope}` : ''} (${row.status})`;
    const stored = row.payload_encrypted?.trim() ?? '';

    if (!stored) {
      console.log(`  --  ${label}: empty payload, skipped`);
      continue;
    }

    let payload: unknown;
    try {
      payload = parseIntegrationPayload(stored);
    } catch (err) {
      // Neither the current key nor any previous key opened it. Add the missing
      // key to INTEGRATION_KMS_KEY_PREVIOUS, or reconnect this integration.
      unreadable++;
      console.error(`  !!  ${label}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const isPlaintext = stored.startsWith('{') || stored.startsWith('[');
    if (isPlaintext) plaintext++;

    // Re-encrypting always writes under the CURRENT key, so a row that already
    // uses it is rewritten to an equivalent envelope (a fresh IV). Cheap, and
    // it keeps the script from needing to know which key opened the row.
    const next = encryptIntegrationPayload(payload);

    if (!APPLY) {
      console.log(`  ->  ${label}: would rewrite${isPlaintext ? ' (currently PLAINTEXT)' : ''}`);
      rewritten++;
      continue;
    }

    await pool.query(
      `UPDATE organization_integrations
          SET payload_encrypted = $1
        WHERE organization_id = $2
          AND provider = $3
          AND COALESCE(scope, '') = COALESCE($4, '')`,
      [next, row.organization_id, row.provider, row.scope],
    );
    rewritten++;
    console.log(`  ok  ${label}: rewritten under the current key`);
  }

  console.log(
    `\n${APPLY ? 'Rewrote' : 'Would rewrite'} ${rewritten}/${rows.length} row(s).` +
      (plaintext ? `  ${plaintext} were plaintext and are now encrypted.` : '') +
      (unreadable ? `  ${unreadable} UNREADABLE — see errors above.` : ''),
  );
  if (!APPLY && rewritten > 0) console.log('Dry run. Re-run with --apply to write.');
  if (unreadable === 0 && APPLY) {
    console.log('No row needs a previous key — INTEGRATION_KMS_KEY_PREVIOUS can be removed.');
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
